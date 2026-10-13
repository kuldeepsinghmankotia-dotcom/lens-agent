# Architecture and structure

```
agent session files          adapter            store              views
~/.claude/projects/**.jsonl -> claude.ts  \
                                            >-> ingest.ts -> db.ts (SQLite) -> cli.ts
~/.codex/sessions/**/rollout-*.jsonl -> codex.ts /                          -> server.ts + dashboard
```

## Folder layout

```
lens-agent/
├── README.md              Overview and quick start
├── LICENSE                MIT, Abhinav Rana
├── CLAUDE.md              Rules for AI agents working on this repo
├── package.json           Scripts and dependencies
├── tsconfig*.json         TypeScript config (build excludes tests)
├── vitest.config.ts       Test config
├── scripts/
│   └── copy-assets.mjs    Copies the dashboard page into dist/
├── docs/
│   ├── aim.md             Why this exists
│   ├── benefits.md        What you get, and honest limits
│   ├── spec.md            Scope, decisions, success criteria (v0.1)
│   ├── memory-spec.md     Memory design (v0.2)
│   ├── architecture.md    This file
│   ├── roadmap.md         Planned versions
│   ├── privacy.md         What is stored and how it is protected
│   ├── usage.md           Install and daily use
│   ├── codex-adapter.md   What is and is not verified for Codex
│   └── plans/             Dated implementation plans
├── src/
│   ├── cli.ts             Command-line entry point
│   ├── types.ts           Shared types (Adapter, LensEvent, rows)
│   ├── paths.ts           Where data and agent logs live
│   ├── redact.ts          Secret redaction and truncation
│   ├── db.ts              SQLite store
│   ├── ingest.ts          Sync agent files into the store
│   ├── memory/            Curated project memory (text, store, suggest, apply)
│   ├── server.ts          Read-only dashboard API (loopback, token)
│   ├── adapters/          One file per agent
│   │   ├── claude.ts
│   │   ├── codex.ts
│   │   └── index.ts       Registry of sources
│   └── dashboard/index.html
└── tests/
    ├── fixtures/          Hand-made session files
    └── *.test.ts
```

## Core model

- **Adapter:** turns one agent's session file into a `ParsedSession` of normalized
  `LensEvent`s (prompt, assistant_message, tool_call, tool_result, usage).
- **Store:** `sessions` (one row per session, totals precomputed), `events` (timeline),
  `files` (size and mtime, so unchanged files are skipped).
- **Adding an agent:** write one adapter, add one line to `src/adapters/index.ts`, add a
  fixture and tests. Nothing else changes.

## Data flow rules

1. Adapters only read. They never write to agent folders.
2. Everything goes through `sanitize()` (redact, then truncate) before it is stored.
3. The dashboard only reads from the store. It has no write endpoints.
