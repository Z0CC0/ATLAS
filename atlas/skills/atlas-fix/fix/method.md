# Method — read for every fix

## Find the command

The project's own script wins: `scripts` in `package.json`, a `Makefile` target, a `justfile`,
the CI workflow file, the README's build section. Only when none exists, the toolchain's
default from the language file. Run it once before touching anything: the starting count of
errors is the baseline every later run is compared with.

It passes: say `PASS` with the command and stop. Nothing to fix is a result.
It cannot run at all (tool missing, wrong directory, no script): `DID NOT RUN`, the reason,
stop. Installing a toolchain is the user's decision.

## Order

1. Errors that produce other errors first: a missing import, an unresolved module, a syntax
   error, a type that many files use. Fixing one of these often clears twenty.
2. Then by file, in dependency order: the file others import before the files that import it.
3. Within a file, top to bottom.

Read the whole function around the error, not ten lines. The cause before the fix: say in one
clause why the compiler is right before changing anything. An error that is right about a real
bug is fixed as a bug, not silenced.

## The change

The smallest edit that makes the error untrue. Not a refactor, not a rename, not a "while I am
here". Match the code around it.

Never, to get to green: `any`, `!`, `as`, `@ts-ignore`, `# type: ignore`, `#[allow]`,
`@SuppressWarnings`, `// nolint`, `.unwrap()`, `_ =`, an empty `catch`, a deleted test, a
skipped test, a weakened compiler or linter setting, a pinned-down or bumped dependency, an
edited lockfile. Each of these makes the message go away and the problem stay. If one of them
is truly the right fix, it is proposed, not applied.

## Run again

After every change, the same command. Then:
the error is gone and the count did not rise → next error;
the error is still there → one more attempt, with a different cause in mind;
the count rose → undo the change and stop.

## Stop and hand back

The same error after two attempts.
A fix that raises the error count.
The fix needs a dependency installed, upgraded or removed; a generated file regenerated; a
config or toolchain version changed: name the command, do not run it.
The fix needs a public signature, a schema, or more than three files to change: that is a
design decision.
Ten errors fixed in this run: report, and ask whether to go on. A build with two hundred
errors is usually one cause; if ten fixes did not find it, the next ten will not.

## Report

One line per error handled, then the verdict:

`<file>:<line>  fixed  <error, exact>  <what changed>`
`<file>:<line>  left   <error, exact>  <why: what it needs>`

```
src/api/user.ts:41  fixed  TS2322: Type 'string | undefined' is not assignable to type 'string'  guard added before the call
src/api/user.ts:88  fixed  TS2304: Cannot find name 'UserDto'  import added
src/db/pool.ts:12   left   TS2307: Cannot find module 'pg'  needs `npm i pg` — not run

STOPPED  3 errors at start, 2 fixed, 1 left, 0 new  — missing dependency
```

Verdict words: `PASS` (green), `STOPPED` (a stop condition, named), `DID NOT RUN`. Always the
four counts: at start, fixed, left, new. No list of files read, no narration of the attempts.

## When asked to make failing tests pass

A failing assertion is a claim that the code is wrong or the test is. Decide which before
editing: read the test, read the code, state the expected behaviour in one line. The code is
wrong: fix the code, smallest change, run the one test, then the suite. The test is wrong:
say so with the reason and ask; a test is never edited to match the code without that. Never
both in the same step.
