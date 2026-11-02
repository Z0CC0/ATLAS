# Structure — when the request says architecture, design, structure, contract, boundary

## What is there now

Before proposing anything: the modules involved, what calls what, where state lives, where
the data crosses a process or a network. From the code, with positions; a diagram in words is
enough. What hurts today, stated as an observation: "three handlers build the same query by
hand", not "the architecture is messy".

## Options

At least two that could really be chosen, never one option and a strawman. For each:
what it is, in two lines;
what it costs now: files, concepts, dependencies;
what it costs later: what becomes harder to change;
what would have to be true for it to be the wrong choice.
"Do nothing" or "do the smallest thing" is always one of the options and is written with the
same care.

Then the recommendation, one line, with the reason that decided it, and how expensive it is
to reverse: an afternoon, a migration, a rewrite. The cheaper a choice is to reverse, the less
argument it needs.

## Rules that hold in any design

A boundary is put where something really changes independently: a vendor, a storage engine,
a team, a deploy. An interface with one implementation and no second in sight is a cost, not
a design.
Dependencies point from detail to rule: the business logic does not import the web
framework, the database driver or the vendor SDK; they import it.
One owner per fact: a value stored in two places has two versions.
No abstraction for code used once. Three similar things before a shared one.

## When two sides meet

A front end and a back end, two services, a library and its callers: the contract first, as
one machine-checkable artifact (an OpenAPI or JSON schema, a protobuf, a typed client
generated from it, a shared type package). Written from what the consumer needs to do, not
from what the provider happens to have. Both sides are built and tested against the artifact;
types on one side and hope on the other is not a contract. A change to it names who consumes
it and whether old consumers keep working.

## Output

The plan format in `method.md`, with one block before the steps:

```
now       handlers build queries inline (orders.ts:44, users.ts:61, export.ts:20)
options   A  repository module per aggregate — 3 new files; queries in one place
          B  query builder helper — 1 file; duplication stays, shorter
          C  leave it — nothing now; fourth copy coming with refunds
choose    A — the refund work adds a fourth copy either way; reversible in an afternoon
```
