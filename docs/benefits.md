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

## What it will give you later

- **Memory:** stop re-explaining your project to every agent.
- **Verify:** catch "done" claims that are not true before you merge.
- **Registry:** reuse skills other people have tested.

## Honest limits

- **Cost in money is not shown.** Prices change and differ by plan, so v0.1 shows tokens only.
- **Codex support is experimental.** It is built from the known log format and hand-made
  fixtures, not yet from a real Codex session. See [codex-adapter.md](codex-adapter.md).
- **It reads what agents write.** If an agent changes its file format, that adapter needs an
  update.
