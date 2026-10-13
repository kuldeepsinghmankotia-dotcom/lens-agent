# Roadmap

| Version | Theme | Contents | Status |
| --- | --- | --- | --- |
| 0.1 | Observe | Capture Claude Code and Codex, CLI, dashboard, redaction | Built; Codex awaiting real-log check |
| 0.2 | Memory | Curated project memory with rule-based suggestions; written to AGENTS.md and CLAUDE.md. See [memory-spec.md](memory-spec.md) | Built |
| 0.3 | Harden | Verify Codex against real logs; check dashboard in a browser; improve suggestion quality; search and filters; session export | Next |
| 0.4 | Verify | Re-run tests after a session; compare the result to the stated task; flag unverified "done" claims | Planned |
| 0.5 | Registry | Publish and version skills; attach test results | Planned |
| later | More agents, optional hosted sync, team features | Only if v0.1 to v0.5 prove useful | Idea |

## Rules for moving on

- A version is done when its success criteria in `spec.md` are met and tested.
- Anything unverified stays marked as unverified in the docs until it is checked.
- Hosted features need a separate privacy design first.
