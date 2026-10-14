# Verify spec (v0.4, design)

Status: DESIGN. Not implemented. Part 3 of the roadmap.

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
- Verdicts are stored in a new `verdicts` table, derived data only, and removed by
  `lens purge`.

## Success criteria

| # | Criterion |
| --- | --- |
| 1 | Each verdict has a unit test on a hand-built session, including the edge cases (stale, compound, failed then fixed, claim before any run) |
| 2 | On the real sessions on the dev machine, every flagged UNSUPPORTED or CONTRADICTED item is reviewed by hand and the false-positive count is reported |
| 3 | The one known case (a session with a claim and no run) is flagged UNSUPPORTED |
| 4 | Codex sessions never get a SUPPORTED verdict from unverified data |
| 5 | `npm run check` passes and no network code is added |

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
