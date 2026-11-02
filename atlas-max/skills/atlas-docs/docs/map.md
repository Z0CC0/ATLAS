# A map of the codebase — map, codemap, architecture overview

A short document that answers "where is it and what talks to what", for a person or a model
starting a session. It is a map, not a tour: lines, not paragraphs, and small enough to be
read whole every time.

## Read

The manifest and lockfile for the stack; the entry points (`main`, `index`, `app`, the
`bin` or `cmd` folder, route registration); the directory tree two levels deep; where state
lives (database, cache, queue, files); what is called over the network. Delegated to
`atlas-finder` when the repository is large.

## Write

One file per area that changes independently, and one at the top that points to them. For a
small project, one file. Each holds, in this order:

```
# Backend

updated  a3f9c1e  2026-10-03

## Flows
POST /refunds        api/refunds.ts → services/refunds.ts → repos/refunds.ts → postgres
webhook provider     api/webhooks.ts → services/refunds.ts#settle
nightly              jobs/sweep.ts → services/refunds.ts#expire

## Where things are
src/api/         routes, validation, auth middleware (auth.ts)
src/services/    business rules; no framework imports
src/repos/       SQL; one file per table
migrations/      numbered, each reversible

## Depends on
postgres  primary store          redis  rate limits, sessions
provider API  refunds, charges   s3  receipts

## Not obvious
amounts are integers in minor units everywhere
services never throw HTTP errors; api/ maps domain errors to status codes
```

`Flows` first: the paths through the system, entry to storage, one line each. `Not obvious`
last and never empty when there is something a newcomer would get wrong: units, invariants,
the one module that breaks the pattern. No description of what a web framework is. No file
listed that is not worth a line.

## Keeping it

The header carries the commit and date it was written from. On update: regenerate, compare.
A small difference is written. A large one, a third of the lines or more, is shown as a
summary first and written after a yes: either the code moved a lot or the map was wrong.

Where it lives: the project's existing place for such documents; none: propose
`docs/map.md`. It is linked from the README and from the project's agent instructions, not
copied into them.
