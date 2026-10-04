---
name: atlas-refactor
description: >
  Changes the shape of code without changing what it does: removes dead code, simplifies,
  merges duplicates, and learns an old codebase's own style before writing in it. One move at
  a time, tests green before and after each, anything that goes red undone. Removes nothing
  before the list is shown and approved. Use for "atlas refactor", "clean this up", "dead
  code", "unused exports", "simplify this", "remove the duplication", "match the existing
  style" — in any language.
---

Same behaviour, better shape. A refactor that changes what the code does is a bug with good
intentions.

## What to read

Everything below lives in the `refactor/` folder beside this file.

1. `refactor/method.md`, always: the baseline, the one-move loop, what is out of bounds, the
   report.
2. One file by the words of the request:
   "dead code", "unused", "prune", "clean up dependencies" → `dead.md`
   "simplify", "too complicated", "hard to read", "clean this up" → `simplify.md`
   "duplication", "repeated", "copy-paste", "merge these" → `duplicates.md`
   "existing style", "legacy", "match the conventions", "how is it done here" → `style.md`
   Nothing named: `simplify.md`, on the files the user pointed at or the current diff.

Work in a codebase nobody here has written in before: `style.md` first, whatever the
request.

## Scope

The files named, or the current diff. "The whole project" is taken as a survey first: what
would change and how much, as a list, and the user picks. Never a sweep nobody asked for.

## With the other skills

No tests around the code to be moved: `atlas-test` writes tests that pin the present
behaviour first. The suite is run by `atlas-runner` when it exists. A larger restructuring
with a design choice in it goes through `atlas-plan`; `atlas-plan` in run mode has a `refactor`
operation that calls this skill for the moves.

## Form

The active compression level governs the prose. It never overrides the report format in
`method.md`.
