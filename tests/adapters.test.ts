import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { claudeAdapter } from '../src/adapters/claude.js'
import { codexAdapter } from '../src/adapters/codex.js'

const fixtures = join(import.meta.dirname, 'fixtures')

describe('claude adapter', () => {
  const root = join(fixtures, 'claude')
  const files = claudeAdapter.discover(root)

  it('discovers session files', () => {
    expect(files).toHaveLength(1)
    expect(claudeAdapter.discover(join(fixtures, 'missing'))).toEqual([])
  })

  const parsed = claudeAdapter.parse(files[0]!, readFileSync(files[0]!, 'utf8'))!

  it('reads session metadata', () => {
    expect(parsed.sessionId).toBe('sess-claude-1')
    expect(parsed.cwd).toBe('/demo/project')
    expect(parsed.model).toBe('claude-demo')
    expect(parsed.title).toBe('Fix login bug')
  })

  it('reads prompts, tool calls and errors, and skips bad lines', () => {
    const count = (type: string) => parsed.events.filter((e) => e.type === type).length
    expect(count('prompt')).toBe(1)
    expect(count('tool_call')).toBe(1)
    expect(count('tool_result')).toBe(1)
    const result = parsed.events.find((e) => e.type === 'tool_result')!
    expect(result.isError).toBe(true)
    expect(result.tool).toBe('Bash')
  })

  it('counts usage once per API message, keeping the largest figures', () => {
    const usage = parsed.events.filter((e) => e.type === 'usage')
    expect(usage).toHaveLength(2)
    const total = usage.reduce((n, e) => n + e.inputTokens + e.outputTokens, 0)
    expect(total).toBe(100 + 50 + 40 + 200 + 20)
  })

  it('returns null when there is no session id', () => {
    expect(claudeAdapter.parse('x.jsonl', '{"type":"user"}\n')).toBeNull()
  })
})

describe('codex adapter (fixture is hand-made, not a real Codex log)', () => {
  const files = codexAdapter.discover(join(fixtures, 'codex'))

  it('discovers rollout files', () => {
    expect(files).toHaveLength(1)
  })

  const parsed = codexAdapter.parse(files[0]!, readFileSync(files[0]!, 'utf8'))!

  it('reads metadata, messages and tool calls', () => {
    expect(parsed.sessionId).toBe('sess-codex-1')
    expect(parsed.model).toBe('codex-demo')
    expect(parsed.events.filter((e) => e.type === 'prompt')).toHaveLength(1)
    expect(parsed.events.filter((e) => e.type === 'tool_call')[0]!.tool).toBe('shell')
    expect(parsed.events.find((e) => e.type === 'tool_result')!.tool).toBe('shell')
  })

  it('uses the final cumulative token count', () => {
    const usage = parsed.events.find((e) => e.type === 'usage')!
    expect(usage.inputTokens).toBe(500)
    expect(usage.outputTokens).toBe(60)
  })

  it('returns null for a file with no usable events', () => {
    expect(codexAdapter.parse('rollout-x.jsonl', 'garbage\n')).toBeNull()
  })
})
