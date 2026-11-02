# Python — also FastAPI, Django, Celery

## The language

Type hints on every function signature; checked by the type checker the project runs. The
built-in generics (`list[str]`, `X | None`) on the versions that have them.
`dataclass` (frozen when it is a value) or a Pydantic model for structured data, not bare
dicts and tuples passed across layers. `Enum` for closed sets. `Protocol` to describe what
a dependency must do, in place of a base class.
`pathlib` for paths, f-strings for formatting, context managers for anything that must be
released. Comprehensions when they fit on a line or two; a loop when they do not.
Exceptions: specific types, raised with context (`raise … from err`), caught where
something can be done. Never a bare `except`, never a default mutable argument.
Functions small, pure where possible; module-level code does nothing but define.

## Project

One tool for dependencies and environments, the one the lock file shows. Configuration in
`pyproject.toml`. Formatter and linter as configured; import order is theirs to decide.
Settings read once from the environment through a typed settings object, validated at
start. `logging` with a configured logger per module; no `print` in a service.
Async only where the framework and the libraries are async all the way down: one blocking
call inside an event loop stalls every request.

## FastAPI

An app factory and a lifespan handler for start-up and shutdown resources.
Pydantic models at the edge: one for input, one for output, never the ORM model as the
response. `response_model` set, so nothing unintended leaks.
Dependencies (`Depends`) for the session, the current user, pagination; authorisation as a
dependency, not a line inside each handler.
Routers by feature; handlers thin, logic in services that know nothing of HTTP.
`async def` handlers only with async drivers; otherwise plain `def`, which runs in a
thread pool. Exception handlers give one error shape.

## Django

A custom user model from the first migration. Settings split by environment, secrets from
the environment, `DEBUG` off and `ALLOWED_HOSTS` set in production.
Business rules in model methods, managers and query sets, or a service module for work
spanning models; views and serialisers stay thin.
Queries: `select_related` and `prefetch_related` where relations are walked; `only`,
`values`, `exists`, `count` in place of loading rows; bulk operations for many rows;
`transaction.atomic` around multi-step writes; constraints and indexes declared on the
model.
The ORM's parameterisation is the defence against injection: no string-built SQL in `raw`
or `extra`. Templates escape by default: `mark_safe` only on content the code built.
CSRF protection stays on; permissions declared per view or viewset, with object-level
checks where rows belong to users.
Signals sparingly: an explicit call is easier to follow.
Migrations: one concern each, reversible, data changes apart from schema changes
(`database.md`).

## Celery

Tasks take ids and plain values, never model instances. Idempotent: a task may run twice.
`acks_late` with idempotence for work that must not be lost. Retries with backoff and a
cap, only on errors that can pass. Time limits on every task. Results stored only when
something reads them. A task is queued after the transaction commits
(`transaction.on_commit`), or it may run before its row exists.
