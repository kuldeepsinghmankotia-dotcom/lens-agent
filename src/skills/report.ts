import type { SkillsReport } from './usage.js'

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function renderSkillsReport(report: SkillsReport, options: { showUnused: boolean }): string[] {
  const { used, unused, history } = report
  const lines: string[] = []
  const installedCount = used.filter((u) => u.skill).length + unused.length
  const span =
    history.first !== null && history.last !== null
      ? `${history.sessions} captured session${history.sessions === 1 ? '' : 's'}, ${day(history.first)} to ${day(history.last)}`
      : 'no captured sessions'
  lines.push(`${installedCount} skills installed. Usage is based on ${span}.`)
  lines.push('A skill showing as unused may simply be newer than that history.')
  lines.push('')

  if (used.length === 0) {
    lines.push('No skill use found in captured sessions. Run "lens sync" first.')
  } else {
    lines.push(`${'SKILL'.padEnd(40)}${'WHERE'.padEnd(11)}${'USES'.padEnd(6)}${'SESSIONS'.padEnd(10)}${'PROJECTS'.padEnd(10)}LAST USED`)
    for (const { skill, usage } of used) {
      const where = skill ? skill.scope : 'not found'
      lines.push(
        `${usage.id.slice(0, 38).padEnd(40)}${where.padEnd(11)}${String(usage.uses).padEnd(6)}${String(usage.sessions).padEnd(10)}${String(usage.projects).padEnd(10)}${day(usage.lastUsed)}`
      )
    }
    if (used.some((u) => !u.skill)) {
      lines.push('"not found": used in a session but not installed here (built in to Claude Code, removed, or renamed).')
    }
  }

  lines.push('')
  if (options.showUnused) {
    lines.push(`Installed but not used (${unused.length}):`)
    for (const s of unused) lines.push(`  ${s.id.padEnd(46)} ${s.description}`)
  } else {
    const bySource = new Map<string, number>()
    for (const s of unused) bySource.set(s.source, (bySource.get(s.source) ?? 0) + 1)
    const summary = [...bySource.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => `${name} ${n}`).join(', ')
    lines.push(`Installed but not used: ${unused.length}${summary ? ` (${summary})` : ''}. List them with: lens skills --unused`)
  }
  return lines
}
