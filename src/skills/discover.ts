import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export type SkillScope = 'user' | 'plugin' | 'project'

export interface InstalledSkill {
  /** What a Skill tool call names: `plugin:skill` for plugin skills, the plain name otherwise. */
  id: string
  scope: SkillScope
  /** Plugin name for plugin skills. */
  source: string
  description: string
  path: string
}

/** Read `name` and `description` from the YAML-style header of a SKILL.md. Reads nothing else. */
export function parseFrontmatter(content: string): { name?: string; description?: string } {
  if (!content.startsWith('---')) return {}
  const end = content.indexOf('\n---', 3)
  if (end === -1) return {}
  const lines = content.slice(3, end).split('\n')
  const out: { name?: string; description?: string } = {}
  for (let i = 0; i < lines.length; i++) {
    const match = /^(name|description):\s*(.*)$/.exec(lines[i] ?? '')
    if (!match) continue
    const key = match[1] as 'name' | 'description'
    let value = (match[2] ?? '').trim()
    if (value === '>' || value === '|' || value === '>-' || value === '|-' || value === '') {
      const parts: string[] = []
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1] ?? '')) parts.push((lines[++i] ?? '').trim())
      value = parts.join(' ')
    }
    out[key] = value.replace(/^["']|["']$/g, '')
  }
  return out
}

function subdirs(dir: string): string[] {
  if (!existsSync(dir)) return []
  try {
    return readdirSync(dir).filter((name) => {
      try {
        return statSync(join(dir, name)).isDirectory()
      } catch {
        return false
      }
    })
  } catch {
    return []
  }
}

function readSkillsIn(skillsDir: string, scope: SkillScope, source: string): InstalledSkill[] {
  const found: InstalledSkill[] = []
  for (const dirName of subdirs(skillsDir)) {
    const file = join(skillsDir, dirName, 'SKILL.md')
    if (!existsSync(file)) continue
    let meta: { name?: string; description?: string } = {}
    try {
      meta = parseFrontmatter(readFileSync(file, 'utf8'))
    } catch {
      // unreadable file: still list the skill by its folder name
    }
    const name = meta.name || dirName
    found.push({
      id: scope === 'plugin' ? `${source}:${name}` : name,
      scope,
      source,
      description: (meta.description ?? '').replace(/\s+/g, ' ').slice(0, 110),
      path: file
    })
  }
  return found
}

/** Compare version folder names like "0.50.0" and "6.4.1" numerically, newest last. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10))
  const pb = b.split('.').map((n) => Number.parseInt(n, 10))
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (Number.isNaN(x) || Number.isNaN(y)) return a.localeCompare(b)
    if (x !== y) return x - y
  }
  return 0
}

/**
 * Skills installed for Claude Code: ~/.claude/skills, the newest version of each plugin in
 * ~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/skills, and optionally a project's
 * .claude/skills. Read only.
 */
export function discoverSkills(claudeHome: string, projectDir?: string): InstalledSkill[] {
  const skills: InstalledSkill[] = [...readSkillsIn(join(claudeHome, 'skills'), 'user', 'user')]

  const cache = join(claudeHome, 'plugins', 'cache')
  for (const marketplace of subdirs(cache)) {
    for (const plugin of subdirs(join(cache, marketplace))) {
      const versions = subdirs(join(cache, marketplace, plugin)).sort(compareVersions)
      const newest = versions[versions.length - 1]
      if (newest) skills.push(...readSkillsIn(join(cache, marketplace, plugin, newest, 'skills'), 'plugin', plugin))
    }
  }
  if (projectDir) skills.push(...readSkillsIn(join(projectDir, '.claude', 'skills'), 'project', 'project'))

  // The same plugin can be cached under several marketplaces; keep one entry per id.
  const seen = new Set<string>()
  return skills.filter((s) => (seen.has(`${s.scope}:${s.id}`) ? false : (seen.add(`${s.scope}:${s.id}`), true)))
}
