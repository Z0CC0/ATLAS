# House style — how this codebase already does things

New code in an old codebase should look like it was always there. The project's habits are
read from the code, not from what is fashionable.

## What to sample

By size (`git ls-files` counted by source extension): up to about fifty source files, read
them all; up to a few hundred, read the shared layer whole and two or three files per area;
beyond that, sample with a budget and say what was not looked at.
Prefer files that are central and recently maintained (`git log --format= --name-only -200`
counted per file) over the oldest corner or the newest experiment.

## Four things to read for

**Anatomy of a file.** The order inside it: imports and how they are grouped, types,
constants, the main thing, helpers, exports. What a file is named and how much goes in one.
**Names and state.** How loading, error and empty states are called; prefixes for booleans
and handlers; singular or plural; how identifiers and dates are passed around.
**Where shared things live.** HTTP calls, formatting, logging, validation, configuration:
the one place each is done, so that it is used and not written a second time.
**Errors and absence.** Thrown, returned, or caught at the edge; what a function gives back
when there is nothing; who logs.

Linter and formatter configs are read first: what a tool already enforces needs no rule
here.

## Majority, with evidence

For each habit: the form most of the code uses, two real files that show it, and the
minority form when there is one. A minority of a few old files is noise: the majority wins
and the other form goes under `avoid`. Close to an even split, or the newer files all on
one side: that is a migration in progress or a disagreement, and it is the user's call.
In a small project three against two is not a majority; ask.

Questions go one at a time, each with its evidence:

```
errors   src/api/users.ts throws; src/api/orders.ts returns { ok, error }  (11 files vs 9)
         which one does new code follow?
```

## What comes out

Said back, not written anywhere unless asked:

```
follow   src/api/users.ts      route handler: validate, call service, map errors
         src/services/mail.ts  service: one class, constructor injection
rules    async state named isLoading / error / data
         HTTP only through src/lib/http.ts
avoid    default exports (4 old files have them)
         try/catch inside services; errors are caught in src/api/middleware.ts
```

Asked to keep it: the same block goes into the project's `CLAUDE.md` under one heading,
with the commit it was read from. Run again later: read what changed since that commit,
report only where the code has moved away from the rules, and ask whether the rule or the
code is right. Old rules are amended with a date, not silently replaced.

No hook is installed and no settings file is touched.

## Using it

While writing in this codebase: before a new file, open the `follow` file nearest in kind
and match its anatomy. A rule that is wrong for the case at hand is broken openly, with one
line saying why.
