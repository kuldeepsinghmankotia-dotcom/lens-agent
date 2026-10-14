import type { Store } from '../db.js'
import type { InstalledSkill } from './discover.js'

export interface SkillUsage {
  id: string
  uses: number
  sessions: number
  projects: number
  lastUsed: number
}

export interface SkillsReport {
  used: Array<{ skill: InstalledSkill | null; usage: SkillUsage }>
  unused: InstalledSkill[]
  history: { sessions: number; first: number | null; last: number | null }
}

/** Count Skill tool calls per skill id. A call with no readable skill name is ignored. */
export function skillUsage(store: Store): Map<string, SkillUsage> {
  const sessions = new Map<string, Set<string>>()
  const projects = new Map<string, Set<string>>()
  const usage = new Map<string, SkillUsage>()
  for (const row of store.skillInvocations()) {
    let id: unknown
    try {
      id = (JSON.parse(row.text) as { skill?: unknown }).skill
    } catch {
      continue
    }
    if (typeof id !== 'string' || !id) continue
    const entry = usage.get(id) ?? { id, uses: 0, sessions: 0, projects: 0, lastUsed: 0 }
    entry.uses++
    entry.lastUsed = Math.max(entry.lastUsed, row.ts)
    usage.set(id, entry)
    const s = sessions.get(id) ?? new Set<string>()
    s.add(row.session_id)
    sessions.set(id, s)
    const p = projects.get(id) ?? new Set<string>()
    if (row.cwd) p.add(row.cwd)
    projects.set(id, p)
  }
  for (const [id, entry] of usage) {
    entry.sessions = sessions.get(id)?.size ?? 0
    entry.projects = projects.get(id)?.size ?? 0
  }
  return usage
}

/**
 * Join what is installed with what was used. A skill used but not found on disk is kept
 * (it may be built in to Claude Code, removed, or from a plugin that has since changed).
 */
export function buildReport(store: Store, installed: InstalledSkill[]): SkillsReport {
  const usage = skillUsage(store)
  const byId = new Map<string, InstalledSkill>()
  for (const skill of installed) if (!byId.has(skill.id)) byId.set(skill.id, skill)

  const used = [...usage.values()]
    .sort((a, b) => b.uses - a.uses || b.lastUsed - a.lastUsed)
    .map((u) => ({ skill: byId.get(u.id) ?? null, usage: u }))
  const unused = installed.filter((s) => !usage.has(s.id)).sort((a, b) => a.id.localeCompare(b.id))
  return { used, unused, history: store.historySpan() }
}
