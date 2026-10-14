import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { Store } from '../src/db.js'
import type { EventRow } from '../src/types.js'
import { findClaims } from '../src/verify/claims.js'
import { classifyCommand } from '../src/verify/commands.js'
import { hasProblems, verifySession } from '../src/verify/engine.js'

describe('findClaims', () => {
  it.each([
    ['All 52 tests pass.', 'tests'],
    ['The tests are passing now.', 'tests'],
    ['Result: 73 passed (73)', 'tests'],
    ['Build succeeds and lint is clean.', 'build'],
    ['The type-check is clean.', 'typecheck'],
    ['No lint errors remain.', 'lint']
  ])('finds a claim in "%s"', (text, kind) => {
    expect(findClaims(text).map((c) => c.kind)).toContain(kind)
  })

  it.each([
    'Done.',
    'I fixed the bug.',
    "The tests don't pass yet.",
    'Run the tests to make sure they pass.',
    'Tests should pass once the migration runs.',
    'Do all tests pass?',
    'Three tests failed, so I am looking into it.',
    'I will make the build succeed.',
    'No tests were run.'
  ])('ignores "%s"', (text) => {
    expect(findClaims(text)).toEqual([])
  })

  it('returns one claim per sentence per kind', () => {
    const claims = findClaims('Lint is clean. The build succeeds.\n- All tests pass.')
    expect(claims.map((c) => c.kind).sort()).toEqual(['build', 'lint', 'tests'])
  })
})

describe('classifyCommand', () => {
  it.each([
    ['npm test', ['tests'], false],
    ['npm run build', ['build'], false],
    ['cd ~/proj && npm test', ['tests'], false],
    ['npx vitest run tests/a.test.ts', ['tests'], false],
    ['npx tsc --noEmit', ['typecheck'], false],
    ['npm run check', ['tests', 'build', 'lint', 'typecheck'], false],
    ['npm test 2>&1 | tail -5', ['tests'], true],
    ['npm run lint && npm test', ['tests', 'lint'], true],
    ['npm test 2>&1', ['tests'], false]
  ] as const)('%s', (command, kinds, uncertain) => {
    const info = classifyCommand(command)!
    expect([...info.kinds].sort()).toEqual([...kinds].sort())
    expect(info.uncertain).toBe(uncertain)
  })

  it('returns null for unrelated commands', () => {
    expect(classifyCommand('ls -la')).toBeNull()
    expect(classifyCommand('git status')).toBeNull()
    expect(classifyCommand('echo "npm test"')).not.toBeNull() // known limit: a quoted mention still matches
  })
})

let n = 0
function ev(type: EventRow['type'], text: string, extra: Partial<EventRow> = {}): EventRow {
  n++
  return { id: n, session_id: 's', ts: n, type, tool: null, is_error: 0, text, input_tokens: 0, output_tokens: 0, call_id: null, ...extra }
}
const bash = (command: string, id: string) => ev('tool_call', JSON.stringify({ command }), { tool: 'Bash', call_id: id })
const ok = (id: string) => ev('tool_result', 'all good', { tool: 'Bash', call_id: id })
const fail = (id: string) => ev('tool_result', 'Exit code 1\nFAIL', { tool: 'Bash', call_id: id, is_error: 1 })
const edit = (file = '/p/src/a.ts') => ev('tool_call', JSON.stringify({ file_path: file }), { tool: 'Edit' })
const say = (text: string) => ev('assistant_message', text)
const verdicts = (agent: string, events: EventRow[]) => verifySession(agent, events).map((r) => r.verdict)

describe('verifySession (claude)', () => {
  it('SUPPORTED: a passing run and no edits afterwards', () => {
    expect(verdicts('claude', [bash('npm test', 'a'), ok('a'), say('All tests pass.')])).toEqual(['SUPPORTED'])
  })
  it('UNSUPPORTED: claim with no matching command', () => {
    expect(verdicts('claude', [edit(), say('All tests pass.')])).toEqual(['UNSUPPORTED'])
  })
  it('UNSUPPORTED: only a different kind of command ran', () => {
    expect(verdicts('claude', [bash('npm run build', 'a'), ok('a'), say('All tests pass.')])).toEqual(['UNSUPPORTED'])
  })
  it('CONTRADICTED: the latest run failed', () => {
    expect(verdicts('claude', [bash('npm test', 'a'), fail('a'), say('All tests pass.')])).toEqual(['CONTRADICTED'])
  })
  it('SUPPORTED: failed first, then fixed and re-run', () => {
    const events = [bash('npm test', 'a'), fail('a'), edit(), bash('npm test', 'b'), ok('b'), say('All tests pass.')]
    expect(verdicts('claude', events)).toEqual(['SUPPORTED'])
  })
  it('STALE: code edited after the passing run', () => {
    expect(verdicts('claude', [bash('npm test', 'a'), ok('a'), edit(), say('All tests pass.')])).toEqual(['STALE'])
  })
  it('editing prose after the run does not make it stale', () => {
    expect(verdicts('claude', [bash('npm test', 'a'), ok('a'), edit('/p/README.md'), say('All tests pass.')])).toEqual(['SUPPORTED'])
  })
  it('only evidence BEFORE the claim counts', () => {
    expect(verdicts('claude', [say('All tests pass.'), bash('npm test', 'a'), ok('a')])).toEqual(['UNSUPPORTED'])
  })
  it('a result that arrives after the claim is not evidence for it', () => {
    expect(verdicts('claude', [bash('npm test', 'a'), say('All tests pass.'), ok('a')])).toEqual(['UNKNOWN'])
    expect(verdicts('claude', [bash('npm test', 'a'), say('All tests pass.'), fail('a')])).toEqual(['UNKNOWN'])
  })
  it('UNKNOWN: piped command, even when it looks fine', () => {
    expect(verdicts('claude', [bash('npm test | tail -3', 'a'), ok('a'), say('All tests pass.')])).toEqual(['UNKNOWN'])
  })
  it('UNKNOWN: run has no result or an unclear error', () => {
    expect(verdicts('claude', [bash('npm test', 'a'), say('All tests pass.')])).toEqual(['UNKNOWN'])
    const denied = ev('tool_result', "The user doesn't want to proceed", { tool: 'Bash', call_id: 'a', is_error: 1 })
    expect(verdicts('claude', [bash('npm test', 'a'), denied, say('All tests pass.')])).toEqual(['UNKNOWN'])
  })
  it('npm run lint might have been a type-check, so a type-check claim is UNKNOWN, not UNSUPPORTED', () => {
    expect(verdicts('claude', [bash('npm run lint', 'a'), ok('a'), say('The type-check is clean.')])).toEqual(['UNKNOWN'])
    expect(verdicts('claude', [bash('npm run lint', 'a'), ok('a'), say('Lint is clean.')])).toEqual(['SUPPORTED'])
    expect(verdicts('claude', [bash('npm run build', 'a'), ok('a'), say('The type-check is clean.')])).toEqual(['UNSUPPORTED'])
  })
  it('npm run check supports every kind', () => {
    const events = [bash('npm run check', 'a'), ok('a'), say('Lint is clean. The build succeeds. All tests pass.')]
    expect(verdicts('claude', events)).toEqual(['SUPPORTED', 'SUPPORTED', 'SUPPORTED'])
  })
  it('a result is matched to its own call, not just the nearest one', () => {
    const events = [bash('npm test', 'a'), bash('npm run build', 'b'), fail('b'), ok('a'), say('All tests pass.')]
    expect(verdicts('claude', events)).toEqual(['SUPPORTED'])
  })
  it('hasProblems flags CONTRADICTED and UNSUPPORTED only', () => {
    expect(hasProblems(verifySession('claude', [say('All tests pass.')]))).toBe(true)
    expect(hasProblems(verifySession('claude', [bash('npm test', 'a'), ok('a'), say('All tests pass.')]))).toBe(false)
    expect(hasProblems(verifySession('claude', [bash('npm test | tail', 'a'), ok('a'), say('All tests pass.')]))).toBe(false)
  })
})

describe('verifySession (codex, logs unverified)', () => {
  it('never says SUPPORTED', () => {
    const events = [bash('npm test', 'a'), ok('a'), say('All tests pass.')]
    expect(verdicts('codex', events)).toEqual(['UNKNOWN'])
  })
})

describe('call_id migration', () => {
  it('adds the column to an old database and clears the file cache so it re-imports', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'lens-mig-')), 'old.db')
    const old = new DatabaseSync(path)
    old.exec(`CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, uid TEXT NOT NULL,
      ts INTEGER NOT NULL, type TEXT NOT NULL, tool TEXT, is_error INTEGER NOT NULL, text TEXT NOT NULL,
      input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL, UNIQUE (session_id, uid));
      CREATE TABLE files (path TEXT PRIMARY KEY, size INTEGER NOT NULL, mtime INTEGER NOT NULL);
      INSERT INTO files VALUES ('/x', 1, 1);`)
    old.close()
    const store = new Store(path)
    const cols = store.handle.prepare('PRAGMA table_info(events)').all() as unknown as Array<{ name: string }>
    expect(cols.some((c) => c.name === 'call_id')).toBe(true)
    expect(store.isFileCurrent('/x', 1, 1)).toBe(false)
    store.close()
    const again = new Store(path) // opening a migrated database again must not fail
    again.close()
  })
})
