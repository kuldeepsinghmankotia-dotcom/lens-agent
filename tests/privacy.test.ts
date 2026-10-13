import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? sourceFiles(full) : [full]
  })
}

describe('privacy: v1 makes no outbound network calls', () => {
  const files = sourceFiles(join(import.meta.dirname, '..', 'src'))
  const code = files.map((f) => ({ f, text: readFileSync(f, 'utf8') }))

  it('uses no outbound http client', () => {
    const banned = [/\bfetch\(/, /node:https/, /\bhttps\.request/, /http\.request/, /http\.get\(/, /node:net/, /node:dgram/, /node:tls/, /XMLHttpRequest/, /WebSocket\(/]
    for (const { f, text } of code.filter((c) => c.f.endsWith('.ts'))) {
      for (const pattern of banned) {
        expect(text, `${f} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })

  it('dashboard listens on 127.0.0.1 explicitly', () => {
    const cli = code.find((c) => c.f.endsWith('cli.ts'))!.text
    expect(cli).toContain("'127.0.0.1'")
  })
})
