# Method — read for every verification

## The chain

In this order, each with the project's own command (the scripts in `package.json`, the
`Makefile`, the CI workflow say which). A step the project does not have is `not run` with
the reason, not invented.

1. **Build.** The thing compiles or bundles.
2. **Types.** The type checker, when it is separate from the build.
3. **Lint and format.** The linter; the formatter in check mode.
4. **Tests.** The suite, the same way CI runs it.
5. **Left behind**, in the files changed since the base branch only: debug output
   (`console.log`, `print`, `dbg!`, `dd(`), `TODO`/`FIXME` added by this work, commented-out
   blocks, `.only` / `fdescribe` / `@Ignore` / `skip` added to tests, secrets or keys by shape
   (`sk-`, `AKIA`, `-----BEGIN`, `password =`), merge markers, files that should not be
   tracked (`.env`, dumps, build output).
6. **The diff is the diff that was meant.** `git status` and `git diff --stat` against the
   base: a file changed that the task never mentioned, a lockfile or generated file changed
   with no dependency change, a mode change, a whole-file reformat. Each is one line.

A failing build stops steps 2 to 4: they would report the same failure four times. Steps 5
and 6 always run; they read files, they do not need a green build.

## The four words

Every step ends in exactly one: `passed`, `failed`, `could not run` (the command exists and
did not start: missing tool, wrong directory, no network), `not run` (skipped, with why).
"Looks fine", "should pass", "probably" are none of them. A step that was not executed is
never `passed`.

## Since the last time

After each run, the result is written to `.git/atlas-verify.json`: commit, time, each step's
word and counts. Inside `.git`, so it is never committed and never shows in the working tree.
Next run compares: a step that was `passed` and is now `failed` is marked `regressed`; counts
that moved are shown as before → after. No previous record: nothing is said about it.
"checkpoint" or "mark this": the same file, with the name given, kept until overwritten by
the same name.

## Report

```
build    passed   14s
types    failed   3 errors                         regressed
  src/api/user.ts:41  TS2322: Type 'string | undefined' is not assignable to type 'string'
  2 more in the same file
lint     passed
tests    passed   57 passed (53 → 57), 31s
left     2
  src/api/user.ts:12   console.log
  tests/user.test.ts:8  it.only
diff     1
  package-lock.json changed, package.json did not

NOT READY  types failed, 1 test narrowed with .only
```

One line per step: the word, the count, the time when it matters. Under a failed step, at
most five deciding lines and the count of the rest. Last line, one of: `READY` (every step
that exists passed, nothing left behind, the diff is the one meant), `NOT READY` with the
reasons in a clause, `CANNOT TELL` when a step that matters could not run. No advice on how
to fix; that is another skill's work.
