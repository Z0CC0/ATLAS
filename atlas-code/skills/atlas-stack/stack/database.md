# Databases — schema, queries, migrations; Postgres, MySQL, Redis, Prisma, ClickHouse

What a reviewer flags is in `atlas-review`'s `database.md`. This is how to design it.

## Schema

Types that mean what they hold: timestamps with time zone, exact decimals or integer minor
units for money, booleans not flags in strings, a real `uuid` or integer key, `text` over
arbitrary length limits. JSON columns for data that is truly schemaless, not to avoid
designing a table.
Constraints in the database: `NOT NULL`, foreign keys, unique, check. The application's
validation is for messages; the constraint is what holds under concurrency.
Keys: sequential integers or time-ordered UUIDs index well; random UUIDs fragment large
indexes.
Every table has `created_at`; `updated_at` where rows change. Soft deletion only when
needed, with unique indexes and queries that account for it.

## Indexes

For the queries that exist: the columns in `WHERE`, `JOIN` and `ORDER BY`, read from the
query plan (`EXPLAIN`), not guessed. Composite indexes ordered equality columns first,
then range or sort. Foreign key columns indexed. Partial and covering indexes where a
query deserves them. Each index slows writes: none without a query that uses it.

## Queries

Parameters always bound. Only the columns needed. Pagination by keyset (the last seen
key) for anything deep or live; offsets only for small, shallow lists.
N+1 avoided at the query: a join, a batch `IN`, or the ORM's eager loading.
Transactions short, with no network calls inside; rows locked in a consistent order;
`SELECT … FOR UPDATE`, optimistic versions, or an atomic `UPDATE … WHERE` for
read-then-write. Upserts through the engine's own statement.
A connection pool sized to what the database allows across all instances; a pooler in
front for serverless.

## Engine notes

**Postgres.** `EXPLAIN (ANALYZE, BUFFERS)` to see a plan. Indexes built `CONCURRENTLY` on
live tables. `jsonb` with a GIN index when queried. Row-level security where tenants share
tables. Autovacuum left on and watched.
**MySQL.** InnoDB, `utf8mb4`. The primary key is the clustered index, so keep it small.
Check the version before relying on a feature. Long transactions and metadata locks block
schema changes.
**Redis.** A cache or a fast structure store, not the only copy of anything unless
persistence is configured for it. Keys namespaced (`app:entity:id`); a TTL on everything
cached; the right structure for the job (hash, sorted set, stream). Atomic multi-step
logic in a script or a transaction. Never `KEYS` in production: `SCAN`. A lock is
`SET key value NX PX ttl` with a random value, released only by its owner.
**Prisma.** One client instance per process. `select` or `include` deliberately. The
interactive transaction has a short timeout: no slow work inside. `migrate dev` is for
development only and may reset data; production uses `migrate deploy`. Applied migration
files are never edited.
**ClickHouse.** For analytics over append-mostly data. The sort key is the design
decision: it follows the commonest filters. Inserts in large batches. Materialised views
for pre-aggregation. Updates and deletes are heavy and asynchronous.

## Migrations

Every change is a migration file in the repository; applied files are immutable.
Compatible with the code running before and after: add first (nullable or with a default),
deploy code that writes both, backfill in batches, switch reads, remove last, in a later
release. A rename is add, copy, switch, drop.
Schema changes apart from data changes. Large backfills batched and resumable, outside
the deploy. A way back for each step, or a statement that there is none.
Tried against a copy with realistic volume when the table is large: lock time is what
hurts.
