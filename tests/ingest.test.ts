import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Store } from '../src/db.js'
import { sync } from '../src/ingest.js'

const fixtures = join(import.meta.dirname, 'fixtures')

describe('sync and store', () => {
  let store: Store
  beforeEach(() => {
    process.env.LENS_CLAUDE_DIR = join(fixtures, 'claude')
    process.env.LENS_CODEX_DIR = join(fixtures, 'codex')
    store = new Store(':memory:')
  })
  afterEach(() => {
    delete process.env.LENS_CLAUDE_DIR
    delete process.env.LENS_CODEX_DIR
    store.close()
  })

  it('imports sessions from both agents', () => {
    const result = sync(store)
    expect(result.imported).toBe(2)
    expect(result.failed).toBe(0)
    expect(result.perAgent).toEqual({ claude: 1, codex: 1 })
    expect(store.stats().sessions).toBe(2)
    expect(store.stats().byAgent).toEqual({ claude: 1, codex: 1 })
  })

  it('is idempotent: a second sync imports nothing and creates no duplicates', () => {
    sync(store)
    const again = sync(store)
    expect(again.imported).toBe(0)
    expect(again.skipped).toBe(2)
    expect(store.stats().sessions).toBe(2)
  })

  it('computes session totals', () => {
    sync(store)
    const s = store.findSession('sess-claude-1')!
    expect(s.tool_calls).toBe(1)
    expect(s.errors).toBe(1)
    expect(s.prompts).toBe(1)
    expect(s.input_tokens + s.output_tokens).toBe(410)
  })

  it('redacts secrets before storing', () => {
    sync(store)
    const events = store.listEvents('sess-claude-1')
    const prompt = events.find((e) => e.type === 'prompt')!
    expect(prompt.text).not.toContain('sk-ant-abcdef')
    expect(prompt.text).toContain('[REDACTED_KEY]')
  })

  it('finds a session by unique prefix and rejects ambiguous or unknown ones', () => {
    sync(store)
    expect(store.findSession('sess-claude')!.id).toBe('sess-claude-1')
    expect(store.findSession('sess-')).toBeNull() // matches two sessions
    expect(store.findSession('nope')).toBeNull()
    expect(store.findSession('%')).toBeNull() // LIKE wildcard must not match everything
  })

  it('purge removes everything', () => {
    sync(store)
    store.purge()
    expect(store.stats().sessions).toBe(0)
    expect(store.listEvents('sess-claude-1')).toEqual([])
  })
})
