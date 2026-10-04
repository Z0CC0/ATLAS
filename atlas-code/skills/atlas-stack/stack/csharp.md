# C# and .NET — also ASP.NET Core, EF Core

Check the target framework and language version in the project file before using newer
syntax.

## The language

Nullable reference types enabled and honoured: no `!` to quiet a warning without a reason.
Records for values and DTOs; `init` or `required` properties; immutable collections or
read-only interfaces in public signatures.
Pattern matching and `switch` expressions over chains of `if` and casts.
`var` when the type is obvious from the right-hand side. File-scoped namespaces, primary
constructors and collection expressions where the project uses them.
Guard clauses at the top (`ArgumentNullException.ThrowIfNull` and friends).
Exceptions for the exceptional, specific types, never caught and swallowed; a result type
for expected business failures when the project has one.
`IDisposable` and `IAsyncDisposable` through `using`.

## Async

`async` all the way: no `.Result`, `.Wait()` or `GetAwaiter().GetResult()` on a task.
`CancellationToken` accepted and passed down by anything that does I/O.
`Task.WhenAll` for independent work. `async void` only for event handlers.
`ValueTask` only where measured. `ConfigureAwait(false)` in library code, by the project's
rule.
`IAsyncEnumerable` for streams of results.

## Dependency injection and configuration

Constructor injection against interfaces where a second implementation or a test double
exists. Lifetimes chosen deliberately: a scoped service is never captured by a singleton.
The options pattern: settings bound to a typed class, validated at start-up
(`ValidateOnStart`). Secrets from the environment, user secrets locally, a vault in
production.
`HttpClient` through the factory, typed clients, with timeouts and a resilience policy.
`ILogger<T>` with message templates and named placeholders, not interpolated strings.

## ASP.NET Core

Minimal APIs or controllers, whichever the project uses; endpoints grouped by feature.
Request and response DTOs, never entities. Validation at the edge.
One exception handler producing problem details for every error.
Middleware order matters: exception handling, HTTPS, routing, CORS, authentication,
authorisation, endpoints.
Authorisation by policy, with resource-based checks where rows belong to users.
Background work in hosted services that honour the stopping token and create their own
scopes.

## EF Core

A `DbContext` per unit of work, scoped. Queries project to DTOs with `Select`;
`AsNoTracking` for reads. Related data loaded on purpose (`Include`, or a projection);
lazy loading off.
`async` query methods with the cancellation token. No client-side evaluation hidden in a
query; no `ToList` before filtering.
Migrations checked in, reviewed as SQL, applied by the deployment, not at application
start in production. Concurrency tokens where two writers can meet. Bulk changes with the
set-based update and delete methods.

## Project

Warnings as errors where the project sets it; analyzers on. Central package management
when the solution uses it. One class per file, names matching.
