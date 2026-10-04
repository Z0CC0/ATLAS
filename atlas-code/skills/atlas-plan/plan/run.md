# Run — carrying a plan through to a commit ready for approval

Read with `operations.md`. This part does none of the work itself: it decides which phases
the request deserves, hands each to the skill that does it, and stops twice for a yes.

## Size, stated first

One line, so the user can overrule it. The highest tier any column reaches:

| size | files | new dependency or contract | open choices | phases |
|---|---|---|---|---|
| trivial | one, a few lines | none | none | build → review → commit |
| small | one file or function | none | clear once read | (look) → build → review → commit |
| standard | two to five | maybe an internal module | one | look → plan → build → review → commit |
| large | many, cross-cutting | external dependency, public API, schema, or a spec | several | look → plan → (scaffold) → build → review → commit |

Work that reaches one of the security triggers listed under Review, or changes a public
contract, never runs below `standard`.

## Phases

**Look.** What exists: the code this touches, how it does things, whether something already
solves it: in the repository first, then in the dependencies already installed, then in a
library worth adding (the `atlas-catalog` subagent searches outside, when it exists).
Adopting something proven beats writing it. Kept short; positions, not
file contents.

**Plan.** By `method.md`, sized as above. Steps as thin slices through the whole stack, each
leaving the project building. → **Gate 1.**

**Scaffold.** `mvp` only: the first slice end to end, however thin, so every later step has
something running to attach to.

**Build.** Each step of the plan through test-first: the test that states the behaviour, seen
failing, the least code that passes it, the suite, tidy. The operation's first move decides
what the first test is. A broken build on the way goes to `atlas-fix` and comes back.

**Review.** `atlas-review` on the whole diff, pre-merge angles. Plus the security angle when
the diff touches: authentication or authorisation, user input reaching a query, a path, a
shell, a template; stored data or a migration; an external API call; cryptography; secrets.
Every `breaks` line is fixed and re-reviewed before going on. `fragile` lines are fixed or
listed at Gate 2 for the user to decide.

**Commit.** `atlas-verify` first; then the message from `atlas-commit`, one commit per
logical piece. → **Gate 2.**

## The two gates

**Gate 1, after the plan.** Show the plan. No implementation file changes until a yes. Skipped
for `trivial` and `small` only when the request already said to go ahead.

**Gate 2, before the commit.** Show:

```
done      3 of 3 steps
verify    READY — build, types, lint passed · tests 57 passed (53 → 57)
review    nothing found · 1 fragile left for you:
          src/services/refunds.ts:58  fragile  provider timeout leaves `pending` forever. A sweep job, not in this plan.
changed   4 files, +212 −8
commits   feat(refunds): issue partial and full refunds through the provider
          chore(db): add refunds table (reversible)
```

Nothing is committed until a yes. A `no` with a reason goes back to the phase the reason
belongs to, not to the start.

Between the gates the work flows without stopping and without commentary. Three things still
interrupt it: an action that cannot be undone; a step that turns out to need what the plan
did not approve (a new dependency, a schema change, a file outside the plan); the same
failure twice.

## What passes from phase to phase

The plan is the handoff: its steps drive the build, its `done when` is what verify and Gate 2
are measured against, its `not doing` is what review marks `outside`. Nothing else is carried
in the model's head. If the conversation is long, the plan is re-read from where it was
written, not from memory.

## At the end

After the yes at Gate 2 and the commit: one line with the commit hashes. No recap.
