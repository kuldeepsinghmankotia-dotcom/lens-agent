const MAX_TEXT = 2000

const PATTERNS: Array<[RegExp, string]> = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]'],
  [/\bsk-ant-[A-Za-z0-9_-]{10,}/g, '[REDACTED_KEY]'],
  [/\bsk-[A-Za-z0-9_-]{16,}/g, '[REDACTED_KEY]'],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, '[REDACTED_TOKEN]'],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, '[REDACTED_TOKEN]'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, '[REDACTED_TOKEN]'],
  [/\bAKIA[0-9A-Z]{16}\b/g, '[REDACTED_AWS_KEY]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, '[REDACTED_JWT]'],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/gi, 'Bearer [REDACTED]'],
  [
    /\b([A-Za-z0-9_]*(?:API_?KEY|SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE_KEY)[A-Za-z0-9_]*)(\s*[=:]\s*)(["']?)[^\s"',;]{6,}\3/gi,
    '$1$2[REDACTED]'
  ]
]

export function redact(text: string): string {
  let out = text
  for (const [pattern, replacement] of PATTERNS) {
    out = out.replace(pattern, replacement)
  }
  return out
}

/** Redact secrets, then cut to a fixed size so one huge tool result cannot bloat storage. */
export function sanitize(text: string): string {
  const clean = redact(text)
  return clean.length > MAX_TEXT ? `${clean.slice(0, MAX_TEXT)}…[truncated]` : clean
}
