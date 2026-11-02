# From the spec to the plan

A spec says what; the plan says in what order and where. The handoff is the moment the two
are checked against each other, before any code, because a gap found here costs a sentence
and the same gap found in review costs a day.

## What the plan needs from the spec

For each "done looks like" statement, the acceptance that proves it: the plan's last step for
that statement is running that proof. A statement without acceptance is handed back to the
spec, not guessed at.
The constraints, verbatim: the plan may not relax one; it may refuse one, with the reason, and
that goes to the open questions.
The "out" list: the plan contains nothing from it, and when a step would need something that
is out, the step says so and stops at the boundary.
The open questions: each one is either answered (by whom, when) before the step that depends
on it, or the step is written for the stated assumption with a marker to revisit.

## The check, in order

1. Every requirement has at least one step that produces it and one proof that verifies it.
   A requirement with no step is a gap in the plan; a step with no requirement is scope creep
   or an enabling step that must say which requirement it enables.
2. Every edge case in the behaviour section appears in a test or a manual check in the plan.
3. The constraints that are numbers (size, time, count) have a measurement step with the
   threshold copied from the spec.
4. Nothing in the plan names a technology the spec forbids or that contradicts a constraint.
5. The order of steps lets the first "done looks like" statement be demonstrated as early as
   possible: a plan that proves nothing until the last step is a plan to reorder.

## What comes back

A short list of the gaps found, each with the section of the spec and the step of the plan it
concerns and whether the spec or the plan should change. Then `atlas-plan` takes it, when the
build has it; otherwise the plan is written here in `atlas-plan`'s shape: steps, each with the
files it touches, the proof, and what it depends on.

## When there is no plan yet

"Build from this spec": the handoff is the plan's input. Read the spec whole, run the five
checks against an empty plan (they become the list of steps), then stop and show the plan;
the yes to build is a separate yes, every time.
