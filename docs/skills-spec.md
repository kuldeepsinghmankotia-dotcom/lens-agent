# Skills report spec (v0.5)

Status: implemented. Part 4 of the roadmap, scoped down.

## Why not a shared registry

The first idea was a registry where skills are published with test results attached. The real
data does not support it yet: the dev machine has 52 installed skills but only 4 recorded
skill uses across 11 sessions. Sharing needs either a network (which breaks local-first) or
other people's data. So part 4 starts with the part that is useful today and needs neither:
**what skills do I have, and which ones do I actually use?**

Sharing (export and import of skill bundles from local folders) is a possible next step. A
hosted registry would need its own privacy design first.

## Command

`lens skills [--unused] [--project [path]]`

Output:
- A summary: how many skills are installed, and how much captured history the usage covers.
- A table of used skills: uses, sessions, projects and last-used date.
- A count of installed skills never used, grouped by source. `--unused` lists them with
  their descriptions.

## Where skills come from

| Scope | Location |
| --- | --- |
| user | `~/.claude/skills/<name>/SKILL.md` |
| plugin | `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/skills/<name>/SKILL.md`, newest version only, id `plugin:name` |
| project | `<project>/.claude/skills/<name>/SKILL.md`, with `--project` |

`LENS_CLAUDE_HOME` overrides `~/.claude`.

## Where usage comes from

Claude Code's `Skill` tool calls in captured sessions, matched to installed skills by id. A
skill that was used but is not found on disk is listed as "not found" (built in to Claude
Code, removed, or renamed). Codex has no verified equivalent, so Codex use is not counted.

## Privacy

Read only and offline. Only the `name` and `description` lines in each SKILL.md header are
read. The body is never read, stored or displayed. Nothing new is stored: the report is
computed on demand.

## Checked on real data

On the dev machine the report found 52 installed skills (15 Superpowers, 37 Vercel), which
matches a count made independently from the folders on disk, and 4 uses in 11 sessions.

## Limits

- Usage history is short, so "unused" often means "newer than my history", and the report says so.
- Skills Claude Code loads from places other than the three above are not listed.
- A skill invoked by a name that differs from its id appears under "not found".
- The 4 recorded uses are too few to say which skills are good. This is an inventory and a
  usage count, not a quality score.
