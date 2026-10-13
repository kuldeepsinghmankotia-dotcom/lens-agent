# Spec (v0.1)

Status: implemented (v0.1). Memory was added in v0.2. Owner: Abhinav Rana. License: MIT.

## Scope

IN:
- Passive capture from **Claude Code** transcripts and **Codex** rollout logs.
- Local SQLite storage (Node's built-in `node:sqlite`, no native dependency).
- CLI: `init`, `sync`, `status`, `sessions`, `show`, `dashboard`, `purge`.
- Read-only local dashboard (plain HTML and JavaScript, no build step).
- Secret redaction and per-run dashboard token.

OUT of v0.1 (Memory was added in v0.2, see [memory-spec.md](memory-spec.md)): Verify, Registry, hosted sync, accounts, other agents,
money-cost estimates.

## Decisions and why

| Decision | Why |
| --- | --- |
| Read transcript files instead of using hooks | Verified Claude Code already writes full JSONL transcripts. Reading is passive: nothing to install, nothing to break |
| TypeScript on Node, `node:sqlite` | One language end to end; no native modules to compile on install |
| Plain HTML dashboard | Fewest moving parts for v0.1. A React app can replace it later |
| Tokens, not dollars | Prices change and vary by plan. Unknown is better than wrong |
| Only top-level Claude files | Sub-agent transcripts can share a session id and would overwrite the parent |
| Replace a session's rows on re-import | Makes sync idempotent as live sessions grow |

## Success criteria and status

| # | Criterion | Status |
| --- | --- | --- |
| 1 | `lens init` imports existing sessions | Verified on 9 real Claude sessions |
| 2 | Re-running sync creates no duplicates | Tested |
| 3 | Dashboard shows sessions and events | API verified over HTTP; page not yet checked in a browser |
| 4 | Adapters and storage have passing tests | 28 tests pass |
| 5 | No outbound network calls | Enforced by a static test over `src/` |
| 6 | Codex session captured from a real Codex run | **Not done.** No Codex sessions exist on the dev machine yet |

## Risks

- Agent log formats change without notice. One adapter per agent keeps the damage local.
- Token fields may be missing for some agents. They are stored as 0, never guessed.
