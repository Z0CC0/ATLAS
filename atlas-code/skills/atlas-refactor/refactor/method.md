# Method — read every time code is reshaped

## Before the first move

1. **A clean tree.** `git status`: uncommitted work is committed or stashed by the user
   first, so every move can be undone alone. Not a git repository: say so, and nothing is
   removed, only proposed.
2. **A green baseline.** Run the tests that cover the code in scope, and the type check and
   build when the project has them. Record the counts. Red before starting: stop; a refactor
   on a red suite cannot tell its own damage from what was already there. That is
   `atlas-fix`'s job first.
3. **Is the code covered at all.** Tests that pass and never execute the code in scope prove
   nothing. No coverage of the part being moved: say so, and either `atlas-test` pins the
   present behaviour first, or the move is limited to what the compiler alone can prove
   (a rename, an unused import, an unreachable branch).

## The loop

One move: a single rename, one extraction, one removal, one merge. Then run. Green: keep,
next. Red: undo that move at once (`git checkout -- <files>`), write it down as `left`, next.
Never two moves between two runs: when it goes red, there must be one suspect.

A move that needs a second move to compile is one move. A move that needs a test changed is
not a refactor of that code: stop and say what behaviour the test was holding.

## Out of bounds, unless asked in so many words

Public surface: exported names, routes, CLI flags, config keys, database columns, file
formats, wire messages. Other people's code depends on these in places a search here cannot
see.
Behaviour, including the wrong kind: an odd rounding, an error swallowed, the order of side
effects. Seen and suspicious: one line under `noticed`, the code left as it is.
Formatting of lines not otherwise touched. A diff that mixes a real move with reflowed
whitespace cannot be reviewed.
Generated files, vendored code, migrations already applied, lock files.
Performance work: that is `atlas-perf`, with a measurement.

## Removing

Nothing is removed before the list has been shown and approved. Tracked files only: git
keeps them. A file git does not track is never deleted here; it is listed with a note.

## Report

```
moved    src/cart/total.ts  extracted taxFor() from total(), 3 callers unchanged
removed  src/utils/legacy-date.ts  no importers; last touched 2023
left     src/cart/coupon.ts  inlining applyAll() turned 2 tests red, undone
noticed  src/cart/total.ts:88  rounds half down; callers may rely on it

SAME BEHAVIOUR  tests 214 → 214 passed · types clean · 5 moved · 3 removed · 1 left · −186 lines
```

Verdict words: `SAME BEHAVIOUR` when the baseline checks pass with the same counts;
`NOT PROVEN` when something in scope had no test over it, naming what; `STOPPED` with the
reason. A lower test count is never `SAME BEHAVIOUR`, even when everything left is green.

No commit is made here. The user commits, or asks `atlas-commit`; a refactor goes in its own
commit, apart from any change of behaviour.
