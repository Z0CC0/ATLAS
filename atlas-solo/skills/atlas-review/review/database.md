# Database and migrations — when the diff has SQL, ORM calls or a migration file

## breaks

A query with input in the string: the parameterised form of the driver or ORM is the fix,
named.
A migration that drops or renames a column, table or enum value in the same deploy that stops
writing it: the old code is still running when it applies. Two deploys: make it nullable or
add the new one first, remove in the next.
A migration with data movement and no reverse step; a long `UPDATE` on a big table inside one
transaction with no batching; a new `NOT NULL` column without a default on a populated table;
a unique index created without `CONCURRENTLY` (Postgres) on a live table.
A multi-step write with no transaction, so a failure between steps leaves half.
`bulk` insert with conflicts silently ignored where the caller believes all rows landed.

## fragile

N+1: a related row loaded inside a loop over parents; the fix names the join, the eager load
or the batch call of the ORM in use.
A list query with no `LIMIT`/paging on a user-facing path; `SELECT *` feeding a response
object that should not carry every column.
A filter or foreign key column with no index, on a table that grows.
A read of a row followed by a write that depends on it, with no lock or version check, under
concurrency.
Timestamps stored without timezone where the application spans one; money stored as float.
A model change without the matching migration (the ORM's check command tells).
Connection or cursor opened without the closing path; pool size changed without the reason.

## unclear

A query the ORM could express written as raw SQL, or the reverse, against the project's
habit; a column named differently from its siblings; an index that duplicates a prefix of
another.

## Not findings here

Naming of migrations; SQL keyword case; ORM versus query builder taste when the project is
consistent.
