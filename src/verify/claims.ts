export type Kind = 'tests' | 'build' | 'lint' | 'typecheck'

export interface Claim {
  kind: Kind
  /** The sentence the claim was found in, trimmed. */
  quote: string
}

const PATTERNS: Array<[Kind, RegExp]> = [
  ['tests', /\b(?:all\s+)?(?:\d+\s+)?(?:unit\s+|integration\s+)?tests?\s+(?:are\s+|now\s+|all\s+)*(?:pass(?:ed|ing)?|green)\b/i],
  ['tests', /\b\d+\s+(?:tests?\s+)?passed\b/i],
  ['tests', /\btest\s+suites?\s+(?:is\s+|are\s+)?(?:passes|passed|passing|green)\b/i],
  ['build', /\b(?:production\s+)?build\s+(?:succeeds|succeeded|passes|passed|is\s+clean|works|completes|compiles)\b/i],
  ['build', /\b(?:builds?|compiles)\s+(?:cleanly|successfully|without\s+errors)\b/i],
  ['lint', /\blint(?:ing)?\s+(?:is\s+)?(?:clean|passes|passed|passing)\b/i],
  ['lint', /\bno\s+lint(?:ing)?\s+(?:errors|warnings|issues)\b/i],
  ['typecheck', /\btype-?check(?:ing)?\s+(?:is\s+)?(?:clean|passes|passed|passing)\b/i],
  ['typecheck', /\bno\s+type\s+errors\b/i]
]

// A sentence that negates, conditions or asks is not a claim that something passed.
const HEDGE =
  /\b(?:not|never|no longer|until|if|once|when|whenever|unless|should|will|would|can|could|might|whether|before|so that|make sure|to make|want|need|failed|fails|failing|such as|e\.g\.|i\.e\.|for example|style|report|reports|according to)\b|n't|\?/i

/** Split into sentences without a regex lookbehind trick. Good enough for prose and bullets. */
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Find "it passes" style claims in an assistant message. Rule based and deliberately narrow:
 * a bare "done" is not a claim, and hedged or negated sentences are skipped.
 */
export function findClaims(message: string): Claim[] {
  const claims: Claim[] = []
  const seen = new Set<string>()
  for (const sentence of sentences(message)) {
    for (const [kind, pattern] of PATTERNS) {
      const match = pattern.exec(sentence)
      if (!match) continue
      const before = sentence.slice(0, match.index)
      // Inside quotes or backticks it is being discussed, not claimed.
      const quotes = (before.match(/["`“”]/g) ?? []).length
      if (quotes % 2 === 1) continue
      if (HEDGE.test(before) || HEDGE.test(sentence.slice(match.index + match[0].length))) continue
      const key = `${kind}:${sentence}`
      if (seen.has(key)) continue
      seen.add(key)
      claims.push({ kind, quote: sentence.length > 160 ? `${sentence.slice(0, 160)}…` : sentence })
    }
  }
  return claims
}
