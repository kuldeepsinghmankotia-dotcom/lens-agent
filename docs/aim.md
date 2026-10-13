# Aim

## The problem

People now write a lot of code through coding agents (Claude Code, Codex and others).
Three things go wrong again and again:

1. **You cannot see what the agent did.** Hundreds of tool calls happen. Afterwards you
   have a diff and a summary, not a record.
2. **Knowledge is lost between sessions and tools.** You re-explain your project every time.
3. **"Done" is not always true.** Agents say tests pass without running them, or hide a
   failed step in a long answer.

Cost and token use are also invisible until the bill arrives.

## The aim

**lens-agent is a local-first lens for coding agents.** It reads the session records your
agents already write, puts them in one place, and shows you what happened.

The long-term aim is one control layer with four parts, built in this order:

| Order | Part | What it gives you |
| --- | --- | --- |
| 1 | **Observe** | What each session did: prompts, tool calls, errors, tokens |
| 2 | **Memory** | Project knowledge that carries across sessions and across agents |
| 3 | **Verify** | Checks that a "done" claim is true: tests run, spec matched |
| 4 | **Registry** | Shareable skills with test results attached |

## Principles

- **Local first.** Your prompts and code never leave your machine.
- **Read only.** lens-agent never changes your agents' files or settings.
- **Honest.** If a number is unknown, it says "unknown". If a feature is unverified, the
  docs say so.
- **Small steps.** Each part must work on its own before the next one starts.

## Not the aim

- Replacing your agent. lens-agent watches; it does not write code.
- A hosted service in v1. No accounts, no cloud.
