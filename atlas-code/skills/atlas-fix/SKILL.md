---
name: atlas-fix
description: >
  Gets a failing build, type check or linter back to green with the smallest changes, one error
  at a time, re-running after each. Stops and says why instead of guessing: same error twice,
  more errors than before, a missing dependency, a change of design. Use for "atlas fix", "fix
  the build", "it does not compile", "type errors", "lint is red", "CI is failing" — in any
  language.
---

One error, one smallest change, run again. Never a rewrite to make a compiler quiet.

## What to read

Everything below lives in the `fix/` folder beside this file.

1. `fix/method.md`, always: how to find the command, the order to fix in, when to stop, what
   the report looks like.
2. One file for the toolchain that is failing, chosen by the project's files:
   `typescript.md` (`package.json`, `tsconfig.json`), `python.md` (`pyproject.toml`,
   `requirements.txt`, `manage.py`), `go.md` (`go.mod`), `rust.md` (`Cargo.toml`),
   `java-kotlin.md` (`pom.xml`, `build.gradle`, `build.gradle.kts`), `swift.md`
   (`Package.swift`, `*.xcodeproj`), `cpp.md` (`CMakeLists.txt`, `Makefile`), `csharp.md`
   (`*.csproj`, `*.sln`), `dart.md` (`pubspec.yaml`). No file for the toolchain: work from
   `method.md` alone and say so in the report.

## What is being fixed, by the words of the request

"build", "compile", nothing named → the build command.
"types", "typecheck" → the type checker only.
"lint" → the linter only; formatting errors are fixed by the project's formatter command, not
by hand, run on the files this session changed and no others. The linter's own rules and
configuration are never edited to pass.
"CI" → the first failing step of the workflow file, run locally; a step that cannot run
locally is named and left.
"tests" → only what stops the tests from running: import errors, compile errors, fixtures that
do not load. A test that runs and fails on an assertion is a behaviour, not a build error: one
line each in the report, handed back. Asked outright to make failing tests pass: `method.md`,
last section.

## Where the work goes

After the first run: more than five errors, or a build that takes longer than about twenty
seconds, or a CI log to work from: delegate to the `atlas-fixer` subagent, when it exists,
with the project root, the exact command, and the absolute paths of `fix/method.md` and the
toolchain file (they live beside this file). It runs the whole loop where the logs stay and
hands back the report and the list of files it changed; print the report unchanged and say
the files are already edited. One or two errors you can see: fix here.

## Who runs the command

The `atlas-runner` subagent, when it exists: give it the exact command, take back the verdict
and the error lines, never the log. Without it: run the command with output to a file in the
scratch directory and read only the error lines from that file. Either way the log does not
enter this conversation.

## Form

The active compression level governs the prose. It never overrides the report format in
`method.md`: the shape stays, the words inside it shorten. Error strings are quoted exactly.
