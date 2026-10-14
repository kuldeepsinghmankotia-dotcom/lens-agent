import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
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

function blockText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => (isObject(part) && typeof part.text === 'string' ? part.text : ''))
    .filter(Boolean)
    .join('\n')
}

/**
 * Reads Claude Code transcripts: ~/.claude/projects/<project>/<session-id>.jsonl.
 * Only files directly inside a project folder are read. Sub-agent transcripts live in
 * nested folders and can share a session id, so reading them would overwrite the parent.
 */
export const claudeAdapter: Adapter = {
  agent: 'claude',

  discover(root) {
    if (!existsSync(root)) return []
    const files: string[] = []
    for (const project of readdirSync(root)) {
      const dir = join(root, project)
      if (!statSync(dir).isDirectory()) continue
      for (const name of readdirSync(dir)) {
        if (name.endsWith('.jsonl')) files.push(join(dir, name))
      }
    }
    return files
  },

  parse(_file, content) {
    let sessionId: string | null = null
    let cwd: string | null = null
    let model: string | null = null
    let title: string | null = null
    const events: LensEvent[] = []
    const toolNames = new Map<string, string>()
    const usage = new Map<string, LensEvent>()

    for (const line of content.split('\n')) {
      if (!line.trim()) continue
      let entry: unknown
      try {
        entry = JSON.parse(line)
      } catch {
        continue
      }
      if (!isObject(entry)) continue

      sessionId ??= asString(entry.sessionId)
      cwd ??= asString(entry.cwd)

      if (entry.type === 'ai-title') {
        title = asString(entry.aiTitle) ?? title
        continue
      }
      if (entry.type !== 'user' && entry.type !== 'assistant') continue

      const message = entry.message
      if (!isObject(message)) continue
      const ts = Date.parse(asString(entry.timestamp) ?? '')
      if (Number.isNaN(ts)) continue
      const uuid = asString(entry.uuid) ?? `${ts}`

      if (entry.type === 'user') {
        const body = message.content
        if (typeof body === 'string') {
          if (body.trim()) events.push(makeEvent(`${uuid}:p`, ts, 'prompt', null, false, body))
          continue
        }
        if (!Array.isArray(body)) continue
        body.forEach((part, index) => {
          if (!isObject(part)) return
          if (part.type === 'tool_result') {
            const id = asString(part.tool_use_id)
            events.push(
              makeEvent(
                `${uuid}:r${index}`,
                ts,
                'tool_result',
                id ? (toolNames.get(id) ?? null) : null,
                part.is_error === true,
                blockText(part.content),
                id
              )
            )
          } else if (part.type === 'text' && typeof part.text === 'string' && part.text.trim()) {
            events.push(makeEvent(`${uuid}:p${index}`, ts, 'prompt', null, false, part.text))
          }
        })
        continue
      }

      // assistant entry
      model ??= asString(message.model)
      const body = message.content
      if (Array.isArray(body)) {
        body.forEach((part, index) => {
          if (!isObject(part)) return
          if (part.type === 'tool_use') {
            const name = asString(part.name) ?? 'unknown'
            const id = asString(part.id)
            if (id) toolNames.set(id, name)
            events.push(
              makeEvent(`${uuid}:t${index}`, ts, 'tool_call', name, false, JSON.stringify(part.input ?? {}), id)
            )
          } else if (part.type === 'text' && typeof part.text === 'string' && part.text.trim()) {
            events.push(makeEvent(`${uuid}:a${index}`, ts, 'assistant_message', null, false, part.text))
          }
        })
      }

      // One API message can be split over several transcript lines that each repeat `usage`.
      // Count it once per message id, keeping the largest figures.
      const messageId = asString(message.id)
      if (messageId && isObject(message.usage)) {
        const input =
          asNumber(message.usage.input_tokens) +
          asNumber(message.usage.cache_creation_input_tokens) +
          asNumber(message.usage.cache_read_input_tokens)
        const output = asNumber(message.usage.output_tokens)
        const existing = usage.get(messageId)
        if (!existing) {
          const event = makeEvent(`${messageId}:u`, ts, 'usage', null, false, '')
          event.inputTokens = input
          event.outputTokens = output
          usage.set(messageId, event)
        } else {
          existing.inputTokens = Math.max(existing.inputTokens, input)
          existing.outputTokens = Math.max(existing.outputTokens, output)
        }
      }
    }

    if (!sessionId) return null
    events.push(...usage.values())
    return { sessionId, agent: 'claude', cwd, model, title, events } satisfies ParsedSession
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
