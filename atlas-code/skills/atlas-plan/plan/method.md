# Method — read for every plan

## Size it first

The ceremony follows the blast radius. Say the size in one line so the user can overrule it.

`trivial` — one file, a few lines, nothing to decide. No plan: say what will change and do
not gate.
`small` — one file or one function, clear once the code is read. Three lines: what, where,
how to know it worked.
`standard` — two to five files, one real choice. The full shape below.
`large` — many files, a new dependency, a public interface, a schema, or more than one open
question. The full shape, in phases that each leave the project working, and the open
questions listed before the steps.
Anything touching authentication, permissions, money, stored data or a public contract is at
least `standard`, whatever the file count.

## Ground it

Before the steps, read how the code around the change already does the same kind of thing,
and name one example each, with its position, for what applies: naming, error handling, data
access, logging, tests. The plan mirrors these. A plan that introduces a second way of doing
something the codebase already does one way says so and says why.

Reuse before writing: an existing function, a module in the repository, a library already in
the dependencies. A new dependency is a line in the plan with the reason and the alternative
without it.

## The shape

```
goal      one sentence: what will be true that is not true now
size      standard — 4 files, one choice (where validation lives)
assumes   the endpoint stays unauthenticated for now · v2 clients are not affected
mirrors   src/api/orders.ts:30  handler → service → repository
          tests/api/orders.test.ts:1  supertest, one file per route

1  src/domain/refund.ts          new: Refund type and the rule for partial refunds
     check: unit tests for 0, partial, full, over the charge
2  src/services/refunds.ts       new: issue(), calls the provider, records the result      after 1
     check: provider faked; timeout and duplicate request covered
3  src/api/refunds.ts            new route POST /refunds, validation like orders.ts:30      after 2
     check: 200, 400 bad body, 409 duplicate
4  migrations/0043_refunds.sql   new table; reversible                                       before 2 in deploy
     check: up, down, up

risks     the provider's sandbox does not return timeouts — fake them
          migration must ship before the code that writes the table
done when POST /refunds on a paid order returns the refund and the order shows it
not doing refund emails, admin UI
```

Each step: a number, the file, what happens to it, how to know it worked, and what it must
come after. A step is small enough to be reviewed alone and leaves the project building. Thin
slices through the whole stack before wide layers: the first step that can be run end to end
comes early.
`not doing` is part of the plan: the adjacent work that was noticed and left out.

## The gate

After the plan: stop. No file changes until the user says yes, or edits the plan and says
yes. "Go ahead" given in the same message as the request covers `trivial` and `small` only.
A plan that changed after approval is shown again before the changed part is carried out.
