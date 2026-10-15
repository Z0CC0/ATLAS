# Rules scoped to a path

A rule that only matters in one part of the project does not belong in the brief every
session pays for. Claude Code reads `.claude/rules/*.md` and loads a rules file only when the
agent works on files its `paths` frontmatter names. The same idea exists in other tools under
other names (Cursor rules, Copilot instructions with `applyTo`); the shape below is Claude
Code's, and the content transfers.

## Shape

```
---
paths:
  - "src/engine/**"
  - "tests/engine/**"
---
Rules for the engine. One per line, imperative, with the reason when surprising.
```

One file per concern, named for it (`engine.md`, `migrations.md`, `workflows.md`), under
twenty lines. Globs match what the agent is editing or reading; a rule that should hold
everywhere goes in the brief, not in a file with `**`.

## What makes a good scoped rule

It names a mistake the agent made or would make in that folder: "generated, edit the
generator", "every migration has a down", "this test suite runs serially, do not add
`.only`", "the workflow files are linted by zizmor in CI; pin actions by hash". It says what
to run before and after a change there when it differs from the project's default. It names
the owner of a contract (the schema, the public API) and what a change to it requires.

## What is not a scoped rule

Style a formatter enforces; what the language's own docs say; a description of the folder
(the agent reads it); a rule copied into three files (make the glob wider or move it to the
brief); a rule that depends on who the user is (that goes to the user's own settings).

## Writing one

Read the folder: its tests, its generator, its CI job, its history of reverted commits
(`git log --oneline -- <path> | head`). Each rule comes from one of those. Write the file,
show it, and write after a yes. If the project has no `.claude/rules/`, say what the folder
does in one line of the brief so a human finds it.
