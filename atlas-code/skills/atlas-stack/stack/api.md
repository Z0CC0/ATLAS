# HTTP APIs and service structure

The project's existing endpoints are the style guide: a new one looks like its neighbours.
This fills in what they do not decide.

## Resources and methods

Nouns, plural, lower case with hyphens; nesting one level at most for things that only
exist inside a parent. Actions that are not CRUD: a sub-resource or a verb at the end,
used rarely.
`GET` reads and changes nothing; `POST` creates or acts; `PUT` replaces; `PATCH` changes
part; `DELETE` removes. `PUT` and `DELETE` are safe to repeat; `POST` is made so with an
idempotency key where a duplicate would hurt (payments, orders).

## Status codes that tell the truth

`200` with a body, `201` with the new resource and its location, `204` with none, `202`
for accepted work that finishes later.
`400` malformed, `401` not authenticated, `403` authenticated and not allowed, `404` not
there (also for things the caller may not know exist), `409` conflict with current state,
`422` well-formed and invalid, `429` too many requests with `Retry-After`.
`5xx` only for the server's own failures. Never `200` with an error inside.

## Shapes

One success shape and one error shape across the API. An error carries a stable
machine-readable code, a message for people, and per-field details for validation; never
a stack trace or an internal name.
Field naming consistent in one case. Timestamps in ISO 8601 UTC. Money as integer minor
units or a decimal string, with the currency. Ids as strings.
Lists are paginated from the first version: a cursor for anything large or changing,
offset only for small sets; a stated maximum page size. Filtering and sorting through
named query parameters, validated against an allow-list of fields.
Unknown input fields rejected or ignored, by one rule applied everywhere.

## Compatibility

Adding a field or an endpoint is compatible; removing, renaming, changing a type or a
meaning is not. Breaking changes go in a new version (by the project's scheme), with the
old one kept for a stated time and its use measured before removal.
The contract is written down (OpenAPI or the project's equivalent) and generated from or
checked against the code, so it cannot drift.

## Across every endpoint

Authentication on everything not explicitly public. Authorisation per object, not only per
route: the caller may reach this row. Input validated by schema at the edge. Rate limits,
stricter on login and expensive operations. Request size limits. CORS with named origins.
A request id accepted or generated, returned, and logged.

## One more integration

Adding a provider, a connector or a plugin beside existing ones: open two that are already
there and copy their shape exactly: the files, the interface, how configuration and
credentials are read, how errors are mapped, how they are registered and tested. A second
way of doing integrations is worse than a slightly awkward fit to the first.
Everything specific to the outside system stays inside the connector; the rest of the code
sees the project's own types. Contract tests against recorded responses, with secrets
stripped from the recordings.

## Inside the service

Three responsibilities kept apart, whatever the folders are called: the edge (decode,
validate, authorise, encode), the application logic (rules, no HTTP and no SQL), and
access to data and other systems.
Where the project isolates the outside world behind interfaces (ports and adapters): the
logic defines what it needs, the adapters implement it, one place wires them. Worth it
when there are several adapters or the logic is tested without infrastructure; not for a
CRUD service.
Errors: domain errors are typed and raised where they happen; translated to the error
shape in one place at the edge; the unexpected is logged with context and returned as a
plain `500`.
Calls to other services: a timeout, retries with backoff and jitter only for idempotent
operations and transient failures, and a limit so a failing dependency does not take the
caller down.
Work that is slow or can fail independently goes to a queue, with idempotent handlers.
