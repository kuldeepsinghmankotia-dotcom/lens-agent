import type { EventRow } from '../types.js'
import { findClaims, type Kind } from './claims.js'
import { classifyCommand } from './commands.js'

export type Verdict = 'SUPPORTED' | 'STALE' | 'CONTRADICTED' | 'UNSUPPORTED' | 'UNKNOWN'

export interface ClaimResult {
  kind: Kind
  quote: string
  ts: number
  verdict: Verdict
  reason: string
}

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
// Editing prose does not change whether code still passes.
const PROSE = /\.(?:md|txt|rst)$/i

interface Run {
  index: number
  kinds: Kind[]
  maybeKinds: Kind[]
  uncertain: boolean
  /** The result row and where it sits in the timeline, if the command has one. */
  result: EventRow | undefined
  resultIndex: number
  command: string
}

function parse(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text)
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** A failed Bash call is flagged and starts with "Exit code N". Anything else is unknown. */
function outcome(result: EventRow | undefined): boolean | null {
  if (!result) return null
  if (!result.is_error) return true
  return /^\s*Exit code [1-9]\d*/.test(result.text) ? false : null
}

/**
 * Compare what the agent claimed against what the session shows.
 * Only Claude Code is judged: its tool names, error flag and edit tools are verified against
 * real transcripts. Codex logs are not verified yet, so every Codex claim is UNKNOWN.
 * Only events before a claim count as evidence for it.
 */
export function verifySession(agent: string, events: EventRow[]): ClaimResult[] {
  const ordered = [...events].sort((a, b) => a.ts - b.ts || a.id - b.id)
  const results: ClaimResult[] = []
  const resultByCall = new Map<string, { row: EventRow; index: number }>()
  ordered.forEach((e, index) => {
    if (e.type === 'tool_result' && e.call_id) resultByCall.set(e.call_id, { row: e, index })
  })

  const runs: Run[] = []
  const edits: number[] = []

  ordered.forEach((event, index) => {
    if (event.type === 'tool_call' && agent === 'claude') {
      const input = parse(event.text)
      if (event.tool === 'Bash' && typeof input?.command === 'string') {
        const info = classifyCommand(input.command)
        if (info) {
          runs.push({
            index,
            kinds: info.kinds,
            maybeKinds: info.maybeKinds,
            uncertain: info.uncertain,
            result: event.call_id ? resultByCall.get(event.call_id)?.row : undefined,
            resultIndex: event.call_id ? (resultByCall.get(event.call_id)?.index ?? Infinity) : Infinity,
            command: input.command.replace(/\s+/g, ' ').slice(0, 80)
          })
        }
      } else if (event.tool && EDIT_TOOLS.has(event.tool)) {
        const file = typeof input?.file_path === 'string' ? input.file_path : null
        if (!file || !PROSE.test(file)) edits.push(index)
      }
      return
    }

    if (event.type !== 'assistant_message') return
    for (const claim of findClaims(event.text)) {
      const base = { kind: claim.kind, quote: claim.quote, ts: event.ts }
      if (agent !== 'claude') {
        results.push({ ...base, verdict: 'UNKNOWN', reason: `${agent} logs are not verified yet` })
        continue
      }
      const earlier = runs.filter((r) => r.kinds.includes(claim.kind))
      const latest = earlier[earlier.length - 1]
      // A result that arrives after the claim is not evidence the agent had when it spoke.
      const passed = latest && latest.resultIndex < index ? outcome(latest.result) : null
      const maybe = runs.filter((r) => r.maybeKinds.includes(claim.kind)).pop()
      if (!latest && maybe) {
        results.push({ ...base, verdict: 'UNKNOWN', reason: `${maybe.command} may include a ${claim.kind} step; the project's scripts decide` })
      } else if (!latest) {
        results.push({ ...base, verdict: 'UNSUPPORTED', reason: `no ${claim.kind} command ran before this` })
      } else if (passed === false) {
        results.push({ ...base, verdict: 'CONTRADICTED', reason: `latest run failed: ${latest.command}` })
      } else if (passed === null || latest.uncertain) {
        const why = latest.uncertain ? 'compound or piped command' : 'no clear result'
        results.push({ ...base, verdict: 'UNKNOWN', reason: `${why}: ${latest.command}` })
      } else if (edits.some((i) => i > latest.index && i < index)) {
        results.push({ ...base, verdict: 'STALE', reason: `code edited after: ${latest.command}` })
      } else {
        results.push({ ...base, verdict: 'SUPPORTED', reason: `${latest.command} passed, no later edits` })
      }
    }
  })
  return results
}

const ORDER: Verdict[] = ['CONTRADICTED', 'UNSUPPORTED', 'STALE', 'UNKNOWN', 'SUPPORTED']

export function sortByVerdict(results: ClaimResult[]): ClaimResult[] {
  return [...results].sort((a, b) => ORDER.indexOf(a.verdict) - ORDER.indexOf(b.verdict) || a.ts - b.ts)
}

/** True when anything in the list should make a script or hook fail. */
export function hasProblems(results: ClaimResult[]): boolean {
  return results.some((r) => r.verdict === 'CONTRADICTED' || r.verdict === 'UNSUPPORTED')
}
