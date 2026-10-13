import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const START = '<!-- lens-agent:start -->'
export const END = '<!-- lens-agent:end -->'
const HEADING = '## Project memory (managed by lens-agent)'

export interface ApplyResult {
  file: string
  action: 'created' | 'updated' | 'unchanged' | 'removed' | 'skipped'
  note?: string
}

export function renderBlock(memories: string[]): string {
  const lines = memories.map((m) => `- ${m}`)
  return `${START}\n${HEADING}\n\n${lines.join('\n')}\n${END}`
}

/**
 * Put `block` (or nothing, if null) into `content`. Only text between the markers is ever
 * replaced. Returns null when nothing should change.
 */
export function mergeBlock(content: string, block: string | null): string | null {
  const start = content.indexOf(START)
  const end = content.indexOf(END)
  const hasBlock = start !== -1 && end > start

  if (block === null) {
    if (!hasBlock) return null
    const before = content.slice(0, start).replace(/\n+$/, '')
    const after = content.slice(end + END.length).replace(/^\n+/, '')
    const joined = before && after ? `${before}\n\n${after}` : `${before}${after}`
    return joined.endsWith('\n') || joined === '' ? joined : `${joined}\n`
  }
  if (hasBlock) {
    const next = content.slice(0, start) + block + content.slice(end + END.length)
    return next === content ? null : next
  }
  const base = content.replace(/\n+$/, '')
  return `${base}${base ? '\n\n' : ''}${block}\n`
}

function realOrSelf(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

/**
 * Write accepted memories into AGENTS.md and CLAUDE.md in `dir`.
 * - A symlink or duplicate pointing at the same file is written once.
 * - If CLAUDE.md imports @AGENTS.md, only AGENTS.md is written.
 * - With no memories, the managed block is removed and nothing else is changed.
 */
export function applyMemories(dir: string, memories: string[], dryRun: boolean): ApplyResult[] {
  const block = memories.length > 0 ? renderBlock(memories) : null
  const agents = join(dir, 'AGENTS.md')
  const claude = join(dir, 'CLAUDE.md')
  const results: ApplyResult[] = []
  const done = new Set<string>()

  const claudeImportsAgents =
    existsSync(claude) && /^@AGENTS\.md\s*$/m.test(readFileSync(claude, 'utf8'))

  for (const file of [agents, claude]) {
    if (file === claude && claudeImportsAgents) {
      results.push({ file, action: 'skipped', note: 'imports @AGENTS.md' })
      continue
    }
    const target = realOrSelf(file)
    if (done.has(target)) {
      results.push({ file, action: 'skipped', note: 'same file as another target' })
      continue
    }
    done.add(target)

    const exists = existsSync(target)
    const current = exists ? readFileSync(target, 'utf8') : ''
    if (!exists && block === null) {
      results.push({ file, action: 'unchanged' })
      continue
    }
    const next = mergeBlock(current, block)
    if (next === null) {
      results.push({ file, action: 'unchanged' })
      continue
    }
    if (!dryRun) writeFileSync(target, next)
    results.push({ file, action: block === null ? 'removed' : exists ? 'updated' : 'created' })
  }
  return results
}
