# Privacy and security

Agent sessions contain your prompts, your code and sometimes secrets. lens-agent treats
all of it as sensitive.

## What is stored

For each session: id, agent, folder, model, title, timestamps, counts, token totals, and a
timeline of events with their text. Text is redacted and cut to 2000 characters (start and end are kept; tool calls keep up to 30000).

Stored in `~/.lens-agent/lens.db` (override with `LENS_HOME`). The folder is created with
owner-only permissions.

## What is never done

- No network calls. A test fails the build if network code is added to `src/`.
- No writes to Claude Code or Codex files.
- No telemetry.

## Redaction

Before storing, these patterns are replaced: Anthropic and OpenAI-style keys, GitHub
tokens, Slack tokens, AWS access keys, JWTs, `Bearer` tokens, private key blocks, and
`NAME=value` pairs where the name contains KEY, SECRET, TOKEN or PASSWORD.

Redaction is pattern based. It cannot catch every secret. Treat the database as sensitive.

## Dashboard protections

- Listens on `127.0.0.1` only.
- Needs a random token, new every run, shown only in your terminal.
- Rejects requests with a non-loopback `Host` header (DNS rebinding).
- Read-only, GET only, no CORS headers, strict content security policy.
- Event text is inserted with `textContent`, never as HTML.

## Skills report

`lens skills` reads the `name` and `description` lines of each installed SKILL.md and nothing
else. Skill bodies are never read, stored or shown. Nothing is stored for the report.

## Deleting your data

`lens purge --yes` deletes captured sessions. Curated memories are kept, because you wrote
or approved them; add `--memories` to delete those too. Your agents' own files are never
touched.

## Memory and instruction files

`lens memory apply` writes accepted memories into `AGENTS.md` and `CLAUDE.md`, which agents
read as instructions. To limit prompt-injection risk, nothing is written without an
explicit `apply`, suggestions are never auto-accepted, and memory text is forced to one line
with comment syntax stripped and secrets redacted. Use `--dry-run` to preview.
