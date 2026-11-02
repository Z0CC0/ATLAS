---
name: atlas-verify
description: >
  Says whether the work is actually done: runs the project's build, type check, linter and
  tests, looks for what was left behind, and reports each as passed, failed, could not run or
  not run. Angles by the request: "before release", "production", "launch" (readiness audit);
  "buttons", "click path", "UI state" (handlers that undo each other); "ship check", "run the
  checks in parallel", "use a workflow" (every check by its own runner beside a security
  review, one verdict). Use for "atlas verify", "is it ready", "did it work", "check
  everything before I commit" — in any language.
---

"Done" is a claim. This skill replaces it with what was run and what came back.

## What to read

Everything below lives in the `verify/` folder beside this file.

1. `verify/method.md`, always: the chain of checks, the four words, the comparison with the
   last run, the report.
2. By the words of the request, on top of it:
   "release", "production", "launch", "deploy", "go live", "ship" → `release.md`
   "buttons", "click", "handlers", "UI state", "nothing happens when I press" → `clicks.md`
   "coverage", "threshold", "the bar", "ratchet", "exception", or a project with thresholds
   in CI → `bar.md`
   A deployed URL → that is `atlas-test` in its site mode; say so and hand over.

## Who runs the commands

The `atlas-runner` subagent, when it exists, one command per call: the verdict and the
deciding lines come back, the logs do not. Without it: output to files in the scratch
directory, read the deciding lines only.

## Ship check — a workflow

"ship check", "run the checks in parallel", "use a workflow", "fan out the checks": the
multi-agent form, and that request is the opt-in the Workflow tool requires. First the
work-list, scouted here: the project's own check commands from `package.json` scripts,
`Makefile`, `pyproject.toml`, `Cargo.toml`, `go.mod` or the CI file (test, type check, lint,
build), quoted as the project writes them — none found, say so, nothing runs on nothing; the
diff target (`git diff`, `git diff --staged`, `git diff <base>...`). Say the cost in one line:
one runner per command plus one reviewer. Then one call, with the plugin prefix (the name
before the colon in the command used) so the script reaches `atlas-runner` and `atlas-diff`:

```
Workflow({ scriptPath: "${CLAUDE_PLUGIN_ROOT}/skills/atlas-verify/workflows/ship.mjs",
           args: { commands, target, prefix } })
```

It returns `lines`: one `PASS` / `FAIL` / `DID NOT RUN` per check, the security lines with
their verdict, and `ship` or `do not ship` with the reason; print them unchanged. A check
that returned nothing is `DID NOT RUN`, never assumed green. Without the Workflow tool: the
chain in `method.md`, one command at a time.

## Boundaries

Verifying changes nothing. A failed check is reported, not repaired: `atlas-fix` repairs a
build, `atlas-review` finds what is wrong in a diff, the user decides. No file is edited, no
dependency installed, nothing committed.

## Form

The active compression level governs the prose. It never overrides the report format in
`method.md`. Error strings are quoted exactly.
