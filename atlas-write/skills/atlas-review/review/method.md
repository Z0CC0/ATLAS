# Method — read for every review

## Gather

1. `git diff` and `git diff --staged`. Both empty: `git log --oneline -5` and ask which commit;
   do not review the last one by guess.
2. For every changed file, read the whole file, not the hunk. Then the callers of what changed
   (`grep` the symbol) and the tests that name it. Half of the findings a reviewer regrets were
   handled one frame up.
3. Note the languages and frameworks in play; that decides which checklists to read next.

## The proof a line needs

A `breaks` or `fragile` line names three things or it is not written:
the input or state that triggers it;
what happens then, wrong value, crash, data lost, request hangs;
why nothing already catches it: the type, the validation upstream, the framework default, the
test. If one of the three is missing, the tier drops to `unclear` or `ask`, or the line goes.

`unclear` names the misreading: what a reader will think the code does, and what it does.
`ask` names the fact only the author has: "is `id` ever negative here?".

The same defect in five places is one line with the count, not five lines.

Zero findings is a result. A small diff that is typed, tested and shaped like the code around
it gets `nothing found`. Lines invented so the review looks thorough are the main way a model
reviewer loses the reader's trust, and they cost more than a missed nit.

## Never a finding

Style, naming, formatting, import order, quote marks, unless they change what the code does.
Function or file length by itself; length is not complexity. Exhaustive `switch` tables,
configuration objects, test tables and generated code are long on purpose.
"Consider adding error handling" where the caller, a middleware, an error boundary or an
upstream `.catch` already handles it. Trace one caller before writing it.
"Missing validation" on an internal function whose callers validate.
Well-known constants: HTTP codes, 1000 ms, 60, 24, 1024, index 0 or -1, a single-use local
whose name says what it is.
"Prefer const" when the variable is reassigned later in the function.
"Possible null" when the line above narrows it or an `if` guards it; follow the type, do not
pattern-match on `?.`.
"N+1" on a loop of fixed small cardinality or on a path that already batches.
"Missing await" on a call that is detached on purpose: logging, metrics, a queue push, a `void`
prefix or a comment saying so.
Suggesting another language, framework or library than the project's.
Hardcoded values in tests, fixtures and examples; tests are supposed to pin values.
`Math.random`, `eval`, `innerHTML` in a place that is explicitly not security-relevant: an
animation, a plugin loader, a trusted template. Name the risk only when the input can come
from outside.

Before any line, the test: would a senior engineer on this team ask for the change in review?
No: delete the line.

## Tools

`Bash` is for `git diff`, `git show`, `git log`, `gh pr diff`, and for the project's own check
commands when a language file lists them: reading and running checks, never changing files.
A check that fails is one line, the first decisive error quoted exactly, tier `breaks`.
