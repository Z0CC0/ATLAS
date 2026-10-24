---
name: atlas-workflow
description: >
  Runs one of ATLAS's two named multi-agent workflows through the Workflow tool: `review-full`
  (three review angles in parallel on one diff, then every finding handed to a fresh agent told
  to refute it) and `ship` (every project check run in parallel beside a security review of the
  diff, one verdict). Only when the person asks for it: "atlas workflow", "run the review
  workflow", "use a workflow for this", "fan out the review", "orchestrate the checks", "ship
  check" — in any language. Invoking this is their opt-in; nothing here starts on its own.
---

Many agents, one script, deterministic control flow. The person asked for it; that is the only
reason a workflow runs.

## Which one

By the words of the request, in any language:
- "review", "second look", "refute", "before merge", "full review" → `review-full`
- "ship", "can I commit", "run the checks", "is it green", "pre-ship" → `ship`
- neither named and both plausible: ask in one line which, and stop.

## Before calling the tool

Scout inline first; the workflow needs the work-list, not a guess:
1. The target: `git diff` when there are unstaged changes, `git diff --staged` when staged,
   `git diff <base>...` for a branch, `gh pr diff N` for a pull request, a path for a file.
   Both diffs empty: say so and stop; nothing to review or ship.
2. For `ship`, the project's own check commands, read from `package.json` scripts, `Makefile`,
   `pyproject.toml`, `Cargo.toml`, `go.mod`, or the CI file — test, type check, lint, build.
   Quote them as the project writes them. No check command found: say so; `ship` does not run
   on nothing.
3. The plugin prefix: the name before the colon in the command used to reach this skill
   (`atlas` from `/atlas:atlas-workflow`). It is how the scripts reach `atlas-diff` and
   `atlas-runner`; without it the default workflow agent reviews and runs instead.

Then one call:

```
Workflow({ scriptPath: "${CLAUDE_PLUGIN_ROOT}/skills/atlas-workflow/workflows/<name>.mjs",
           args: { target, prefix, commands } })
```

`args.commands` only for `ship`; `args.angles` (extra angle sentences) only for `review-full`
and only when the person named one the three angles do not cover.

## What it costs, said before it runs

One line, before the call: `review-full` spends 3 agents plus one per candidate finding;
`ship` spends one per check command plus one. Each is a fresh context. The person can stop a
run from `/workflows`.

## What comes back

Both return `lines`: the atlas-review line format (`<file>:<line>  <tier>  <what>. <fix>.`),
a security line with its verdict in brackets, `N dropped on second look` when the refuters
removed candidates, `nothing found` when nothing survived; `ship` adds one `PASS` / `FAIL` /
`DID NOT RUN` line per check and ends with `ship` or `do not ship` and the reason. Print
`lines` unchanged, nothing before them. The counts in `lines` are the truth of the run: a check
that returned nothing is `DID NOT RUN`, never assumed green.

Both scripts are read-only on the repository: the runners run the project's checks, the
reviewers read, nobody edits or contacts anything deployed.

## Without the tool

A session without the Workflow tool: say so in one line and offer `atlas-review` with
"second opinion" (two reviewers, no fan-out) or `atlas-fix` in its place.

## Form

The active compression level governs the prose. It never changes the lines returned.
