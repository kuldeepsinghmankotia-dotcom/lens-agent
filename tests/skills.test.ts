import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Store } from '../src/db.js'
import { compareVersions, discoverSkills, parseFrontmatter } from '../src/skills/discover.js'
import { renderSkillsReport } from '../src/skills/report.js'
import { buildReport, skillUsage } from '../src/skills/usage.js'
import type { LensEvent } from '../src/types.js'

function skill(dir: string, folder: string, header: string): void {
  mkdirSync(join(dir, folder), { recursive: true })
  writeFileSync(join(dir, folder, 'SKILL.md'), `${header}\n\n# Body that must never be read\n`)
}

describe('parseFrontmatter', () => {
  it('reads name and description', () => {
    expect(parseFrontmatter('---\nname: foo\ndescription: Does a thing\n---\nbody')).toEqual({ name: 'foo', description: 'Does a thing' })
  })
  it('handles quotes and folded descriptions', () => {
    const text = '---\nname: "bar"\ndescription: >\n  First line\n  second line\n---\n'
    expect(parseFrontmatter(text)).toEqual({ name: 'bar', description: 'First line second line' })
  })
  it('returns nothing for files without a header', () => {
    expect(parseFrontmatter('# Just markdown')).toEqual({})
    expect(parseFrontmatter('---\nname: x')).toEqual({})
  })
})

describe('compareVersions', () => {
  it('compares numerically, not as text', () => {
    expect(['0.9.0', '0.50.0', '0.10.1'].sort(compareVersions)).toEqual(['0.9.0', '0.10.1', '0.50.0'])
  })
})

describe('discoverSkills', () => {
  const home = mkdtempSync(join(tmpdir(), 'lens-skills-'))
  skill(join(home, 'skills'), 'my-skill', '---\nname: my-skill\ndescription: Mine\n---')
  skill(join(home, 'skills'), 'no-header', '# no frontmatter')
  const plugin = (version: string) => join(home, 'plugins', 'cache', 'market', 'acme', version, 'skills')
  skill(plugin('1.2.0'), 'old', '---\nname: old\ndescription: Old version only\n---')
  skill(plugin('1.10.0'), 'new', '---\nname: new\ndescription: Newest\n---')
  mkdirSync(join(home, 'skills', 'empty-dir'))
  const project = mkdtempSync(join(tmpdir(), 'lens-proj-'))
  skill(join(project, '.claude', 'skills'), 'local', '---\nname: local\ndescription: Project skill\n---')

  const found = discoverSkills(home, project)
  const ids = found.map((s) => s.id).sort()

  it('finds user, plugin and project skills with the right ids', () => {
    expect(ids).toEqual(['acme:new', 'local', 'my-skill', 'no-header'])
  })
  it('keeps only the newest plugin version', () => {
    expect(ids).not.toContain('acme:old')
  })
  it('falls back to the folder name and ignores folders without SKILL.md', () => {
    expect(found.find((s) => s.id === 'no-header')!.description).toBe('')
    expect(ids).not.toContain('empty-dir')
  })
  it('does not include project skills unless a project is given', () => {
    expect(discoverSkills(home).map((s) => s.id)).not.toContain('local')
  })
  it('returns nothing for a missing home', () => {
    expect(discoverSkills(join(home, 'does-not-exist'))).toEqual([])
  })
  it('never reads the skill body into its output', () => {
    expect(JSON.stringify(found)).not.toContain('must never be read')
  })
})

function call(uid: string, ts: number, skillName: string | null): LensEvent {
  return {
    uid, ts, type: 'tool_call', tool: 'Skill', isError: false, inputTokens: 0, outputTokens: 0, callId: null,
    text: skillName === null ? 'not json' : JSON.stringify({ skill: skillName })
  }
}
function session(store: Store, id: string, cwd: string, events: LensEvent[]): void {
  store.saveSession({ sessionId: id, agent: 'claude', cwd, model: null, title: null, events })
}

describe('skill usage', () => {
  const store = new Store(':memory:')
  session(store, 's1', '/a', [call('1', 1000, 'acme:new'), call('2', 2000, 'acme:new'), call('3', 3000, 'builtin-thing')])
  session(store, 's2', '/b', [
    call('1', 4000, 'acme:new'),
    call('2', 5000, null),
    { ...call('3', 5500, null), text: '{}' },
    { ...call('4', 5600, null), text: JSON.stringify({ skill: 42 }) }
  ])

  it('counts uses, sessions, projects and last use per skill, ignoring unreadable calls', () => {
    const usage = skillUsage(store).get('acme:new')!
    expect(usage).toMatchObject({ uses: 3, sessions: 2, projects: 2, lastUsed: 4000 })
    expect(skillUsage(store).size).toBe(2)
  })

  const installed = discoverSkills(
    (() => {
      const h = mkdtempSync(join(tmpdir(), 'lens-skills2-'))
      skill(join(h, 'plugins', 'cache', 'm', 'acme', '1.0.0', 'skills'), 'new', '---\nname: new\n---')
      skill(join(h, 'plugins', 'cache', 'm', 'acme', '1.0.0', 'skills'), 'idle', '---\nname: idle\ndescription: Never used\n---')
      return h
    })()
  )
  const report = buildReport(store, installed)

  it('separates used, unused and used-but-not-installed skills', () => {
    expect(report.used.map((u) => [u.usage.id, u.skill?.scope ?? null])).toEqual([['acme:new', 'plugin'], ['builtin-thing', null]])
    expect(report.unused.map((s) => s.id)).toEqual(['acme:idle'])
  })

  it('renders an honest summary and a not-found note', () => {
    const text = renderSkillsReport(report, { showUnused: false }).join('\n')
    expect(text).toContain('2 skills installed')
    expect(text).toContain('2 captured sessions')
    expect(text).toContain('newer than that history')
    expect(text).toContain('not found')
    expect(text).toContain('Installed but not used: 1 (acme 1)')
  })

  it('lists unused skills with descriptions on request', () => {
    const text = renderSkillsReport(report, { showUnused: true }).join('\n')
    expect(text).toContain('acme:idle')
    expect(text).toContain('Never used')
  })

  it('says so plainly with no history', () => {
    const empty = buildReport(new Store(':memory:'), installed)
    const text = renderSkillsReport(empty, { showUnused: false }).join('\n')
    expect(text).toContain('no captured sessions')
    expect(text).toContain('No skill use found')
  })
})
