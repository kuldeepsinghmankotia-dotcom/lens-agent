import { resolve } from 'node:path'
import type { Store } from '../db.js'
import { normalizeMemoryText } from './text.js'

export type MemoryStatus = 'suggested' | 'accepted' | 'rejected'
export type MemorySource = 'manual' | 'suggestion'

export interface MemoryRow {
  id: number
  project: string
  text: string
  status: MemoryStatus
  source: MemorySource
  created_at: number
  updated_at: number
}

export function projectKey(path: string): string {
  return resolve(path)
}

export function addMemory(
  store: Store,
  project: string,
  rawText: string,
  source: MemorySource,
  status: MemoryStatus
): { memory: MemoryRow; created: boolean } {
  const key = projectKey(project)
  const text = normalizeMemoryText(rawText)
  const existing = store.handle
    .prepare('SELECT * FROM memories WHERE project = ? AND text = ?')
    .get(key, text) as MemoryRow | undefined

  if (existing) {
    // The user typing something themselves overrides an earlier suggestion or rejection.
    if (source === 'manual' && existing.status !== 'accepted') {
      setStatus(store, existing.id, 'accepted')
      return { memory: getMemory(store, existing.id)!, created: false }
    }
    return { memory: existing, created: false }
  }

  const now = Date.now()
  const info = store.handle
    .prepare(
      'INSERT INTO memories (project, text, status, source, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(key, text, status, source, now, now)
  return { memory: getMemory(store, Number(info.lastInsertRowid))!, created: true }
}

export function getMemory(store: Store, id: number): MemoryRow | undefined {
  return store.handle.prepare('SELECT * FROM memories WHERE id = ?').get(id) as MemoryRow | undefined
}

export function listMemories(store: Store, project: string, statuses?: MemoryStatus[]): MemoryRow[] {
  const rows = store.handle
    .prepare('SELECT * FROM memories WHERE project = ? ORDER BY id')
    .all(projectKey(project)) as unknown as MemoryRow[]
  return statuses ? rows.filter((r) => statuses.includes(r.status)) : rows
}

export function setStatus(store: Store, id: number, status: MemoryStatus): boolean {
  const info = store.handle
    .prepare('UPDATE memories SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, Date.now(), id)
  return Number(info.changes) > 0
}

export function editMemory(store: Store, id: number, rawText: string): boolean {
  const text = normalizeMemoryText(rawText)
  try {
    const info = store.handle
      .prepare('UPDATE memories SET text = ?, updated_at = ? WHERE id = ?')
      .run(text, Date.now(), id)
    return Number(info.changes) > 0
  } catch {
    throw new Error('Another memory in this project already has that text.')
  }
}

export function forgetMemory(store: Store, id: number): boolean {
  const info = store.handle.prepare('DELETE FROM memories WHERE id = ?').run(id)
  return Number(info.changes) > 0
}
