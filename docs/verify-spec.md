# Verify spec (v0.4)

Status: implemented (audit only). Part 3 of the roadmap. See "Results on real sessions" below
for how well it works, which is: not very well yet.

## Aim

Catch "done" claims that the session itself does not support. An agent says "all tests
pass"; verify checks whether a test command actually ran, whether it succeeded, and
whether files changed afterwards.

## What it is not

It does not prove code is correct. It checks the **evidence in the session record**
against what the agent **said**. A session can be fully supported and still wrong.

## Decision 1: audit first, no command execution in v0.4

| Option | Verdict |
| --- | --- |
| **A. Audit the session record** (read only) | **v0.4.** Safe, offline, uses data lens-agent already has |
| B. Re-run the project's tests (`--run`) | Later (v0.4.1). It executes code on the user's machine, so it needs its own safety design |

Rule for B when it comes: only commands declared in the project's own `package.json`
scripts (`test`, `lint`, `build`), shown before running, and never a command taken from
session text.

## How the audit works

### 1. Find claims

Rule-based, in assistant messages. Each claim has a **kind**:

| Kind | Example phrases |
| --- | --- |
| tests | "all tests pass", "52 passed", "tests are green" |
| build | "build succeeds", "builds cleanly" |
| lint | "lint is clean", "no lint errors" |
| typecheck | "type-check passes", "no type errors" |

A bare "done" is **not** a claim kind: too vague, too many false alarms.

### 2. Find evidence

A Bash tool call whose command matches a runner of that kind, with its result:

| Kind | Runners recognised |
| --- | --- |
| tests | `npm test`, `npm run test`, `vitest`, `jest`, `pytest`, `go test`, `cargo test`, `bash .../test*.sh` |
| build | `npm run build`, `tsc -p`, `cargo build`, `go build` |
| lint | `npm run lint`, `eslint`, `ruff check`, `golangci-lint` |
| typecheck | `tsc --noEmit`, `mypy`, `npm run lint` when it is `tsc` |
| all four | `npm run check` |

Result comes from the captured error flag and the "Exit code N" text. Compound commands
(`a && b`) are marked uncertain, because the exit status may belong to either part.

### 3. Decide a verdict per claim

Looking only at events **before** the claim:

| Verdict | Meaning |
| --- | --- |
| **SUPPORTED** | A matching command ran, succeeded, and no file edit came after it |
| **STALE** | It succeeded, but files were edited afterwards, so the result may not apply |
| **CONTRADICTED** | The latest matching run failed and no later run passed |
| **UNSUPPORTED** | No matching command ran in the session |
| **UNKNOWN** | Cannot tell (compound command, missing data, or an agent whose logs are unverified) |

UNKNOWN is a real answer. Guessing would make the tool untrustworthy.

## Agent differences

- **Claude Code:** edits are `Edit`, `Write`, `MultiEdit`, `NotebookEdit`; failures set an
  error flag. Both verified on real transcripts.
- **Codex:** [UNVERIFIED] file edits probably go through shell or patch calls, and the
  adapter does not set an error flag. Until checked against a real log, Codex claims for
  staleness and failure are reported as UNKNOWN, never SUPPORTED.

## Commands and output

| Command | Does |
| --- | --- |
| `lens verify <session-id>` | Audit one session |
| `lens verify --last` | Audit the most recent session |
| `lens verify --project [path]` | Audit recent sessions of a project, summary first |

Output groups claims by verdict, worst first, and quotes the claim and the evidence line:

```
Session 6b8d75d8  React todo list
  UNSUPPORTED  tests   "all tests pass"        (no test command ran)
  STALE        build   "build succeeds"        (ran 18:50, src/App.jsx edited 18:52)
  SUPPORTED    lint    "lint is clean"         (npm run lint, exit 0, 18:53)
```

Exit code is non-zero when anything is CONTRADICTED or UNSUPPORTED, so it can later run in
a hook or CI. The dashboard gets a "claims" panel afterwards, not in v0.4.

## Safety and privacy

- Read only. No commands are executed. No network.
- Quoted claim and evidence text goes through the existing `sanitize()` before display.
- Verdicts are computed on demand and not stored. (The first design proposed a `verdicts`
  table. It was dropped: nothing needs it yet and it would only add data to keep in sync.)

## Changes made while building

- **`call_id` on events.** Matching a command to its own result needs the tool call id, which
  v0.2 did not keep. Events now store it. Existing databases are migrated and re-imported
  automatically on the next `lens sync`.
- **Result timing.** A result that arrives after a claim is not evidence for that claim.
  Found by a mutation check that revealed the first version looked at the whole session.
- **`npm run lint` and type-checks.** Whether `npm run lint` is eslint or `tsc --noEmit`
  depends on the project, so a type-check claim backed only by it is UNKNOWN, not
  UNSUPPORTED. Found when the first real run produced a false UNSUPPORTED.

## Results on real sessions

Run on the 11 sessions on the dev machine (Claude Code only):

| Result | Count |
| --- | --- |
| Claims found | 13, in 4 sessions |
| SUPPORTED | 0 |
| UNSUPPORTED / CONTRADICTED | 0 (one false UNSUPPORTED, fixed, see above) |
| UNKNOWN | 13 |
| Real problems caught | 0 |

**Reading this honestly:** the tool did not catch anything, and it did not confirm anything
either. Almost every claim is UNKNOWN because agents run tests inside chained or piped
commands (`cd … && python3 - <<EOF … ; npm run check`), and the exit status of a chain
cannot be attributed to the test. That is the main weakness of version 0.4, and it is
where real sessions spend their time.

Likely next improvements (not done, not decided):
1. Read the test runner's own summary line in the result ("Tests 52 passed (52)"). Stored
   results are cut to the first 2000 characters, and summaries sit at the end, so storage
   would need to keep the tail too.
2. Treat an `&&` only chain that exits 0 as passing every part of it.
3. Re-run the project's own scripts (the 0.4.1 idea) when the session cannot answer.

## Success criteria

| # | Criterion |
| --- | --- |
| 1 | Each verdict has a unit test on a hand-built session, including the edge cases | Done. Engine checked by mutation |
| 2 | Real sessions reviewed by hand, false positives reported | Done: 1 false positive found and fixed; 0 true problems found |
| 3 | The known "claim with no run" case is flagged UNSUPPORTED | **Not met.** With the narrower claim rules that session no longer contains a claim, so there is no real example of UNSUPPORTED or CONTRADICTED to test against. Only hand-built sessions cover them |
| 4 | Codex never gets SUPPORTED from unverified data | Done, tested |
| 5 | `npm run check` passes, no network code | Done |

## Risks

- **False alarms** from phrasing the rules miss or over-match. Mitigation: narrow claim
  kinds, UNKNOWN over guessing, and a reported false-positive count.
- **Thin evaluation data:** 11 sessions, 6 with claims. Results will be indicative, not
  statistically meaningful, and the docs will say so.
- **Claims in other forms** (tables, emoji checkmarks, other languages) are missed. They
  show as "no claim found", which is a limit, not a verdict.

## Out of scope for v0.4

Re-running tests, AI judging of claim wording, spec comparison, CI integration, dashboard
panel.
