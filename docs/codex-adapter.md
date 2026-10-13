# Codex adapter: what is verified

**Status: experimental.**

The Codex adapter (`src/adapters/codex.ts`) reads `~/.codex/sessions/**/rollout-*.jsonl`.
Its line format (`session_meta`, `turn_context`, `response_item`, `event_msg`) comes from
prior knowledge of Codex, not from a log on the dev machine. No Codex sessions existed
there when v0.1 was built.

## What is tested

Only a hand-made fixture in `tests/fixtures/codex/`. It proves the code handles that shape.
It does not prove real Codex logs have that shape.

## Defensive behaviour

Unknown line types are skipped. A file with no usable events is ignored. A bad file never
stops other files from importing.

## How to verify (needed for v0.2)

1. Run Codex once on any project.
2. Run `lens sync` then `lens sessions --agent codex`.
3. If nothing appears or counts look wrong, copy one rollout file's line structure (keys
   only, no content) and adjust `codex.ts` and the fixture to match.
