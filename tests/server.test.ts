import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Store } from '../src/db.js'
import { sync } from '../src/ingest.js'
import { createDashboard } from '../src/server.js'

const fixtures = join(import.meta.dirname, 'fixtures')
const TOKEN = 'test-token-123'

describe('dashboard server', () => {
  let server: Server
  let port = 0
  let store: Store

  beforeAll(async () => {
    process.env.LENS_CLAUDE_DIR = join(fixtures, 'claude')
    process.env.LENS_CODEX_DIR = join(fixtures, 'codex')
    store = new Store(':memory:')
    sync(store)
    server = createDashboard(store, TOKEN, () => port)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as AddressInfo).port
  })
  afterAll(() => {
    server.close()
    store.close()
    delete process.env.LENS_CLAUDE_DIR
    delete process.env.LENS_CODEX_DIR
  })

  const get = (path: string, headers: Record<string, string> = {}) =>
    fetch(`http://127.0.0.1:${port}${path}`, { headers })

  it('binds to loopback only', () => {
    expect((server.address() as AddressInfo).address).toBe('127.0.0.1')
  })

  it('serves the page only with the token', async () => {
    expect((await get('/')).status).toBe(401)
    expect((await get('/?token=wrong')).status).toBe(401)
    const ok = await get(`/?token=${TOKEN}`)
    expect(ok.status).toBe(200)
    expect(await ok.text()).toContain('lens-agent')
  })

  it('requires a bearer token for the API', async () => {
    expect((await get('/api/stats')).status).toBe(401)
    expect((await get('/api/stats', { authorization: 'Bearer wrong' })).status).toBe(401)
    const res = await get('/api/stats', { authorization: `Bearer ${TOKEN}` })
    expect(res.status).toBe(200)
    expect((await res.json()).sessions).toBe(2)
  })

  it('does not set CORS headers', async () => {
    const res = await get('/api/stats', { authorization: `Bearer ${TOKEN}` })
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('returns a session with events, and 404 for unknown ids', async () => {
    const auth = { authorization: `Bearer ${TOKEN}` }
    const ok = await get('/api/sessions/sess-claude-1', auth)
    expect(ok.status).toBe(200)
    expect((await ok.json()).events.length).toBeGreaterThan(0)
    expect((await get('/api/sessions/unknown', auth)).status).toBe(404)
  })

  it('rejects a non-loopback Host header (DNS rebinding)', async () => {
    const { request } = await import('node:http')
    const status = await new Promise<number>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path: '/api/stats', headers: { host: 'evil.example.com', authorization: `Bearer ${TOKEN}` } }, (res) => {
        res.resume()
        resolve(res.statusCode ?? 0)
      })
      req.on('error', reject)
      req.end()
    })
    expect(status).toBe(403)
  })

  it('refuses non-GET methods', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/stats`, { method: 'POST', headers: { authorization: `Bearer ${TOKEN}` } })
    expect(res.status).toBe(405)
  })
})
