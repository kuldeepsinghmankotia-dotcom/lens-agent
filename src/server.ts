import { readFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import type { Store } from './db.js'

const INDEX_URL = new URL('./dashboard/index.html', import.meta.url)

function tokenMatches(given: string | null | undefined, expected: string): boolean {
  if (!given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function send(res: ServerResponse, status: number, type: string, body: string): void {
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'content-security-policy':
      "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'"
  })
  res.end(body)
}

function json(res: ServerResponse, status: number, value: unknown): void {
  send(res, status, 'application/json; charset=utf-8', JSON.stringify(value))
}

/** Reject requests whose Host header is not loopback. This blocks DNS-rebinding attacks. */
function hostAllowed(req: IncomingMessage, port: number): boolean {
  const host = req.headers.host
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`
}

/**
 * Read-only dashboard API. Binds to loopback only (the caller passes the host), requires a
 * per-run token, sets no CORS headers, and never writes to the store.
 */
export function createDashboard(store: Store, token: string, getPort: () => number): Server {
  return createServer((req, res) => {
    try {
      if (req.method !== 'GET') return json(res, 405, { error: 'method not allowed' })
      if (!hostAllowed(req, getPort())) return json(res, 403, { error: 'bad host' })

      const url = new URL(req.url ?? '/', 'http://127.0.0.1')

      if (url.pathname === '/') {
        if (!tokenMatches(url.searchParams.get('token'), token)) {
          return send(res, 401, 'text/plain; charset=utf-8', 'Unauthorized. Use the link printed by `lens dashboard`.')
        }
        return send(res, 200, 'text/html; charset=utf-8', readFileSync(INDEX_URL, 'utf8'))
      }

      if (!url.pathname.startsWith('/api/')) return json(res, 404, { error: 'not found' })
      const bearer = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1]
      if (!tokenMatches(bearer, token)) return json(res, 401, { error: 'unauthorized' })

      if (url.pathname === '/api/stats') return json(res, 200, store.stats())
      if (url.pathname === '/api/sessions') {
        const limit = Number(url.searchParams.get('limit') ?? 100)
        return json(res, 200, store.listSessions({ limit: Number.isFinite(limit) ? limit : 100 }))
      }
      const match = /^\/api\/sessions\/([^/]+)$/.exec(url.pathname)
      if (match) {
        const session = store.findSession(decodeURIComponent(match[1]!))
        if (!session) return json(res, 404, { error: 'session not found' })
        return json(res, 200, { session, events: store.listEvents(session.id) })
      }
      return json(res, 404, { error: 'not found' })
    } catch {
      return json(res, 500, { error: 'internal error' })
    }
  })
}
