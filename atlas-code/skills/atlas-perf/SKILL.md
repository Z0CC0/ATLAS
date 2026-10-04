---
name: atlas-perf
description: >
  Makes something faster by measuring it: a baseline first, one change per attempt, the same
  input every time, and nothing kept that breaks correctness or sits inside the noise. Angles by
  the request: a page or bundle ("web vitals", "slow to load"), a query or endpoint ("slow
  query", "API is slow"), tail latency ("p99", "realtime"), bulk work ("import", "backfill",
  "throughput"). Use for "atlas perf", "make this faster", "why is this slow", "optimise" — in
  any language.
---

A speed-up that was not measured did not happen. A measurement with no baseline is a number.

## What to read

Everything below lives in the `perf/` folder beside this file.

1. `perf/method.md`, always: the five things that must exist before anything is changed, the
   loop, when to stop, the table.
2. By what is slow:
   a page, a render, a bundle, "LCP", "feels sluggish in the browser" → `web.md`
   a query, an endpoint, a job reading a database, memory growing → `backend.md`
   "p95", "p99", "latency", "realtime", "jitter", "sometimes slow" → `latency.md`
   "import", "export", "backfill", "ETL", "migrate N rows", "throughput" → `throughput.md`
   A build or a test suite that is slow: `method.md` alone; the operation is the command.

## Who measures

The `atlas-runner` subagent runs benchmarks and profilers, when it exists: timings come back,
logs do not. Page measurements go through `atlas-browser` when it exists.

## Boundaries

Correctness is not traded for speed without a yes: a variant that changes a result, drops a
check, weakens consistency or durability is reported as such and never becomes the default
by itself.
No infrastructure is resized, no index is created on a real database, no cache is flushed
in production: those are proposed with the command.

## Form

The active compression level governs the prose. It never overrides the variant table in
`method.md`. Numbers carry their unit and the count of runs behind them.
