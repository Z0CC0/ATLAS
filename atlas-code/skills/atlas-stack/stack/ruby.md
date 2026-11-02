# Ruby and Rails

Check the Ruby and Rails versions in the `Gemfile.lock` first: defaults (the asset
pipeline, the job backend, the cache store) differ between major versions.

## The language

Small methods, intention-revealing names, predicates ending in `?`, dangerous variants in
`!`. Guard clauses over nesting. Enumerable methods over manual loops.
Keyword arguments for anything beyond one or two parameters. Frozen string literals.
`Struct` or `Data` for small values. Exceptions inheriting from `StandardError`, rescued
specifically, never a bare `rescue` that swallows.
The project's RuboCop configuration decides style.

## Rails — where things go

The framework's directories are a contract: follow it, so the next person finds things.
Controllers thin: find, authorise, call, respond. Strong parameters always.
Models hold persistence, validations, associations, scopes and rules about one record.
Work that spans models, calls outside, or has steps: a service object, a plain Ruby class
with one public method, under `app/services` or where the project keeps them.
A form object when one form writes several models; a query object for a complex search.
Concerns for a behaviour genuinely shared by several models, small and named for what it
adds; not a place to hide half of a fat model.

## Callbacks

Fine for keeping a record's own data consistent (normalising a field, setting a default).
Not for side effects outside the record: sending mail, calling an API, touching other
models. Those are called explicitly by whatever performed the action, or run after commit
in a job.

## Active Record

Associations preloaded where they are walked (`includes`, `preload`, `eager_load`); strict
loading in development to make an N+1 fail. Scopes for reusable conditions. `pluck`,
`exists?`, `count` and `select` in place of loading records to throw them away.
`find_each` or batches for large sets; `insert_all`, `upsert_all`, `update_all` for bulk
work, knowing they skip validations and callbacks.
Counter caches for counts shown in lists. Transactions around multi-step writes.
Constraints and indexes in the database as well as validations in the model: uniqueness
checked only in Ruby loses races.
Parameters bound, never interpolated into SQL strings.
Migrations reversible, safe on a live table (`database.md`).

## Jobs

Anything slow or external goes to Active Job. Arguments are ids or simple values. Jobs are
idempotent and may run twice; retries with backoff on errors that can pass, discarded on
ones that cannot. Enqueued after the transaction commits.

## Views and front end

Logic out of templates: helpers, presenters, or view components when the project uses
them. Partials with explicit locals.
Hotwire where the project has it: Turbo frames and streams for partial updates, Stimulus
controllers small and reusable, before reaching for a client framework.
Output is escaped by default; `html_safe` and `raw` only on content the code built.

## Security and configuration

Authorisation checked on every action, including ones reached by id, with the project's
policy library. CSRF protection on. Secrets in credentials or the environment.
Mass assignment only through permitted parameters. Brakeman and dependency audits in CI
when configured.
