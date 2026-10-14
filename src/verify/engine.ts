import type { EventRow } from '../types.js'
import { findClaims, type Kind } from './claims.js'
import { classifyCommand } from './commands.js'
import { testOutcome } from './output.js'

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
  chain: boolean
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
 * Did this run pass, as far as one kind of claim is concerned?
 * Uses the exit status when it can be attributed to the command, and the test runner's own
 * summary line when it cannot (pipes, `;`, heredocs) or when the exit status is not enough.
 */
function judge(run: Run, kind: Kind, resultSeen: boolean): { passed: boolean | null; via: string } {
  const result = resultSeen ? run.result : undefined
  if (!result) return { passed: null, via: 'no result' }
  const summary = kind === 'tests' ? testOutcome(result.text) : null
  if (summary === 'fail') return { passed: false, via: 'output shows failures' }
  const exit = outcome(result)
  if (!run.uncertain) {
    if (exit === true) return { passed: true, via: run.chain ? 'every step of the chain exited 0' : 'exit 0' }
    if (exit === false) {
      // In a chain the failure may be a different step; the output can still show the tests passed.
      if (run.chain && summary === 'pass') return { passed: true, via: 'output shows tests passed' }
      return run.chain ? { passed: null, via: 'chain failed at an unknown step' } : { passed: false, via: 'non-zero exit' }
    }
    return { passed: null, via: 'no clear result' }
  }
  if (summary === 'pass') return { passed: true, via: 'output shows tests passed' }
  return { passed: null, via: 'compound or piped command, no summary in output' }
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
      // A very long command is cut in storage and no longer parses as JSON. Read what is left,
      // but never trust its exit status.
      const truncated = event.tool === 'Bash' && input === null
      const command = typeof input?.command === 'string' ? input.command : truncated ? event.text : null
      if (event.tool === 'Bash' && command !== null) {
        let info = classifyCommand(command)
        // Cut in storage and no runner visible: it may have hidden one. Count it as an
        // unreadable run, so older runs are not used as if nothing had happened since.
        if (!info && truncated && command.includes('[truncated]')) {
          info = { kinds: ['tests', 'build', 'lint', 'typecheck'], maybeKinds: [], uncertain: true, chain: false }
        }
        if (info) {
          runs.push({
            index,
            kinds: info.kinds,
            maybeKinds: info.maybeKinds,
            uncertain: info.uncertain || truncated,
            chain: info.chain && !truncated,
            result: event.call_id ? resultByCall.get(event.call_id)?.row : undefined,
            resultIndex: event.call_id ? (resultByCall.get(event.call_id)?.index ?? Infinity) : Infinity,
            command: command.replace(/\s+/g, ' ').slice(0, 80)
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
      const { passed, via } = latest
        ? judge(latest, claim.kind, latest.resultIndex < index)
        : { passed: null, via: '' }
      const maybe = runs.filter((r) => r.maybeKinds.includes(claim.kind)).pop()
      if (!latest && maybe) {
        results.push({ ...base, verdict: 'UNKNOWN', reason: `${maybe.command} may include a ${claim.kind} step; the project's scripts decide` })
      } else if (!latest) {
        results.push({ ...base, verdict: 'UNSUPPORTED', reason: `no ${claim.kind} command ran before this` })
      } else if (passed === false) {
        results.push({ ...base, verdict: 'CONTRADICTED', reason: `${via}: ${latest.command}` })
      } else if (passed === null) {
        results.push({ ...base, verdict: 'UNKNOWN', reason: `${via}: ${latest.command}` })
      } else if (edits.some((i) => i > latest.index && i < index)) {
        results.push({ ...base, verdict: 'STALE', reason: `code edited after: ${latest.command} (${via})` })
      } else {
        results.push({ ...base, verdict: 'SUPPORTED', reason: `${latest.command}: ${via}, no later edits` })
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
