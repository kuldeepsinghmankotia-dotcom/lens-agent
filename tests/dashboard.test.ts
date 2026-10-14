import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { JSDOM } from 'jsdom'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Store } from '../src/db.js'
import { sync } from '../src/ingest.js'
import { createDashboard } from '../src/server.js'
import type { LensEvent } from '../src/types.js'

const fixtures = join(import.meta.dirname, 'fixtures')
const TOKEN = 'ui-test-token'
const ATTACK = '<img src=x onerror="window.__pwned=1"><script>window.__pwned=1</script>'

function ev(uid: string, ts: number, type: LensEvent['type'], text: string, isError = false): LensEvent {
  return { uid, ts, type, tool: type === 'tool_result' ? 'Bash' : null, isError, text, inputTokens: 0, outputTokens: 0 }
}

async function until(check: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (check()) return
    await new Promise((r) => setTimeout(r, 20))
  }
  throw new Error(`Timed out waiting for: ${label}`)
}

describe('dashboard page (rendered in jsdom against the real server)', () => {
  let server: Server
  let base = ''
  let port = 0
  let store: Store

  beforeAll(async () => {
    process.env.LENS_CLAUDE_DIR = join(fixtures, 'claude')
    process.env.LENS_CODEX_DIR = join(fixtures, 'codex')
    store = new Store(':memory:')
    sync(store)
    store.saveSession({
      sessionId: 'attack-1',
      agent: 'claude',
      cwd: '/x',
      model: null,
      title: ATTACK,
      events: [ev('1', 1, 'prompt', ATTACK), ev('2', 2, 'tool_result', ATTACK, true)]
    })
    server = createDashboard(store, TOKEN, () => port)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as AddressInfo).port
    base = `http://127.0.0.1:${port}`
  })
  afterAll(() => {
    server.close()
    store.close()
    delete process.env.LENS_CLAUDE_DIR
    delete process.env.LENS_CODEX_DIR
  })

  async function open(token: string): Promise<JSDOM> {
    const html = await (await fetch(`${base}/?token=${TOKEN}`)).text()
    const dom = new JSDOM(html, {
      url: `${base}/?token=${token}`,
      runScripts: 'dangerously',
      pretendToBeVisual: true,
      beforeParse(window) {
        // jsdom has no fetch: route the page's relative requests to the real server.
        ;(window as unknown as { fetch: typeof fetch }).fetch = (path, init) =>
          fetch(new URL(String(path), base), init)
      }
    })
    return dom
  }

  const text = (dom: JSDOM, selector: string) => dom.window.document.querySelector(selector)?.textContent ?? ''
  const rows = (dom: JSDOM) => [...dom.window.document.querySelectorAll('tr.row')]

  it('shows totals and one row per session, with errors highlighted', async () => {
    const dom = await open(TOKEN)
    await until(() => rows(dom).length === 3, 'session rows')
    expect(text(dom, '#stats')).toContain('3 sessions')
    const claude = rows(dom).find((r) => r.textContent?.includes('Fix login bug'))!
    expect(claude.textContent).toContain('claude')
    expect(claude.querySelector('td.bad')?.textContent).toBe('1') // the failed tool call
    expect(rows(dom).some((r) => r.textContent?.includes('codex'))).toBe(true)
  })

  it('removes the token from the address bar', async () => {
    const dom = await open(TOKEN)
    await until(() => rows(dom).length > 0, 'rows')
    expect(dom.window.location.search).toBe('')
  })

  it('opens a session timeline, shows redacted text, and goes back', async () => {
    const dom = await open(TOKEN)
    await until(() => rows(dom).length === 3, 'rows')
    ;(rows(dom).find((r) => r.textContent?.includes('Fix login bug')) as HTMLElement).click()
    await until(() => dom.window.document.querySelectorAll('.ev').length > 0, 'timeline')
    const main = text(dom, '#main')
    expect(main).toContain('[REDACTED_KEY]')
    expect(main).not.toContain('sk-ant-abcdef')
    expect(dom.window.document.querySelector('.ev.error')).not.toBeNull()
    ;(dom.window.document.querySelector('button') as HTMLElement).click()
    await until(() => rows(dom).length === 3, 'back to list')
  })

  it('never turns stored text into HTML (XSS)', async () => {
    const dom = await open(TOKEN)
    await until(() => rows(dom).length === 3, 'rows')
    const attackRow = rows(dom).find((r) => r.textContent?.includes('<img'))!
    expect(attackRow).toBeDefined() // shown literally as text
    ;(attackRow as HTMLElement).click()
    await until(() => dom.window.document.querySelectorAll('.ev').length > 0, 'timeline')
    const doc = dom.window.document
    expect(doc.querySelector('main img')).toBeNull()
    expect(doc.querySelector('main script')).toBeNull()
    expect((dom.window as unknown as { __pwned?: number }).__pwned).toBeUndefined()
  })

  it('shows an error message when the token is wrong', async () => {
    const dom = await open('wrong-token')
    await until(() => text(dom, '#main').includes('Request failed'), 'error message')
    expect(text(dom, '#main')).toContain('401')
  })

  it('shows a helpful empty state with no sessions', async () => {
    const empty = new Store(':memory:')
    const other = createDashboard(empty, TOKEN, () => emptyPort)
    let emptyPort = 0
    await new Promise<void>((resolve) => other.listen(0, '127.0.0.1', resolve))
    emptyPort = (other.address() as AddressInfo).port
    const url = `http://127.0.0.1:${emptyPort}`
    const html = await (await fetch(`${url}/?token=${TOKEN}`)).text()
    const dom = new JSDOM(html, {
      url: `${url}/?token=${TOKEN}`,
      runScripts: 'dangerously',
      beforeParse(window) {
        ;(window as unknown as { fetch: typeof fetch }).fetch = (path, init) => fetch(new URL(String(path), url), init)
      }
    })
    await until(() => text(dom, '#main').includes('No sessions yet'), 'empty state')
    other.close()
    empty.close()
  })

  it('has no uncaught script errors on load', async () => {
    const errors: string[] = []
    const html = await (await fetch(`${base}/?token=${TOKEN}`)).text()
    const dom = new JSDOM(html, {
      url: `${base}/?token=${TOKEN}`,
      runScripts: 'dangerously',
      beforeParse(window) {
        ;(window as unknown as { fetch: typeof fetch }).fetch = (path, init) => fetch(new URL(String(path), base), init)
        window.addEventListener('error', (e) => errors.push(e.message))
      }
    })
    await until(() => rows(dom).length > 0, 'rows')
    expect(errors).toEqual([])
  })
})
