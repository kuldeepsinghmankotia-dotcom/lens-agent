import { claudeDir, codexDir } from '../paths.js'
import type { Adapter } from '../types.js'
import { claudeAdapter } from './claude.js'
import { codexAdapter } from './codex.js'

export interface Source {
  adapter: Adapter
  root: string
}

/** Every agent lens-agent can read. Adding an agent means adding one entry here. */
export function sources(): Source[] {
  return [
    { adapter: claudeAdapter, root: claudeDir() },
    { adapter: codexAdapter, root: codexDir() }
  ]
}
