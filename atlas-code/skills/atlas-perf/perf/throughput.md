# Moving a lot of data — import, export, backfill, ETL, "N million rows"

## First distinction

Is it slow because each item is slow, or because items are handled one at a time? Time one
item alone, then a thousand. If a thousand take a thousand times one, the cost is per item
overhead: round trips, transactions, connections. That is the usual case and the cheap one
to fix.

## Measure

Rows or bytes per second, end to end, and per stage: read, transform, write. The slowest
stage sets the rate; speeding up another changes nothing. Watch the destination too: its
CPU, its locks, its replication lag. A job that finishes fast and leaves the database
unusable for an hour did not get faster.

## What usually multiplies the rate

**Batching.** Many rows per statement and per transaction; bulk load paths (`COPY`, bulk
insert APIs, multi-row upserts) where the store has them. Batch size is a variant to
measure: gains flatten, and a huge batch holds locks and memory.
**Fewer round trips.** Look-ups done once into memory or joined in the store, not one query
per row.
**Streaming.** Read, transform and write in a flow with bounded memory; never the whole
input in a list.
**Parallelism, bounded.** Workers up to what the destination can take, found by measuring:
past that point throughput falls and errors rise. Partition so workers do not contend on the
same rows.
**Doing less.** Only the columns needed; only the rows that changed; indexes and
constraints that can be safely built after the load rather than maintained during it, when
the store and the situation allow and the user agrees.

## It has to survive being interrupted

A job of hours will be stopped: a deploy, a crash, a limit. So: progress recorded as it goes
(a cursor, a high-water mark, a table of done batches); each batch safe to run twice, by
upsert or by a key that makes the second run a no-op; restart resumes, it does not begin
again or duplicate. Test it by killing it halfway.

## Account for every row

At the end, numbers that add up:

```
read        4,812,330
written     4,811,902
skipped           411   already present
rejected           17   see rejected.csv — invalid date in column 7
elapsed     00:41:18    1,941 rows/s  (baseline 212 rows/s)
```

Read equals written plus skipped plus rejected, or the difference is a bug. Rejected rows
are kept with their reason, never dropped silently.

## Guardrails

A dry run on a sample first. On a shared or production store: rate-limited, off-peak when
possible, with a stop switch, and only after a yes. Nothing is deleted or overwritten at the
source until the destination has been verified.
