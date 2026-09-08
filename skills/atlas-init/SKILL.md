---
name: atlas-init
description: >
  Write an equivalent terse-answer rule into other agents' config files (Cursor, Windsurf,
  Cline, Copilot, AGENTS.md), so a repository answers the same way whoever works in it.
  Use when the user says "atlas init", "/atlas-init", or asks to apply the rules outside Claude Code.
---

Run the dry run first, always:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/init.mjs"
```

Show what it would change, then apply only if the user agrees:

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/init.mjs" --write
```

- the block is delimited and idempotent: re-running updates it, never duplicates it
- `--remove` takes it out again
- `--only cursor|windsurf|cline|copilot|agents` for one target
- files that do not exist are created only when writing, never on a dry run

These files belong to the repository and to whoever else works in it. A rule block appearing in
someone's config without them asking is an imposition — get the agreement before `--write`.

What this writes leaves the conversation, so it is written normally at every level — the dials do
not reach it. Only the report back in chat follows the active level.
