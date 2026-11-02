# The bar — what the project refuses to get worse at

Read when the project has thresholds (a coverage floor, a lint budget, a bundle size, a
performance number in CI) or when the request says "coverage", "threshold", "the bar",
"ratchet", "exception".

## Three kinds of check, by who can fool them

- **Outside the code's reach**: the compiler, the type checker, the linter, a scanner. Code
  that does not work cannot make them pass. These carry the most weight.
- **Inside the project's reach**: a test, an assertion, a fixture. Code that does not work
  can pass them if the test is weakened; so a green here is read together with step 5 of
  `method.md`.
- **A count**: tests passed, lines covered, files under budget. A number that can be kept
  by deleting what it counted. The weakest of the three, never reported alone.

## The ratchet

A number that cannot be enforced today is recorded, not demanded: today's value becomes
the floor, with a tolerance written beside it, and the only rule is that it does not fall.
The floor moves up when the number does, never by hand. A dimension with a floor, a
tolerance, a command that measures it and the moment it runs, one row each in the
project's own file for this; a dimension with none of those is an intention, and is said
so.

## Exceptions

A rule set aside carries who set it aside and until when. An exception past its date is
a `failed`, not a reminder. "Temporarily" without a date is not an exception, it is the
rule being lowered.

## Report

One row per dimension: value today, floor, moved how since last time (`method.md` keeps
the last run). A floor crossed is `failed` even when every command exited zero.
