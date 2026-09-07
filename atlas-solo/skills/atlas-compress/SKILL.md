---
name: atlas-compress
description: >
  Rewrite a markdown file shorter without losing a single fact, keeping a backup.
  Use when the user says "atlas compress", "/atlas-compress", "shorten this file" — in any
  language — or asks to shrink a memory or notes file.
---

Compress the file the user named.

1. Copy the file to `<name>.before.md` first. Never overwrite without that copy
2. Keep verbatim: YAML frontmatter, code blocks, links, paths, commands, numbers, dates, names
3. Remove: repetition, filler, throat-clearing, examples that repeat a point already made
4. Keep every fact. Compression that drops a fact has failed, whatever it saved
5. Report size before and after, and what was removed by category

What this writes leaves the conversation, so it is written normally at every level — the dials do
not reach it. Only the report back in chat follows the active level.
