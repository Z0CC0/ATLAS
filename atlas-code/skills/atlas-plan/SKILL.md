---
name: atlas-plan
description: >
  Turns a request into steps before any code is written, sized to the change, grounded in how
  the codebase already does things, and waits for a yes. Angles by the request: "architecture",
  "design" (options and trade-offs); "X or Y", "decide" (independent voices, then a verdict);
  "what does this code do", "spec" (behaviour read from code); "record", "ADR" (the decision
  written down); "build this", "add a feature", "fix this bug properly", "from this doc" (the
  plan carried through tests, review and a commit, with a yes after the plan and before the
  commit). Use for "atlas plan", "plan this", "how would you build" — in any language.
---

A plan is the cheapest place to be wrong. It is read, corrected and approved before a file
changes.

## What to read

Everything below lives in the `plan/` folder beside this file.

1. `plan/method.md`, always: size the work, ground it, the shape of a step, the gate.
2. By the words of the request, on top of it:
   "architecture", "design", "structure", "how should this be organised", "contract",
   "boundary" → `design.md`
   "X or Y", "which", "should we", "decide", "second opinions", "council" → `decide.md`
   "what does this do", "spec", "document the behaviour", "before I change this" → `specs.md`
   "record", "write it down", "ADR", "decision log" → `record.md`
3. Run mode, when the request is for the work and not only the plan: "build this", "add",
   "implement", "change it so that", "fix this bug properly", "refactor this safely", "build
   it from this doc", or a yes at the gate followed by "go" → `run.md` and `operations.md`.

"Plan this", "how would you": the plan and its gate, nothing more. Unsure whether the user
wants the plan or the work: the plan; its gate is where they say which.

## Run mode: which operation

"add", "new", "build", "implement", and the thing does not exist yet → feature
"change", "should instead", "make it do", and the thing works today → change
"bug", "broken", "wrong", "crash", "regression", "error when" → defect
"refactor", "clean up", "restructure", with behaviour staying → refactor
"from this doc", "MVP", a path to a design document → mvp
Cannot tell between change and defect: one question, "is the current behaviour what was
intended?" Yes is a change, no is a defect; they start differently.

## Run mode: who does what

How code is written in this project's language and framework → `atlas-stack`, read once
before the first step that writes code. Tests and the code they drive → `atlas-test`,
test-first. A build that breaks on the way →
`atlas-fix`. The moves of a refactor → `atlas-refactor`. Review → `atlas-review`, with the
security angle when `run.md` says so. The checks before the second gate → `atlas-verify`.
The commit message → `atlas-commit`. A skill that is not installed: its phase is done
inline by the same rules, and the report says so.

## With the dials

`ask` on: the questions come first, one at a time, by the rules of that dial; the plan is
written when the next answer would not change it. `ask` off: the plan states its assumptions
in one block at the top, each one something the user can strike.
`check` on: every claim about the codebase in the plan carries its `file:line`; a library or
API named in a step is looked up, not remembered.

## Finding the code

Where things are: the `atlas-finder` subagent when it exists, so the search does not fill the
conversation; positions come back, files do not.

## Boundaries

Outside run mode this skill writes no code and changes no file, except a plan or a decision
record when the user asks for one on disk, and it ends at the gate.
In run mode: never commits, pushes, installs or migrates without the yes at the gate that
covers it. Never widens the request: work noticed on the way is listed under `not doing` in
the plan or as `outside` in the review, and left.

## Form

The active compression level governs the prose. It never overrides the plan format in
`method.md` or the gate format in `run.md`. Between the gates nothing is narrated: the calls
are the progress. A plan written to a file is for other readers: ordinary prose,
uncompressed.
