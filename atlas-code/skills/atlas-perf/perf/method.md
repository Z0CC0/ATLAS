# Method — read for every performance task

## Five things before any change

1. **The operation.** One thing, reproducible by a command: this endpoint with this payload,
   this page on this network profile, this job on this file. "The app is slow" is not an
   operation; find the one.
2. **The correctness gate.** What must stay true: the tests, a checksum of the output, a row
   count, a diff against a saved result. No gate: build one first. Speed without it is how
   wrong answers ship fast.
3. **The metric.** One primary: wall time, p95, rows per second, bytes shipped, peak memory,
   cost per run. Others are watched, one decides.
4. **The baseline.** The operation as it is now, run at least five times, after a warm-up
   when caches matter. Report the median and the spread. The spread is the noise: no later
   difference smaller than it counts as an improvement.
5. **The budget.** How many variants, how long, how much money or load on shared systems. A
   target ("20× faster") is an ambition; the budget is what bounds the search.

One of the five cannot be established: say which and stop. That is the finding.

## Where the time goes

Measure before guessing: a profiler, a trace, query timings, the browser's performance
panel, timestamps around the stages. Name the stage that holds most of the metric. The part
that looks ugly is often not the part that is slow; an optimisation outside the bottleneck
changes nothing and costs complexity.

## The loop

1. One hypothesis: "most of the time is N round trips; one batched query removes them".
2. One variant that tests only that. Two changes in one variant cannot be told apart.
3. The same input, the same machine, the same number of runs as the baseline.
4. The correctness gate. Fails: the variant is rejected, whatever its speed.
5. Faster by more than the noise: it becomes the reference. Otherwise it is reverted; a
   change that does not help is not kept "because it cannot hurt".
6. Next hypothesis, against the new reference.

## Stop

The budget is spent; the next gain is inside the noise; the bottleneck has moved somewhere
this work does not own (a vendor, the network, a human); a variant would need to change what
is correct. Say which.

At the end, run the original baseline and the final variant once more, back to back. Numbers
from an hour ago on a machine that has since warmed up are not a comparison.

## Report

```
operation   POST /reports/monthly, 12 months, tenant 4821 rows
gate        response body sha256 equal to saved
metric      wall time, median of 7

variant        hypothesis                      time     ok   note
baseline       —                               8.4 s    yes  ±0.3 s
batch-query    one query, not one per month    1.9 s    yes  kept
parallel-4     months fetched concurrently     1.7 s    yes  within noise of previous — reverted
cache-result   cache the report 10 min         0.02 s   no   stale after a write — rejected, needs a decision

8.4 s → 1.9 s, 4.4×, confirmed back to back (8.5 s / 1.9 s)
stopped: next gains inside the noise
```

Every variant tried is a row, the rejected ones included: they are what stops the next
person trying them. "Best measured" is the claim; "optimal" is not made unless the whole
space was searched. Then: what was changed, in which files, and how to undo it.
