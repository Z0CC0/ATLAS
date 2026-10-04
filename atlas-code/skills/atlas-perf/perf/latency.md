# The slow tail — p95, p99, realtime, jitter, "sometimes slow"

When the average is fine and some requests are not, the average is the wrong number. The
work here is on the distribution.

## Split the metric

Report p50, p95, p99 and the maximum, with the number of samples: a p99 from a hundred
requests is one request. Separate what the user waits for into its parts: time queued before
the work starts, time doing the work, time waiting on others, time getting the answer back.
A tail that is all queue time is a capacity or scheduling problem, not a slow function.
Measure under the load it will really see: tails appear under concurrency and disappear on
an idle machine.

## Map the hot path

The steps a request takes on the critical route, in order, each with its share of the time
at p50 and at p99. The step whose share grows most between the two is where the tail is
made.

## What makes a tail

Something that happens to some requests and not others:
a cache miss, the first request after a deploy, an expired entry refilled by many callers at
once;
garbage collection pauses, memory pressure, a full buffer;
a lock, a connection pool with no free connection, a thread pool at its limit;
a retry, a timeout waited out in full before a fallback;
one large input among small ones: a tenant with a hundred times the data;
a noisy neighbour: a batch job, a backup, a compaction on the same machine or database;
a dependency with its own tail, multiplied when several are called in sequence.

## Order of attack

1. Remove work from the hot path: what can be precomputed, deferred, or dropped.
2. Bound the waits: timeouts shorter than the caller's patience, on every outside call.
3. Stop the stampedes: one refill per key, stale-while-revalidate, warm-up before taking
   traffic.
4. Isolate: separate pools or queues for slow and fast work so one cannot starve the other.
5. Only then make the remaining work faster.
Adding capacity before 1 to 4 buys a smaller tail at a higher bill.

## Verify

The same load, long enough to collect the tail: thousands of requests, not dozens. Compare
distributions, not single numbers; a lower p50 with a worse p99 is not an improvement for a
system judged on its tail. Check that errors did not rise: a timeout that turns a slow
success into a fast failure improves the latency chart and nothing else.

## Guardrails

No timing-dependent change is declared done on a developer machine. No retry is added
without a limit and a backoff. No timeout is raised to hide a tail.
