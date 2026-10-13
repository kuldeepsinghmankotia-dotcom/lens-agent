#!/usr/bin/env node
import { randomBytes } from 'node:crypto'
import { Store } from './db.js'
import { sync } from './ingest.js'
import { dbPath } from './paths.js'
import { createDashboard } from './server.js'
import type { SessionRow } from './types.js'
import { applyMemories } from './memory/apply.js'
import {
  addMemory,
  editMemory,
  forgetMemory,
  listMemories,
  projectKey,
  setStatus,
  type MemoryRow
} from './memory/store.js'
import { suggestMemories } from './memory/suggest.js'

const HELP = `lens - see what your coding agents did (everything stays on this machine)

Usage:
  lens init                     Create the local database and import existing sessions
  lens sync                     Import new or changed sessions (Claude Code, Codex)
  lens status                   Show totals
  lens sessions [--agent claude|codex] [--limit N]
  lens show <session-id>        Show one session (an id prefix is enough)
  lens dashboard [--port N]     Open the local dashboard (127.0.0.1 only)
  lens purge --yes [--memories] Delete captured sessions (memories too with --memories)

Memory (per project folder; --project <path> picks another folder):
  lens remember "text"          Save a memory for this project
  lens memory list [--all]      Show memories (--all includes suggested and rejected)
  lens memory suggest           Propose memories from this project's sessions
  lens memory accept <id>       Keep a suggestion
  lens memory reject <id>       Dismiss a suggestion for good
  lens memory edit <id> "text"  Change the wording
  lens memory forget <id>       Delete one memory
  lens memory apply [--dry-run] Write accepted memories into AGENTS.md and CLAUDE.md
  lens --help
`

function flag(args: string[], name: string): string | undefined {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}

function pad(value: string | number, width: number): string {
  const text = String(value)
  return text.length >= width ? text.slice(0, width) : text + ' '.repeat(width - text.length)
}

function printSessions(rows: SessionRow[]): void {
  if (rows.length === 0) {
    console.log('No sessions stored. Run "lens sync" first.')
    return
  }
  console.log(`${pad('ID', 11)}${pad('AGENT', 8)}${pad('STARTED', 18)}${pad('TOOLS', 7)}${pad('ERR', 5)}${pad('TOKENS', 10)}TITLE`)
  for (const s of rows) {
    const started = new Date(s.started_at).toISOString().slice(0, 16).replace('T', ' ')
    console.log(
      `${pad(s.id.slice(0, 10), 11)}${pad(s.agent, 8)}${pad(started, 18)}${pad(s.tool_calls, 7)}${pad(s.errors, 5)}${pad(
        s.input_tokens + s.output_tokens,
        10
      )}${s.title ?? '(untitled)'}`
    )
  }
}

function printMemories(rows: MemoryRow[]): void {
  if (rows.length === 0) {
    console.log('No memories yet. Try: lens remember "we use Vitest" or lens memory suggest')
    return
  }
  for (const m of rows) {
    console.log(`${pad(m.id, 5)}${pad(m.status, 10)}${m.text}`)
  }
}

function memoryId(value: string | undefined): number {
  const id = Number(value)
  if (!Number.isInteger(id) || id < 1) throw new Error('Give a memory id, e.g. lens memory accept 3')
  return id
}

function runMemory(store: Store, args: string[]): void {
  const [sub, ...rest] = args
  const project = projectKey(flag(rest, '--project') ?? process.cwd())
  switch (sub) {
    case 'list': {
      printMemories(listMemories(store, project, rest.includes('--all') ? undefined : ['accepted', 'suggested']))
      break
    }
    case 'suggest': {
      const created = suggestMemories(store, project)
      console.log(created.length ? `${created.length} new suggestion(s):` : 'No new suggestions.')
      for (const text of created) console.log(`  ${text}`)
      if (created.length) console.log('Review with "lens memory list", then accept or reject by id.')
      break
    }
    case 'accept':
    case 'reject': {
      const id = memoryId(rest[0])
      if (!setStatus(store, id, sub === 'accept' ? 'accepted' : 'rejected')) throw new Error(`No memory ${id}.`)
      console.log(`Memory ${id} ${sub === 'accept' ? 'accepted' : 'rejected'}.`)
      break
    }
    case 'edit': {
      const id = memoryId(rest[0])
      if (!rest[1]) throw new Error('Usage: lens memory edit <id> "new text"')
      if (!editMemory(store, id, rest[1])) throw new Error(`No memory ${id}.`)
      console.log(`Memory ${id} updated.`)
      break
    }
    case 'forget': {
      const id = memoryId(rest[0])
      if (!forgetMemory(store, id)) throw new Error(`No memory ${id}.`)
      console.log(`Memory ${id} deleted.`)
      break
    }
    case 'apply': {
      const accepted = listMemories(store, project, ['accepted']).map((m) => m.text)
      const dryRun = rest.includes('--dry-run')
      for (const r of applyMemories(project, accepted, dryRun)) {
        console.log(`${dryRun ? '[dry run] ' : ''}${r.action.padEnd(9)} ${r.file}${r.note ? ` (${r.note})` : ''}`)
      }
      console.log(`${accepted.length} accepted memor${accepted.length === 1 ? 'y' : 'ies'} in the block.`)
      break
    }
    default:
      throw new Error('Usage: lens memory list|suggest|accept|reject|edit|forget|apply')
  }
}

function printSync(store: Store): void {
  const r = sync(store)
  const agents = Object.entries(r.perAgent)
    .map(([name, n]) => `${name}: ${n}`)
    .join(', ')
  console.log(
    `Scanned ${r.scanned} files: imported ${r.imported}${agents ? ` (${agents})` : ''}, unchanged ${r.skipped}, failed ${r.failed}.`
  )
}

function main(): void {
  const [command, ...args] = process.argv.slice(2)
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    console.log(HELP)
    return
  }

  const store = new Store(dbPath())
  try {
    switch (command) {
      case 'init':
        console.log(`Data directory: ${dbPath()}`)
        printSync(store)
        console.log('Next: "lens sessions" or "lens dashboard".')
        break
      case 'sync':
        printSync(store)
        break
      case 'status': {
        const s = store.stats()
        const agents = Object.entries(s.byAgent)
          .map(([name, n]) => `${name}: ${n}`)
          .join(', ')
        console.log(`Sessions:   ${s.sessions}${agents ? ` (${agents})` : ''}`)
        console.log(`Prompts:    ${s.prompts}`)
        console.log(`Tool calls: ${s.toolCalls}`)
        console.log(`Errors:     ${s.errors}`)
        console.log(`Tokens:     ${s.inputTokens + s.outputTokens} (input ${s.inputTokens}, output ${s.outputTokens})`)
        console.log(`Database:   ${dbPath()}`)
        break
      }
      case 'sessions': {
        const limit = Number(flag(args, '--limit') ?? 20)
        printSessions(store.listSessions({ agent: flag(args, '--agent'), limit: Number.isFinite(limit) ? limit : 20 }))
        break
      }
      case 'show': {
        const id = args[0]
        if (!id) throw new Error('Usage: lens show <session-id>')
        const session = store.findSession(id)
        if (!session) throw new Error(`No unique session matches "${id}". Try "lens sessions".`)
        console.log(`${session.title ?? '(untitled)'}`)
        console.log(`${session.agent} · ${session.model ?? 'unknown model'} · ${session.cwd ?? ''}`)
        console.log(`${session.prompts} prompts, ${session.tool_calls} tool calls, ${session.errors} errors\n`)
        for (const e of store.listEvents(session.id)) {
          if (e.type === 'usage') continue
          const label = e.tool ? `${e.type}:${e.tool}` : e.type
          const text = e.text.replace(/\s+/g, ' ').slice(0, 160)
          console.log(`${new Date(e.ts).toISOString().slice(11, 19)}  ${e.is_error ? '!' : ' '} ${pad(label, 22)} ${text}`)
        }
        break
      }
      case 'dashboard': {
        printSync(store)
        const token = randomBytes(24).toString('hex')
        const requested = Number(flag(args, '--port') ?? 4821)
        const port = Number.isInteger(requested) && requested >= 0 && requested < 65536 ? requested : 4821
        let boundPort = port
        const server = createDashboard(store, token, () => boundPort)
        server.listen(port, '127.0.0.1', () => {
          const address = server.address()
          if (address && typeof address === 'object') boundPort = address.port
          console.log(`Dashboard: http://127.0.0.1:${boundPort}/?token=${token}`)
          console.log('Local only. Press Ctrl+C to stop.')
        })
        return // keep the process and database open while serving
      }
      case 'remember': {
        const text = args.filter((a, i) => a !== '--project' && args[i - 1] !== '--project').join(' ')
        const project = projectKey(flag(args, '--project') ?? process.cwd())
        const { memory, created } = addMemory(store, project, text, 'manual', 'accepted')
        console.log(`${created ? 'Saved' : 'Already saved'} as memory ${memory.id}. Run "lens memory apply" to write it to AGENTS.md and CLAUDE.md.`)
        break
      }
      case 'memory':
        runMemory(store, args)
        break
      case 'purge': {
        if (!args.includes('--yes')) throw new Error('This deletes captured sessions. Re-run: lens purge --yes')
        const withMemories = args.includes('--memories')
        store.purge(withMemories)
        console.log(
          `Captured sessions deleted${withMemories ? ' and memories deleted' : '; memories kept (add --memories to delete them)'}. Your agents' own session files were not touched.`
        )
        break
      }
      default:
        throw new Error(`Unknown command "${command}". Run "lens --help".`)
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
  store.close()
}

main()
