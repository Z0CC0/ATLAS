---
name: atlas-commit
description: >
  Write the Conventional Commits message for the currently staged changes.
  Use when the user says "atlas commit", "/atlas-commit", "write the commit message" — in
  any language — or asks for a commit message for what is staged.
---

Read the staged diff. Write one Conventional Commits message for it.

- subject: imperative, lowercase after the type, 50 characters or fewer, no trailing period
- body: only when the reason is not obvious from the subject. Why, not what
- one message, not a menu of options
- nothing staged: say so and stop

What this writes leaves the conversation, so it is written normally at every level — the dials do
not reach it. Only the report back in chat follows the active level.
