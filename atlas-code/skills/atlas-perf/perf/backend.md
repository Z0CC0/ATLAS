# A query, an endpoint, a job — slow API, slow query, memory growing

## Measure

Per request or per run: total time, time in the database and the count of queries, time in
calls to other services, time in the code itself. Most frameworks and ORMs can log queries
with durations; a trace does it across services. For a single query, the database's own plan
with real timings (`EXPLAIN ANALYZE` or the engine's equivalent), on data of production
size: a plan on ten rows says nothing about ten million.

## Where it usually is

**Many queries where one would do.** A related row fetched inside a loop over parents. The
count of queries growing with the size of the result is the signature. Fix: a join, an eager
load, one query with `IN`, a data loader.
**A query that reads far more than it returns.** A sequential scan on a filtered or joined
column with no index; an index that exists and is not used because of a function on the
column, a type mismatch, a leading wildcard; sorting a large set to take ten rows. Fix: the
index that matches the filter and the sort, or the query rewritten to use the one that
exists. An index is proposed with its statement and its cost: every write pays for it.
**Fetching more than is needed.** `SELECT *` for two fields; whole objects where a count
would do; no limit on a list; a large response serialised and compressed on every request.
**Waiting on others, in sequence.** Calls to independent services made one after another;
no timeout, so one slow dependency holds the request; a connection opened per request where
a pool exists.
**Doing in the request what could be done before or after it.** Work that could be
precomputed, cached with a clear rule for when it goes stale, or pushed to a queue and
answered with "accepted".
**Lock contention.** Long transactions holding rows others need; a hot row every request
updates.

## Caching, when it is the answer

A cache is a second copy of a fact, and the second copy is wrong the moment the first
changes. Before adding one, write down: what the key is, when the entry stops being true,
what removes it then, and what a reader sees in between. No answer to "when does it stop
being true": no cache. A cache keyed by the content's hash invalidates itself; a cache keyed
by a path or an id needs an invalidation that somebody has to remember.
For results computed from files (parsing, extraction, rendering): the key is a hash of the
file's bytes plus the version of the code that produced the result, so a renamed or moved
file still hits and a changed one never does. The cache sits in a wrapper around the pure
function, not inside it.

## Memory

Growing without bound: a collection that is only ever added to (a module-level map, a
listener list, a cache with no eviction); references held by closures, timers and
subscriptions never released; whole files or result sets loaded where a stream would do.
Measure with heap snapshots taken at intervals under steady load: what grows between them
is the answer. A large peak that falls back is a sizing question, not a leak.

## Variants worth a row

One query batched; one index; one field list narrowed; two calls made concurrent; one
result cached with its rule. Each alone, against the same request.
