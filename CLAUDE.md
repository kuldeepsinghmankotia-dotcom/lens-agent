# lens-agent: guidance for AI agents

This is an independent project by Abhinav Rana (MIT). It is not derived from any other
project's code.

## Rules

- Everything stays local. Do not add network calls to `src/`. `tests/privacy.test.ts`
  enforces this.
- Adapters only read agent files. Never write to `~/.claude` or `~/.codex`.
- Store text only through `sanitize()` from `src/redact.ts`.
- Mark anything not verified against real data as unverified, in code comments and docs.
- Run `npm run check` before saying work is done, and report the real result.
- Adding an agent: one adapter file, one line in `src/adapters/index.ts`, a fixture, tests.

## Style

TypeScript, ESM, no semicolons, single quotes, width 100 (see `.prettierrc.yaml`).
Match the surrounding code. Keep dependencies at zero at runtime.
