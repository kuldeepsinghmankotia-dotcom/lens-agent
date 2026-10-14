# Benefits

## Who it is for

Developers who use coding agents daily and want to understand and trust what those
agents do.

## What you get today (v0.1)

| Benefit | How |
| --- | --- |
| **See every session in one place** | `lens sessions` and the dashboard list Claude Code and Codex sessions together |
| **Know what an agent actually did** | `lens show <id>` is a timeline of prompts, tool calls and results |
| **Spot failures quickly** | Failed tool results are flagged and counted per session |
| **Track token use** | Input and output tokens per session and in total |
| **Safe by design** | Local only, secrets redacted before storage, dashboard locked to your machine by a token |
| **No setup burden** | Reads existing session files. No hooks, no config changes, no accounts |
| **Works offline** | No network calls at all |

## Memory (v0.2)

| Benefit | How |
| --- | --- |
| **Stop re-explaining your project** | Save facts once with `lens remember`; they are written into `AGENTS.md` and `CLAUDE.md`, which Codex and Claude Code both read |
| **You stay in control** | Every memory is visible, editable and deletable; nothing is written until `lens memory apply` |
| **Suggestions without AI or network** | Fixed rules propose candidates from your sessions; you accept or reject |

## Verify (v0.4): limited so far

`lens verify` compares "tests pass" style claims with the commands the session actually ran,
and with the test runner's own summary line. On the real sessions available it confirmed 7
of 10 claims correctly and answered "unknown" for the rest. It has not yet been seen catching
a wrong claim, because none of those sessions contained one. See [verify-spec.md](verify-spec.md).

## Skills report (v0.5)

`lens skills` shows which Claude Code skills you have installed and which ones you actually
use. On the dev machine: 52 installed, 1 of them used in 11 sessions. It is an inventory and
a usage count, not a quality score; the history is too short for more.

## What it might give you later

- **Skill sharing:** export a skill from one machine and import it on another from a folder.

## Honest limits

- **Cost in money is not shown.** Prices change and differ by plan, so v0.1 shows tokens only.
- **Dashboard looks are unchecked.** Its behaviour is tested automatically, but nobody has yet reviewed the layout or dark mode in a real browser.
- **Codex support is experimental.** It is built from the known log format and hand-made
  fixtures, not yet from a real Codex session. See [codex-adapter.md](codex-adapter.md).
- **It reads what agents write.** If an agent changes its file format, that adapter needs an
  update.
