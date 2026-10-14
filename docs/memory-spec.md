# Memory spec (v0.2)

Status: implemented. Part 2 of the roadmap.

## Aim

Stop re-explaining a project to every agent. Facts about a project are saved once and
written into the instruction files that Claude Code (`CLAUDE.md`) and Codex (`AGENTS.md`)
both read. Because lens-agent makes no network calls, it cannot summarise with an AI model.
Memory is therefore **curated by you, with rule-based suggestions**.

## Model

A memory is one short line of text, tied to one project folder.

| Field | Meaning |
| --- | --- |
| project | Absolute folder the memory belongs to |
| text | One line, max 300 characters, secrets redacted |
| status | `suggested`, `accepted` or `rejected` |
| source | `manual` (you typed it) or `suggestion` (lens proposed it) |

Only `accepted` memories are ever written to project files.

## Commands

| Command | Does |
| --- | --- |
| `lens remember "text"` | Save an accepted memory for the current folder |
| `lens memory list [--all]` | Show memories (`--all` includes suggested and rejected) |
| `lens memory suggest` | Propose memories from this project's sessions |
| `lens memory accept <id>` / `reject <id>` | Decide on a suggestion |
| `lens memory edit <id> "text"` | Change the wording |
| `lens memory forget <id>` | Delete one memory |
| `lens memory apply [--dry-run]` | Write accepted memories into `AGENTS.md` and `CLAUDE.md` |

`--project <path>` selects another folder. The default is the current folder.

## Suggestion rules (deterministic, no AI)

1. **Instructions you gave** (prompts of 200 characters or less, not questions):
   - *Strong wording* ("always", "never", "from now on", "going forward", "in this
     project", "by default", "we use/prefer") is suggested from a single session.
   - *Weak wording* (starts with "don't", "do not", "stop", "make sure", "remember") is
     suggested only if the same prompt appears in 2 or more sessions.
   - Prompts that mark a one-off moment ("this time", "for now", "right now", "today",
     "let's") are skipped.
2. **Commands you keep running:** a shell command (80 characters or less) used in
   `--min-sessions` or more sessions (default 3).
3. **Files that keep changing:** a file edited in that many sessions.

At most 10 new suggestions per run. A rejected suggestion is never proposed again.

## Writing to project files

- Text goes between `<!-- lens-agent:start -->` and `<!-- lens-agent:end -->`. Everything
  outside the markers is never touched. Re-running replaces only the block.
- If `AGENTS.md` and `CLAUDE.md` are the same file (symlink), it is written once. If
  `CLAUDE.md` already imports `@AGENTS.md`, only `AGENTS.md` is written.
- Missing files are created. With no accepted memories, `apply` removes the block.
- `--dry-run` prints exactly what would change and writes nothing.

## Safety

Instruction files steer agents, so a memory is a prompt-injection target.

- Nothing is written without an explicit `apply`, and only `accepted` items.
- Text is forced to one line, markers and HTML comment syntax are stripped, length is
  capped, and secrets are redacted.
- Suggestions are never auto-accepted.

## Known limitations

- Suggestions are candidates, not conclusions. Expect to reject some. Rejected ones never
  return.
- The first version of the instruction rule matched 1 of 114 real prompts, and that match
  was a one-off remark. The weak-wording and one-off filters were added because of it.
- Most real preferences are not worded as rules ("keep it minimal for learning"), so this
  rule finds few of them. Use `lens remember` for those.
- The commands and files rules could not be tuned on real data: the dev machine had 11
  sessions, at most 6 per project, and nothing repeated even twice. The default of 3 is a
  guess. Try `--min-sessions 2` on your own history.

## Out of scope

AI-written summaries, cross-project memory, syncing between machines, automatic apply.
