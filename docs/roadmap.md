# Roadmap

| Version | Theme | Contents | Status |
| --- | --- | --- | --- |
| 0.1 | Observe | Capture Claude Code and Codex, CLI, dashboard, redaction | Built; Codex awaiting real-log check |
| 0.2 | Memory | Curated project memory with rule-based suggestions; written to AGENTS.md and CLAUDE.md. See [memory-spec.md](memory-spec.md) | Built |
| 0.3 | Harden | Verify Codex against real logs; check dashboard in a browser; improve suggestion quality; search and filters; session export | Next |
| 0.4 | Verify | Audit sessions: flag "tests pass"-style claims the session does not support. Read only. See [verify-spec.md](verify-spec.md) | Built. On real sessions it confirms supported claims correctly; it has not yet caught a wrong claim, because none existed |
| 0.4.1 | Verify: re-run | Opt-in re-running of the project's own test, lint and build scripts | Idea |
| 0.5 | Skills report | `lens skills`: installed skills and how often each ran. A shared registry was set aside: see [skills-spec.md](skills-spec.md) | Built |
| 0.6 | Skill sharing | Export and import skill bundles from local folders | Idea, only if the report proves useful |
| later | More agents, optional hosted sync, team features | Only if v0.1 to v0.5 prove useful | Idea |

## Rules for moving on

- A version is done when its success criteria in `spec.md` are met and tested.
- Anything unverified stays marked as unverified in the docs until it is checked.
- Hosted features need a separate privacy design first.
