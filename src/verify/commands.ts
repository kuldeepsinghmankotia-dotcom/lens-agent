import type { Kind } from './claims.js'

export interface CommandInfo {
  kinds: Kind[]
  /** Kinds the command might also have run, depending on the project's own scripts. */
  maybeKinds: Kind[]
  /** True when the exit status may belong to a different part of the command. */
  uncertain: boolean
}

const RUNNERS: Array<[Kind[], RegExp]> = [
  [['tests', 'build', 'lint', 'typecheck'], /\bnpm\s+(?:run\s+)?check\b/],
  [['tests'], /\bnpm\s+(?:run\s+)?test\b/],
  [['tests'], /\b(?:npx\s+)?(?:vitest|jest|mocha)\b/],
  [['tests'], /\b(?:python3?\s+-m\s+)?pytest\b/],
  [['tests'], /\bgo\s+test\b/],
  [['tests'], /\bcargo\s+test\b/],
  [['tests'], /\b(?:bash|sh|node)\s+\S*test\S*\.(?:sh|js|mjs|cjs)\b/],
  [['build'], /\bnpm\s+run\s+build\b/],
  [['build'], /\btsc\s+(?:-p|--project)\b/],
  [['build'], /\bcargo\s+build\b/],
  [['build'], /\bgo\s+build\b/],
  [['lint'], /\bnpm\s+run\s+lint\b/],
  [['lint'], /\beslint\b/],
  [['lint'], /\bruff\s+check\b/],
  [['lint'], /\bgolangci-lint\b/],
  [['typecheck'], /\btsc\b[^|&;]*--noEmit\b/],
  [['typecheck'], /\bmypy\b/]
]

/**
 * Is this shell command a test, build, lint or type-check run? Returns null if not.
 * A leading `cd <dir> &&` is ignored. Any other `&&`, `||`, `;` or pipe makes the exit
 * status uncertain, because it may come from a different command (for example `| tail`).
 */
export function classifyCommand(command: string): CommandInfo | null {
  const cleaned = command.replace(/^\s*cd\s+\S+\s*&&\s*/, '').trim()
  const kinds = new Set<Kind>()
  for (const [runnerKinds, pattern] of RUNNERS) {
    if (pattern.test(cleaned)) for (const k of runnerKinds) kinds.add(k)
  }
  if (kinds.size === 0) return null
  const withoutRedirects = cleaned.replace(/\d*>&\d+|\d*>\s*\S+/g, '')
  // `npm run lint` is eslint in some projects and `tsc --noEmit` in others. Only the
  // project's package.json says which, so a type-check is possible but not proven.
  const maybeKinds: Kind[] = /\bnpm\s+run\s+lint\b/.test(cleaned) && !kinds.has('typecheck') ? ['typecheck'] : []
  return { kinds: [...kinds], maybeKinds, uncertain: /&&|\|\||;|\|/.test(withoutRedirects) }
}
