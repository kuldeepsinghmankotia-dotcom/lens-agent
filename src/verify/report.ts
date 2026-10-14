import { sanitize } from '../redact.js'
import type { SessionRow } from '../types.js'
import { sortByVerdict, type ClaimResult } from './engine.js'

export function renderReport(session: SessionRow, results: ClaimResult[]): string[] {
  const title = session.title ?? '(untitled)'
  const lines = [`Session ${session.id.slice(0, 8)}  ${title}  [${session.agent}]`]
  if (results.length === 0) {
    lines.push('  No "tests pass" style claims found.')
    return lines
  }
  for (const r of sortByVerdict(results)) {
    lines.push(`  ${r.verdict.padEnd(12)} ${r.kind.padEnd(9)} "${sanitize(r.quote)}"`)
    lines.push(`  ${' '.repeat(12)} ${' '.repeat(9)} ${sanitize(r.reason)}`)
  }
  return lines
}
