# Trace — how one feature works, before changing it

Not the whole repository (`onboard.md`) and not a map of it (`map.md`): one feature or one
area, followed from where it starts to where it ends, so that the next change lands in the
right place.

## Follow it

1. **Where it starts.** Every way in: a route, a command, a button's handler, a scheduled
   job, a message on a queue, a webhook. A feature often has more than one, and the second
   is the one that gets forgotten.
2. **The path.** From each entry, the calls in order until the work is done: what is
   validated and where, what is read, what is written, what is sent out. At every branch,
   what decides it. At every asynchronous step (a queue, a callback, an event), where the
   work picks up again.
3. **What the data becomes.** The shape that comes in, each place it is transformed, the
   shape that is stored or returned.
4. **How it fails.** Where errors are raised, where they are caught, what the caller sees.
   A failure that is caught and dropped is noted.
5. **What it leans on.** Shared helpers, other modules, outside services, configuration
   and feature flags that change its behaviour.
6. **What proves it.** The tests that cover the path, and the parts of the path no test
   reaches.

Search with the `atlas-finder` subagent when it exists; read only the functions on the
path, not the files around them. Stop at the boundary of the feature: a call into a shared
service is named, not followed.

## Say it

```
entry    POST /api/orders          src/routes/orders.ts:22
         nightly retry job         src/jobs/retry-orders.ts:9
path     validate body             src/routes/orders.ts:31   (schema in src/schemas/order.ts)
         price and tax             src/services/pricing.ts:48
         reserve stock             src/services/stock.ts:17  → fails: 409 to caller
         write order + items       src/db/orders.ts:60       one transaction
         publish order.created     src/events/bus.ts:12      async: mailer, analytics
fails    payment timeout is caught and logged, order stays "pending"  src/services/pay.ts:88
leans    feature flag NEW_TAX      src/config/flags.ts:14
tests    routes and pricing covered; the retry job has none
reuse    pricing.ts for any new total; do not write to orders outside db/orders.ts
```

Every line has a position. `reuse` says what a change should build on and what it should
not go around: it is the reason the trace was asked for. A step that could not be followed
(code loaded by name, a service outside the repository) is written as `not followed`, with
where the trail stops.

Said back in the conversation. Written to a file only when asked, and then by the rules of
`sync.md`.
