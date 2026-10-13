import { relative } from 'node:path'
import type { Store } from '../db.js'
import { addMemory, projectKey } from './store.js'

const INSTRUCTION = /^(?:please\s+)?(?:don'?t|do not|never|always|stop|make sure|remember)\b/i
const MIN_SESSIONS = 3
const MAX_NEW = 10
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])

function parseInput(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text)
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
  } catch {
    return null // truncated or not JSON: skip rather than guess
  }
}

/** Count in how many distinct sessions each key appears. */
function bump(map: Map<string, Set<string>>, key: string, sessionId: string): void {
  const set = map.get(key) ?? new Set<string>()
  set.add(sessionId)
  map.set(key, set)
}

/**
 * Propose memories for a project from its captured sessions, using fixed rules only.
 * New proposals are stored as `suggested`. Anything already known (in any status,
 * including rejected) is not proposed again. Returns only the newly created ones.
 */
export function suggestMemories(store: Store, project: string): string[] {
  const root = projectKey(project)
  const instructions: string[] = []
  const commands = new Map<string, Set<string>>()
  const files = new Map<string, Set<string>>()

  for (const session of store.sessionsForProject(root)) {
    for (const event of store.listEvents(session.id)) {
      if (event.type === 'prompt') {
        const text = event.text.replace(/\s+/g, ' ').trim()
        if (text.length <= 200 && INSTRUCTION.test(text)) instructions.push(text)
      } else if (event.type === 'tool_call' && event.tool) {
        const input = parseInput(event.text)
        if (!input) continue
        if (event.tool === 'Bash' && typeof input.command === 'string') {
          const command = input.command.replace(/\s+/g, ' ').trim()
          if (command.length <= 80 && !command.includes('[REDACTED')) bump(commands, command, session.id)
        } else if (EDIT_TOOLS.has(event.tool) && typeof input.file_path === 'string') {
          const rel = relative(root, input.file_path)
          if (rel && !rel.startsWith('..')) bump(files, rel, session.id)
        }
      }
    }
  }

  const candidates: string[] = []
  for (const text of new Set(instructions)) candidates.push(`You asked: ${text}`)
  for (const [command, sessions] of commands) {
    if (sessions.size >= MIN_SESSIONS) candidates.push(`Command used often: ${command}`)
  }
  for (const [file, sessions] of files) {
    if (sessions.size >= MIN_SESSIONS) candidates.push(`File changed in ${sessions.size} sessions: ${file}`)
  }

  const created: string[] = []
  for (const candidate of candidates) {
    if (created.length >= MAX_NEW) break
    try {
      const { memory, created: isNew } = addMemory(store, root, candidate, 'suggestion', 'suggested')
      if (isNew) created.push(memory.text)
    } catch {
      // a candidate that fails normalisation (for example too long) is simply skipped
    }
  }
  return created
}
