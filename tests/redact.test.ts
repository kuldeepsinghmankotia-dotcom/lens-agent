import { describe, expect, it } from 'vitest'
import { redact, sanitize } from '../src/redact.js'

describe('redact', () => {
  it('removes common secrets', () => {
    const input = [
      'key sk-ant-abcdef1234567890abcdef',
      'gh ghp_abcdefghijklmnopqrstuvwxyz0123',
      'aws AKIAABCDEFGHIJKLMNOP',
      'jwt eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.abcdefghijk123',
      'Authorization: Bearer abcdefghijklmnopqrstuvwxyz',
      'DATABASE_PASSWORD=hunter2hunter2',
      'OPENAI_API_KEY="abc123def456"'
    ].join('\n')
    const out = redact(input)
    for (const secret of ['sk-ant-abcdef', 'ghp_abcdef', 'AKIAABCDEF', 'eyJhbGci', 'abcdefghijklmnopqrstuvwxyz', 'hunter2hunter2', 'abc123def456']) {
      expect(out).not.toContain(secret)
    }
    expect(out).toContain('DATABASE_PASSWORD=[REDACTED]')
  })

  it('removes private key blocks', () => {
    const out = redact('-----BEGIN RSA PRIVATE KEY-----\nMIIabc\n-----END RSA PRIVATE KEY-----')
    expect(out).toBe('[REDACTED_PRIVATE_KEY]')
  })

  it('leaves normal text alone', () => {
    expect(redact('Fix the login bug in src/auth.ts')).toBe('Fix the login bug in src/auth.ts')
  })

  it('truncates very long text after redacting', () => {
    const out = sanitize('x'.repeat(5000))
    expect(out.length).toBeLessThan(2100)
    expect(out.endsWith('[truncated]')).toBe(true)
  })
})
