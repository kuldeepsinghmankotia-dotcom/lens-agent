# Privacy and security

Agent sessions contain your prompts, your code and sometimes secrets. lens-agent treats
all of it as sensitive.

## What is stored

For each session: id, agent, folder, model, title, timestamps, counts, token totals, and a
timeline of events with their text. Text is redacted and cut to 2000 characters.

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

## Deleting your data

`lens purge --yes` deletes everything lens-agent stored. Your agents' own files are not
touched.
