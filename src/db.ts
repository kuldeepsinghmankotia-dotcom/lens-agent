import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { EventRow, ParsedSession, SessionRow } from './types.js'
import { sanitize, TOOL_CALL_MAX } from './redact.js'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  agent TEXT NOT NULL,
  cwd TEXT,
  model TEXT,
  title TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  prompts INTEGER NOT NULL,
  tool_calls INTEGER NOT NULL,
  errors INTEGER NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  ts INTEGER NOT NULL,
  type TEXT NOT NULL,
  tool TEXT,
  is_error INTEGER NOT NULL,
  text TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  call_id TEXT,
  UNIQUE (session_id, uid)
);
CREATE INDEX IF NOT EXISTS events_session_ts ON events (session_id, ts, id);
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (project, text)
);
CREATE TABLE IF NOT EXISTS files (
  path TEXT PRIMARY KEY,
  size INTEGER NOT NULL,
  mtime INTEGER NOT NULL
);
`

export class Store {
  private db: DatabaseSync

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    this.db = new DatabaseSync(path)
    this.db.exec(SCHEMA)
    this.migrate()
  }

  /**
   * Databases made before call_id existed get the column and are re-imported on the next
   * sync (the file cache is cleared), so old events pick up their ids.
   */
  private migrate(): void {
    const columns = this.db.prepare('PRAGMA table_info(events)').all() as unknown as Array<{ name: string }>
    if (!columns.some((c) => c.name === 'call_id')) {
      this.db.exec('ALTER TABLE events ADD COLUMN call_id TEXT')
      this.db.exec('DELETE FROM files')
    }
    // Version 3: results keep their tail and tool calls keep up to 30000 characters.
    // Re-import once so old rows gain them.
    const version = (this.db.prepare('PRAGMA user_version').get() as unknown as { user_version: number }).user_version
    if (version < 3) {
      this.db.exec('DELETE FROM files')
      this.db.exec('PRAGMA user_version = 3')
    }
  }

  /** Raw handle for modules that own their own tables (memory). */
  get handle(): DatabaseSync {
    return this.db
  }

  close(): void {
    this.db.close()
  }

  /** True when this file was already ingested at this size and modification time. */
  isFileCurrent(path: string, size: number, mtime: number): boolean {
    const row = this.db.prepare('SELECT size, mtime FROM files WHERE path = ?').get(path) as
      | { size: number; mtime: number }
      | undefined
    return row !== undefined && row.size === size && row.mtime === mtime
  }

  markFile(path: string, size: number, mtime: number): void {
    this.db
      .prepare('INSERT OR REPLACE INTO files (path, size, mtime) VALUES (?, ?, ?)')
      .run(path, size, mtime)
  }

  /** Replace everything stored for a session. Safe to call again with the same session. */
  saveSession(parsed: ParsedSession): void {
    const events = [...parsed.events].sort((a, b) => a.ts - b.ts)
    if (events.length === 0) return

    const prompts = events.filter((e) => e.type === 'prompt').length
    const toolCalls = events.filter((e) => e.type === 'tool_call').length
    const errors = events.filter((e) => e.isError).length
    const inputTokens = events.reduce((n, e) => n + e.inputTokens, 0)
    const outputTokens = events.reduce((n, e) => n + e.outputTokens, 0)
    const first = events[0]!
    const last = events[events.length - 1]!
    const firstPrompt = events.find((e) => e.type === 'prompt')?.text ?? null
    const title = (parsed.title ?? firstPrompt)?.replace(/\s+/g, ' ').slice(0, 120) ?? null

    this.db.exec('BEGIN')
    try {
      this.db.prepare('DELETE FROM events WHERE session_id = ?').run(parsed.sessionId)
      this.db.prepare('DELETE FROM sessions WHERE id = ?').run(parsed.sessionId)
      this.db
        .prepare(
          `INSERT INTO sessions (id, agent, cwd, model, title, started_at, ended_at, prompts,
             tool_calls, errors, input_tokens, output_tokens)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          parsed.sessionId,
          parsed.agent,
          parsed.cwd,
          parsed.model,
          title === null ? null : sanitize(title),
          first.ts,
          last.ts,
          prompts,
          toolCalls,
          errors,
          inputTokens,
          outputTokens
        )
      const insert = this.db.prepare(
        `INSERT OR IGNORE INTO events (session_id, uid, ts, type, tool, is_error, text,
           input_tokens, output_tokens, call_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      for (const e of events) {
        insert.run(
          parsed.sessionId,
          e.uid,
          e.ts,
          e.type,
          e.tool,
          e.isError ? 1 : 0,
          sanitize(e.text, e.type === 'tool_call' ? TOOL_CALL_MAX : undefined),
          e.inputTokens,
          e.outputTokens,
          e.callId
        )
      }
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  listSessions(options: { agent?: string; limit?: number } = {}): SessionRow[] {
    const limit = Math.max(1, Math.min(options.limit ?? 50, 500))
    if (options.agent) {
      return this.db
        .prepare('SELECT * FROM sessions WHERE agent = ? ORDER BY started_at DESC LIMIT ?')
        .all(options.agent, limit) as unknown as SessionRow[]
    }
    return this.db
      .prepare('SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?')
      .all(limit) as unknown as SessionRow[]
  }

  /** Find a session by full id or a unique id prefix. */
  findSession(idOrPrefix: string): SessionRow | null {
    const exact = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(idOrPrefix)
    if (exact) return exact as unknown as SessionRow
    const escaped = idOrPrefix.replace(/[\\%_]/g, '\\$&')
    const matches = this.db
      .prepare("SELECT * FROM sessions WHERE id LIKE ? ESCAPE '\\' LIMIT 2")
      .all(`${escaped}%`) as unknown as SessionRow[]
    return matches.length === 1 ? matches[0]! : null
  }

  listEvents(sessionId: string): EventRow[] {
    return this.db
      .prepare('SELECT * FROM events WHERE session_id = ? ORDER BY ts, id')
      .all(sessionId) as unknown as EventRow[]
  }

  stats(): {
    sessions: number
    prompts: number
    toolCalls: number
    errors: number
    inputTokens: number
    outputTokens: number
    byAgent: Record<string, number>
  } {
    const totals = this.db
      .prepare(
        `SELECT COUNT(*) AS sessions, COALESCE(SUM(prompts), 0) AS prompts,
           COALESCE(SUM(tool_calls), 0) AS toolCalls, COALESCE(SUM(errors), 0) AS errors,
           COALESCE(SUM(input_tokens), 0) AS inputTokens,
           COALESCE(SUM(output_tokens), 0) AS outputTokens
         FROM sessions`
      )
      .get() as unknown as {
      sessions: number
      prompts: number
      toolCalls: number
      errors: number
      inputTokens: number
      outputTokens: number
    }
    const rows = this.db
      .prepare('SELECT agent, COUNT(*) AS n FROM sessions GROUP BY agent')
      .all() as unknown as Array<{ agent: string; n: number }>
    const byAgent: Record<string, number> = {}
    for (const row of rows) byAgent[row.agent] = row.n
    return { ...totals, byAgent }
  }

  /** Every Skill tool call in captured sessions, with its session and working folder. */
  skillInvocations(): Array<{ session_id: string; ts: number; cwd: string | null; text: string }> {
    return this.db
      .prepare(
        `SELECT e.session_id, e.ts, s.cwd, e.text FROM events e
         JOIN sessions s ON s.id = e.session_id
         WHERE e.type = 'tool_call' AND e.tool = 'Skill' ORDER BY e.ts`
      )
      .all() as unknown as Array<{ session_id: string; ts: number; cwd: string | null; text: string }>
  }

  /** Earliest and latest session start, for saying how much history a report covers. */
  historySpan(): { sessions: number; first: number | null; last: number | null } {
    return this.db
      .prepare('SELECT COUNT(*) AS sessions, MIN(started_at) AS first, MAX(started_at) AS last FROM sessions')
      .get() as unknown as { sessions: number; first: number | null; last: number | null }
  }

  /** Sessions whose working folder is `project` or inside it. */
  sessionsForProject(project: string): SessionRow[] {
    const escaped = project.replace(/[\\%_]/g, '\\$&')
    return this.db
      .prepare("SELECT * FROM sessions WHERE cwd = ? OR cwd LIKE ? ESCAPE '\\' ORDER BY started_at")
      .all(project, `${escaped}/%`) as unknown as SessionRow[]
  }

  /** Deletes captured sessions. Curated memories are kept unless `includeMemories` is set. */
  purge(includeMemories = false): void {
    this.db.exec('DELETE FROM events; DELETE FROM sessions; DELETE FROM files;')
    if (includeMemories) this.db.exec('DELETE FROM memories;')
    this.db.exec('VACUUM')
  }
}
