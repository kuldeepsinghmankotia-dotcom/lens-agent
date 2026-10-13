import { readFileSync, statSync } from 'node:fs'
import { sources } from './adapters/index.js'
import type { Store } from './db.js'

export interface SyncResult {
  scanned: number
  imported: number
  skipped: number
  failed: number
  perAgent: Record<string, number>
}

/**
 * Read every agent's session files and store them. Files that have not changed since the
 * last sync are skipped. One bad file never stops the others.
 */
export function sync(store: Store): SyncResult {
  const result: SyncResult = { scanned: 0, imported: 0, skipped: 0, failed: 0, perAgent: {} }

  for (const { adapter, root } of sources()) {
    for (const file of adapter.discover(root)) {
      result.scanned++
      try {
        const stats = statSync(file)
        const mtime = Math.floor(stats.mtimeMs)
        if (store.isFileCurrent(file, stats.size, mtime)) {
          result.skipped++
          continue
        }
        const parsed = adapter.parse(file, readFileSync(file, 'utf8'))
        if (parsed) {
          store.saveSession(parsed)
          result.imported++
          result.perAgent[adapter.agent] = (result.perAgent[adapter.agent] ?? 0) + 1
        }
        store.markFile(file, stats.size, mtime)
      } catch {
        result.failed++
      }
    }
  }
  return result
}
