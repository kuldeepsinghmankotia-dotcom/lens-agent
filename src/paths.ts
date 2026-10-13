import { homedir } from 'node:os'
import { join } from 'node:path'

/** Where lens-agent keeps its own data. Override with LENS_HOME. */
export function lensHome(): string {
  return process.env.LENS_HOME ?? join(homedir(), '.lens-agent')
}

export function dbPath(): string {
  return join(lensHome(), 'lens.db')
}

/** Where Claude Code writes session transcripts. Override with LENS_CLAUDE_DIR. */
export function claudeDir(): string {
  return process.env.LENS_CLAUDE_DIR ?? join(homedir(), '.claude', 'projects')
}

/** Where Codex writes session logs. Override with LENS_CODEX_DIR. */
export function codexDir(): string {
  return process.env.LENS_CODEX_DIR ?? join(homedir(), '.codex', 'sessions')
}
