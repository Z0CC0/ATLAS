---
name: atlas-verify
description: >
  Says whether the work is actually done: runs the project's build, type check, linter and
  tests, looks for what was left behind, and reports each as passed, failed, could not run or
  not run. Angles by the request: "before release", "production", "launch" (readiness audit);
  "buttons", "click path", "UI state" (handlers that undo each other). Use for "atlas verify",
  "is it ready", "did it work", "check everything before I commit" — in any language.
---

"Done" is a claim. This skill replaces it with what was run and what came back.

## What to read

Everything below lives in the `verify/` folder beside this file.

1. `verify/method.md`, always: the chain of checks, the four words, the comparison with the
   last run, the report.
2. By the words of the request, on top of it:
   "release", "production", "launch", "deploy", "go live", "ship" → `release.md`
   "buttons", "click", "handlers", "UI state", "nothing happens when I press" → `clicks.md`
   A deployed URL → that is `atlas-test` in its site mode; say so and hand over.

## Who runs the commands

The `atlas-runner` subagent, when it exists, one command per call: the verdict and the
deciding lines come back, the logs do not. Without it: output to files in the scratch
directory, read the deciding lines only.

## Boundaries

Verifying changes nothing. A failed check is reported, not repaired: `atlas-fix` repairs a
build, `atlas-review` finds what is wrong in a diff, the user decides. No file is edited, no
dependency installed, nothing committed.

## Form

The active compression level governs the prose. It never overrides the report format in
`method.md`. Error strings are quoted exactly.
