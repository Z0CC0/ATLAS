# TypeScript and Node — also Bun, NestJS, Express, Fastify

## Types

`strict` on, and kept on. Types state what is true: a value that may be absent is typed as
such, and the code handles it.
Data from outside (a request, a file, an environment variable, another service, `JSON.parse`)
is `unknown` until a schema has parsed it; the static type is derived from the schema, so
the two cannot drift.
A union with a discriminant field for "one of several shapes"; a `switch` over it with a
`never` check in the default, so a new case fails to compile where it is not handled.
`type` or `interface` by the project's habit. No enums in new code unless the project uses
them: a union of string literals, or an `as const` object.
`readonly` and `as const` for what does not change. Return new values from functions;
mutate only what the function owns.
Generics when the relation between input and output types is real; not to avoid writing a
type.

## Modules

ES modules. Named exports; a default export only where the framework demands it.
No barrel file that re-exports a whole folder in application code: it defeats tree shaking
and creates import cycles. Imports through the project's path aliases when it has them.
One thing per file when it is a unit others import; helpers used once stay beside their
caller.

## Async

`async`/`await` throughout. Independent work started together and awaited with
`Promise.all`, or `allSettled` when one failure must not lose the rest; bounded concurrency
for large sets.
Every call that leaves the process has a timeout and takes an `AbortSignal` where the
caller can cancel.
Nothing blocks the event loop inside a request: no sync file or crypto calls, CPU-heavy
work in a worker or a job.

## Errors

`Error` subclasses with a stable `code`, thrown; caught at the edge (the HTTP error
handler, the job runner, the CLI entry) and mapped there. A result type in place of
throwing only where the project already does it.
`cause` when wrapping, so the original survives. Never an empty catch.
Unhandled rejections and uncaught exceptions log and exit; a process manager restarts.

## A service in Node

Layers by responsibility, whatever they are called: transport (parse, validate, map errors),
application logic (no HTTP, no SQL), data access. Dependencies passed in, not imported as
singletons, where tests need to replace them.
Configuration read once at start-up, validated with a schema, and the process refuses to
start if it is wrong. Nothing reads `process.env` after that.
Structured logs (JSON) with a request id; no `console.log` in a service.
Graceful shutdown: stop accepting, finish in-flight work, close pools, then exit.

NestJS: one module per feature; DTO classes with validation and a global validation pipe
that strips unknown fields; guards for authorisation, exception filters for the error
shape, configuration through the config module with a schema. Providers stay free of
request state unless request-scoped on purpose.

Bun: its own test runner, bundler and package manager; `bun.lock` is the lock file. Check
that a dependency with native bindings works under it before choosing it for production.

## Tooling

The package manager is the one whose lock file is in the repository; never mix. Scripts in
`package.json` are the interface: `build`, `test`, `lint`, `typecheck`. Node's version is
pinned (`engines`, `.nvmrc`), and new syntax or APIs are checked against it.
