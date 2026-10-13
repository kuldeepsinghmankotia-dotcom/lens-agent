# lens-agent

A local-first lens for coding agents. It reads the session records that **Claude Code** and
**Codex** already write, and shows you what each session did: prompts, tool calls, errors
and token use. Nothing leaves your machine.

```text
$ lens sessions
ID         AGENT   STARTED           TOOLS  ERR  TOKENS    TITLE
6b8d75d8-8 claude  2026-10-13 18:53  7      0    337587    React todo list
df2f7527-c claude  2026-10-13 18:32  53     2    5362493   Project plan review
```

## Why

You cannot see what an agent actually did, knowledge is lost between sessions, and "done"
is not always true. lens-agent starts with the first problem: **see everything**. Memory,
verification and a skills registry follow. Details: [docs/aim.md](docs/aim.md).

## Quick start

Requires Node.js 22.13+.

```bash
npm install
npm run build
npm link
lens init
lens dashboard
```

More: [docs/usage.md](docs/usage.md).

## Status

| Part | State |
| --- | --- |
| Claude Code capture | Working, checked on real sessions |
| Codex capture | **Experimental**: built from the known format, not yet checked on a real Codex log |
| CLI | Working |
| Dashboard | API verified; page not yet checked in a browser |
| Memory (`lens remember`, `lens memory ...`) | Working. Suggestions are rule based and can be noisy; see [docs/memory-spec.md](docs/memory-spec.md) |
| Verify, Registry | Planned: see [docs/roadmap.md](docs/roadmap.md) |

## Privacy

Local only, no network calls, secrets redacted before storage, dashboard bound to
127.0.0.1 behind a per-run token. See [docs/privacy.md](docs/privacy.md).

## Documentation

[Aim](docs/aim.md) · [Benefits](docs/benefits.md) · [Spec](docs/spec.md) · [Memory](docs/memory-spec.md) ·
[Architecture](docs/architecture.md) · [Roadmap](docs/roadmap.md) ·
[Privacy](docs/privacy.md) · [Usage](docs/usage.md) · [Plans](docs/plans/)

## License

MIT. Copyright (c) 2026 Abhinav Rana.
