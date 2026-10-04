---
name: atlas-test
description: >
  Writes the tests that would fail if the code were wrong, and runs them. Modes by the request:
  test first ("TDD", "write the test first"), the paths nothing covers ("coverage", "what is
  untested"), a whole flow in a browser ("end to end", "e2e"), a deployed page ("on the site",
  a URL). Nothing named: tests for the code just changed. Use for "atlas test", "write tests",
  "add tests for this", "test this" — in any language.
---

A test earns its place by one thing: it fails when the behaviour it names breaks. Everything
here serves that.

## What to read

Everything below lives in the `test/` folder beside this file.

1. `test/method.md`, always: find the runner, what a test must name, what is never written, the
   report.
2. One mode file, by the words of the request:
   "TDD", "test first", "red green" → `tdd.md`
   "coverage", "untested", "missing tests" → `coverage.md`
   "end to end", "e2e", "user flow", "Playwright" → `e2e.md`
   "on the site", "after deploy", "smoke", a URL → `site.md`
   Nothing named → no mode file: tests for what the current diff changed, by `method.md`.
3. One file for the language, by the test files and config already in the project:
   `typescript.md`, `python.md`, `go.md`, `rust.md`, `java-kotlin.md`, `swift.md`, `cpp.md`,
   `csharp.md`, `dart.md`. The project's existing tests outrank every idiom in these files:
   read two of them first and write the third the same way.

## Who runs them

The `atlas-runner` subagent, when it exists: the exact command in, the verdict and the failing
lines out. Without it: output to a file in the scratch directory, read the failing lines only.
A browser flow or a deployed page: the `atlas-browser` subagent, when it exists.

## Boundaries

This skill writes tests and, in test-first mode, the code that makes them pass. It does not
change code to make an existing failing test pass unless the request is test-first work on
that code: a red test that was green before is `atlas-fix`'s last section, or a bug to report.
It never commits. It never deletes or skips a test.

## Form

The active compression level governs the prose. It never overrides the report format in
`method.md`. Test names and assertion messages are written for whoever reads a failing CI log
a year from now: plain, whole, uncompressed.
