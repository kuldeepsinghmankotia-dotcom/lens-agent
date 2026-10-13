import { redact } from '../redact.js'

export const MAX_MEMORY_LENGTH = 300

/**
 * Turn user or session text into a safe single-line memory.
 * Memories end up in files that agents read as instructions, so the text is forced to one
 * line, HTML comment syntax is removed (so the lens-agent markers cannot be spoofed), and
 * secrets are redacted. Throws on empty or too-long input.
 */
export function normalizeMemoryText(input: string): string {
  const text = redact(input)
    .replace(/<!--|-->/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:[-*+]\s+)+/, '')
  if (!text) throw new Error('Memory text is empty.')
  if (text.length > MAX_MEMORY_LENGTH) {
    throw new Error(`Memory is too long (${text.length} characters, max ${MAX_MEMORY_LENGTH}). Shorten it.`)
  }
  return text
}
