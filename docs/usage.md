# Install and use

## Requirements

- macOS, Linux or Windows with Node.js 22.13 or newer (`node -v`).
- Claude Code and/or Codex, used at least once.

## Install from source (today)

```bash
git clone <your repo url> lens-agent
cd lens-agent
npm install
npm run build
npm link        # makes the `lens` command available
```

Without `npm link`, run `node dist/cli.js <command>` instead.

## First run

```bash
lens init       # creates the database and imports existing sessions
lens status     # totals
lens sessions   # list sessions
```

## Everyday commands

| Command | What it does |
| --- | --- |
| `lens sync` | Import new or changed sessions |
| `lens sessions --agent claude --limit 10` | Filter the list |
| `lens show 6b8d75d8` | Timeline of one session (an id prefix is enough) |
| `lens dashboard` | Open the local dashboard; use the printed link |
| `lens purge --yes` | Delete captured sessions (`--memories` also deletes memories) |
| `lens remember "text"` | Save a project memory |
| `lens memory suggest` / `list` / `accept` / `reject` / `edit` / `forget` | Curate memories |
| `lens memory apply [--dry-run]` | Write accepted memories into AGENTS.md and CLAUDE.md |

The dashboard link contains a token and works only on your machine. Press Ctrl+C to stop it.

## Develop

```bash
npm run lint    # type-check
npm test        # unit tests
npm run check   # lint, test, build
```

## Troubleshooting

| Problem | Fix |
| --- | --- |
| `lens: command not found` | Run `npm link` again, or use `node dist/cli.js` |
| "No sessions stored" | Run `lens sync`; use Claude Code or Codex first |
| Codex sessions missing | See [codex-adapter.md](codex-adapter.md) |
| Experimental SQLite warning | Harmless; it is Node's built-in database |
