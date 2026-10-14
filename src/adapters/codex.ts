import { existsSync, readdirSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import type { Adapter, LensEvent, ParsedSession } from '../types.js'

type Json = Record<string, unknown>

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function partsText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => (isObject(part) && typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n')
}

/**
 * EXPERIMENTAL. Reads Codex rollout logs: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl.
 *
 * The line format below (session_meta, turn_context, response_item, event_msg) was written
 * from knowledge of Codex, not from a real log on this machine, so it is covered only by
 * hand-made fixtures. Unknown shapes are skipped rather than guessed. See docs/codex-adapter.md.
 */
export const codexAdapter: Adapter = {
  agent: 'codex',

  discover(root) {
    if (!existsSync(root)) return []
    const files: string[] = []
    const walk = (dir: string, depth: number): void => {
      if (depth > 5) return
      for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        const stats = statSync(full)
        if (stats.isDirectory()) walk(full, depth + 1)
        else if (name.startsWith('rollout-') && name.endsWith('.jsonl')) files.push(full)
      }
    }
    walk(root, 0)
    return files
  },

  parse(file, content) {
    let sessionId: string | null = null
    let cwd: string | null = null
    let model: string | null = null
    const events: LensEvent[] = []
    const callNames = new Map<string, string>()
    let lastTs = 0
    let inputTokens = 0
    let outputTokens = 0

    content.split('\n').forEach((line, lineNo) => {
      if (!line.trim()) return
      let entry: unknown
      try {
        entry = JSON.parse(line)
      } catch {
        return
      }
      if (!isObject(entry) || !isObject(entry.payload)) return

      const ts = Date.parse(asString(entry.timestamp) ?? '')
      const payload = entry.payload
      if (!Number.isNaN(ts)) lastTs = ts
      const when = Number.isNaN(ts) ? lastTs : ts
      if (when === 0) return

      if (entry.type === 'session_meta') {
        sessionId ??= asString(payload.id)
        cwd ??= asString(payload.cwd)
        return
      }
      if (entry.type === 'turn_context') {
        model ??= asString(payload.model)
        cwd ??= asString(payload.cwd)
        return
      }
      if (entry.type === 'event_msg') {
        if (payload.type === 'token_count' && isObject(payload.info)) {
          const total = payload.info.total_token_usage
          if (isObject(total)) {
            // Cumulative totals: keep the largest seen.
            inputTokens = Math.max(inputTokens, asNumber(total.input_tokens))
            outputTokens = Math.max(outputTokens, asNumber(total.output_tokens))
          }
        }
        return
      }
      if (entry.type !== 'response_item') return

      const uid = `L${lineNo}`
      if (payload.type === 'message') {
        const text = partsText(payload.content)
        if (!text.trim()) return
        if (payload.role === 'user') events.push(makeEvent(uid, when, 'prompt', null, false, text))
        else if (payload.role === 'assistant')
          events.push(makeEvent(uid, when, 'assistant_message', null, false, text))
      } else if (payload.type === 'function_call') {
        const name = asString(payload.name) ?? 'unknown'
        const callId = asString(payload.call_id)
        if (callId) callNames.set(callId, name)
        events.push(makeEvent(uid, when, 'tool_call', name, false, asString(payload.arguments) ?? '', callId))
      } else if (payload.type === 'function_call_output') {
        const callId = asString(payload.call_id)
        const output = asString(payload.output) ?? JSON.stringify(payload.output ?? '')
        events.push(
          makeEvent(uid, when, 'tool_result', callId ? (callNames.get(callId) ?? null) : null, false, output, callId)
        )
      }
    })

    sessionId ??= basename(file, '.jsonl')
    if (events.length === 0) return null
    if (inputTokens > 0 || outputTokens > 0) {
      const usage = makeEvent('usage:total', lastTs, 'usage', null, false, '')
      usage.inputTokens = inputTokens
      usage.outputTokens = outputTokens
      events.push(usage)
    }
    return { sessionId, agent: 'codex', cwd, model, title: null, events } satisfies ParsedSession
  }
}

function makeEvent(
  uid: string,
  ts: number,
  type: LensEvent['type'],
  tool: string | null,
  isError: boolean,
  text: string,
  callId: string | null = null
): LensEvent {
  return { uid, ts, type, tool, isError, text, inputTokens: 0, outputTokens: 0, callId }
}
