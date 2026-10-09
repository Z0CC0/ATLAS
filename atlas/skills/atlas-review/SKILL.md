---
name: atlas-review
description: >
  What is wrong with a diff, branch, file or pull request, one problem per line: where, what
  breaks on what input, the fix. Nothing about what is fine. Checklist chosen by the languages
  in the diff; angle by the request: "security", "tests", "types", "comments", "before merge",
  "second opinion", or a PR number. Use for "atlas review", "review my diff", "check this
  code", "safe to commit?" — in any language.
---

Findings only. The reader can see their own diff; what they cannot see is what is wrong with it.

## The line

`<file>:<line>  <tier>  <what breaks, and on what input>. <the fix>.`

Tiers, in this order: `breaks` (wrong result or crash on an input that will occur), `fragile`
(right on the inputs seen, wrong on a plausible one), `unclear` (right, but the next reader
will misread it), `ask` (cannot be judged without something only the author knows). A problem
in code the diff did not touch: one line at the end marked `outside`, no fix. Nothing wrong:
`nothing found`, and stop.

## What to read before reviewing

Everything below lives in the `review/` folder beside this file. Read only what the diff and
the request call for; each file is short and says what it is for in its first line.

1. `review/method.md`, always: how to gather the diff, the proof a `breaks` line needs, the
   false positives that are never findings.
2. One file per language in the diff, chosen by file extension: `typescript.md` (.ts .tsx .js
   .jsx .mjs), `python.md`, `go.md`, `rust.md`, `java-kotlin.md` (.java .kt .kts), `swift.md`,
   `csharp.md`, `cpp.md` (.c .cc .cpp .h .hpp), `php.md`, `dart.md`. Frameworks by import, on top of the
   language: `react.md` (react, next), `vue.md` (vue, nuxt), `database.md` (any SQL string, ORM
   call, migration file), `ml.md` (torch, tensorflow, sklearn, xgboost, transformers, or code
   that splits data, trains, scores or serves a model). No file for the language: review with `method.md` alone and say so
   in one line at the end.
3. Angles, by the words of the request, in any language:
   "security", "auth", "secrets", "injection" → `security.md`
   "tests", "coverage" → `tests.md`
   "types", "invariants" → `types.md`
   "comments", "docs", "docstrings" → `comments.md`
   "errors", "failures", "silent" → `errors.md`
   "my setup", "`.claude`", "hooks", "MCP config", "is my configuration safe", or a diff
   touching those files → `agent-config.md`
   "before merge", "pre-merge", "ready to merge", "PR" → `errors.md`, `tests.md`, `types.md`
   a number, a `github.com/.../pull/` URL, "the PR" → `pr.md` first, it changes what the diff is
   No angle named: language files plus `errors.md` when the diff touches a `catch`, `except`,
   `rescue`, `Result`, `Optional` or an error return. That lens is cheap and it is where
   reviewers miss most.

## Second opinion

"second opinion", "two reviewers", "double check", "adversarial": run the review twice with no
shared context. Once here. Once by the `atlas-diff` subagent, told only the diff target, the
angle and the absolute paths of the files above, nothing of what was found here. Then print
one list: lines both found first, then lines only one found, each of those marked `(one of
two)`. A line one reviewer found and the other read and rejected is dropped and counted:
`N dropped on second look`. Two passes cost twice; they are for a merge, not for a typo.

## Where the work goes

A diff under 120 lines: review here. Larger, or a branch, or a PR: delegate to `atlas-diff`
with the paths of the files it must read and the exact target (`git diff`, `git diff main...`,
a file, `gh pr diff N`), so the diff never enters this conversation. The subagent returns
findings in the line format above; print them unchanged.

On a build without subagents: review here whatever the size, and a second opinion is not
available; say so in one line in place of running it.

## Form

The active compression level governs the prose. It never overrides the line format: the shape
stays, the words inside it shorten. A review that adds angles is not permission to write long —
what it adds is findings, the prose around them is not. No summary of the change, no verdict
paragraph, no list of what was checked. In PR mode the decision word comes from `pr.md` and is
one line.
