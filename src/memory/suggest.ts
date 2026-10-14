import { relative } from 'node:path'
import type { Store } from '../db.js'
import { addMemory, projectKey } from './store.js'

// A prompt that states a lasting rule on its own.
const STRONG =
  /\b(?:always|never|from now on|going forward|in this (?:project|repo|codebase)|by default|we (?:always |only )?(?:use|prefer))\b/i
// A prompt that may be a rule or may be a one-off remark: only trusted if it repeats.
const WEAK = /^(?:please\s+)?(?:don'?t|do not|stop|make sure|remember)\b/i
// Phrasing that marks a remark as belonging to one moment, not to the project.
const ONE_OFF = /\b(?:this time|for now|right now|today|tonight|just this|this once|let'?s)\b|\?/i
const DEFAULT_MIN_SESSIONS = 3
const WEAK_MIN_SESSIONS = 2
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

export interface SuggestOptions {
  /** Sessions a command or file must appear in. Default 3. */
  minSessions?: number
}

/** Classify a prompt as a stated rule. Exported for tests. */
export function instructionStrength(prompt: string): 'strong' | 'weak' | null {
  const text = prompt.replace(/\s+/g, ' ').trim()
  if (text.length === 0 || text.length > 200 || ONE_OFF.test(text)) return null
  if (STRONG.test(text)) return 'strong'
  return WEAK.test(text) ? 'weak' : null
}

/**
 * Propose memories for a project from its captured sessions, using fixed rules only.
 * New proposals are stored as `suggested`. Anything already known (in any status,
 * including rejected) is not proposed again. Returns only the newly created ones.
 */
export function suggestMemories(store: Store, project: string, options: SuggestOptions = {}): string[] {
  const minSessions = Math.max(1, Math.floor(options.minSessions ?? DEFAULT_MIN_SESSIONS))
  const root = projectKey(project)
  const instructions = new Map<string, { text: string; strong: boolean; sessions: Set<string> }>()
  const commands = new Map<string, Set<string>>()
  const files = new Map<string, Set<string>>()

  for (const session of store.sessionsForProject(root)) {
    for (const event of store.listEvents(session.id)) {
      if (event.type === 'prompt') {
        const strength = instructionStrength(event.text)
        if (strength) {
          const text = event.text.replace(/\s+/g, ' ').trim()
          const key = text.toLowerCase().replace(/[’']/g, '')
          const entry = instructions.get(key) ?? { text, strong: strength === 'strong', sessions: new Set() }
          entry.sessions.add(session.id)
          instructions.set(key, entry)
        }
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
  for (const { text, strong, sessions } of instructions.values()) {
    if (strong || sessions.size >= WEAK_MIN_SESSIONS) candidates.push(`You asked: ${text}`)
  }
  for (const [command, sessions] of commands) {
    if (sessions.size >= minSessions) candidates.push(`Command used often: ${command}`)
  }
  for (const [file, sessions] of files) {
    if (sessions.size >= minSessions) candidates.push(`File changed in ${sessions.size} sessions: ${file}`)
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
