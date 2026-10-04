# Two reviewers who have not spoken — a diff, a file, a document before it ships

A model reviewing its own work shares the blind spots that produced it. Two reviewers with
the same instructions and no shared context do not, or share fewer.

## What is reviewed, and against what

The target named exactly: the diff (`git diff main...HEAD`), a file, a document. The rubric
is the one `atlas-review` uses, so every reviewer is held to the same line: the format
`<file>:<line>  <tier>  <what breaks, on what input>. <the fix>.`, the proof a `breaks` line
needs, the list of things that are never findings. That text, plus the checklist for the
language, goes into the packet with the diff. A diff is code leaving the machine: the consent
line names the files and the line count.

## Run

Two reviewers, by `method.md`, preferring two different vendors; one outside voice and one
fresh subagent when only one tool is installed; two subagents when none, labelled so. This
session does not review in this mode: it wrote the code, it is the party under review.

Each returns lines in the format, or `nothing found`.

## Gate

Both `nothing found`, or only `unclear` and `ask` lines: **passes**.
A `breaks` or `fragile` line from either: **does not pass**. One reviewer is enough to stop
it; the other's silence is not a vote.

Each line is then read here against the code. A line that is wrong, the guard exists, the
input cannot occur, is struck with the reason, in the report, not silently. A line that
stands is fixed.

## Fix and go again

After fixes, both reviewers again, fresh, on the new diff. They are not told what the last
round found. At most three rounds. Still not passing after three: stop and hand the open
lines to the user; a loop that does not converge is telling something about the design.

## Report

```
target    git diff main...HEAD — 6 files, 214 lines
round 1   codex: 2 lines · gemini: 1 line                         other vendor ×2
  src/refunds.ts:58   breaks   both     provider timeout leaves the row pending forever. Mark failed after the retry limit.
  src/refunds.ts:27   fragile  codex    idempotency key compared case-sensitively. Normalise before lookup.
  src/api/refunds.ts:14  fragile  gemini   struck: validation is in the middleware, routes/index.ts:30
round 2   codex: nothing found · gemini: nothing found

PASSES  2 rounds, 2 fixed, 1 struck
```

Per round: who found how many. Per line: who found it, `both` when both did. Struck lines
stay visible with the reason. Last line: `PASSES` or `DOES NOT PASS`, the rounds, the counts.
Nothing is pushed or merged from here.
