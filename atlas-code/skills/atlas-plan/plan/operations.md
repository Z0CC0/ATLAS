# The five operations — what each one does first

The pipeline is the same. What differs is the smallest size each starts at, which phases it
can skip, and the first move of the build phase: the thing that proves this kind of work was
done as that kind of work.

## feature — it does not exist yet

At least `small`; usually `standard`.
Look is not skipped: the commonest waste is building what a dependency already does.
First move: the test for the thinnest version of the behaviour that a user could observe end
to end. Then widen: the errors, the boundaries, the second case.
Done when the `done when` of the plan can be shown, not when the code is written.

## change — it works, and should work differently

At least `small`.
Look: `specs.md` on the part being changed, so what must stay is written down
before anything moves.
First move: change the existing tests to state the new behaviour, and watch them fail against
the old code. Tests that still describe behaviour meant to stay are not touched; a test that
goes red and was not meant to is a side effect to look at, not to update.
Callers of the changed behaviour are found and listed in the plan; each either still works or
is a step.

## defect — it is broken

Often `trivial` or `small`; the plan phase runs only when the cause is not obvious.
The cause before the fix: follow the data from where it enters to where it goes wrong; change
nothing until one explanation covers every symptom reported.
First move: a new test that reproduces the bug and fails for that reason. A bug with no
failing test first is a guess with a patch. If it cannot be reproduced, that is the finding:
say what was tried and stop.
Then the smallest change that turns it green, and the suite. The commit says what was wrong,
not only what changed.
Look for the same mistake in the neighbouring code; each occurrence is a line at Gate 2, not
a silent extra fix.

## refactor — behaviour stays, structure improves

At least `small`.
First move: the suite green, and a note of what it does not cover in the code about to move.
Uncovered behaviour gets a test before the move, through `atlas-test`; a refactor of untested
code is a rewrite with hope.
Then one move at a time: extract, rename, relocate; the suite after each; every intermediate
state builds and passes. No behaviour change in the same commit as a move. A test that needs
to change is a sign the behaviour changed: stop and look.
Dead code found on the way is listed, not removed, unless removing it was the request.

## mvp — from a document

Always `large`.
Intake: read the document; extract the scope, the decisions it already made, the list of
features, and what it leaves open. The open items are asked before the plan, one at a time.
Plan: vertical slices, the first one the thinnest path a user can walk from start to finish,
with the rest stubbed. Each later slice replaces a stub.
Scaffold runs: project layout, the build, one test passing, the first slice running. That is
shown at Gate 1 together with the plan for the rest.
The document's locked decisions are not reopened; a problem with one is raised once, with the
reason and an alternative, and then the document wins unless the user says otherwise.
