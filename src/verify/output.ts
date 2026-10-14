const FAIL_LINE: RegExp[] = [
  /\b[1-9]\d* failed\b/i,
  /\bTests:.*\bfailed\b/,
  /test result: FAILED/,
  /^FAIL\s/,
  /\bFailed Tests\b/
]
const PASS_LINE: RegExp[] = [/\b[1-9]\d* passed\b/i, /test result: ok\./, /^ok\s+\S+\s/]

/**
 * Read a test runner's own summary out of command output.
 * The LAST line that reports a result decides: output often holds several runs (a deliberate
 * failure, then a fix) and the final one reflects the final state. Failure wins on a line
 * that mentions both ("1 failed | 51 passed"). Returns null when no line reports a result.
 * Only tests are read: other tools print no reliable summary on success.
 */
export function testOutcome(output: string): 'pass' | 'fail' | null {
  let outcome: 'pass' | 'fail' | null = null
  for (const line of output.split('\n')) {
    if (FAIL_LINE.some((p) => p.test(line))) outcome = 'fail'
    else if (PASS_LINE.some((p) => p.test(line))) outcome = 'pass'
  }
  return outcome
}
