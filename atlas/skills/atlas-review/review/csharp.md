# C# — .cs

Checks to run before reading: `dotnet build` with warnings as the project configures them,
then `dotnet test` on the changed project. A failure is the first line of the review.

## breaks

Query built by interpolation (`$"… {input}"`) outside EF parameterisation; `Process.Start` with
input in the arguments string; a path from input without `Path.GetFullPath` and a prefix
check; `BinaryFormatter`; `TypeNameHandling.All` or `Auto` on untrusted JSON.
`catch { }`, `catch (Exception) { return null; }` around work whose failure changes a result.
`.Result`, `.Wait()`, `.GetAwaiter().GetResult()` on a thread that can be the UI or request
thread: deadlock.
`async void` outside an event handler.
`IDisposable`/`IAsyncDisposable` created without `using` on a path that can throw before
`Dispose`.
Static mutable fields used as shared state from several requests.
Secrets or connection strings in source or committed `appsettings`; `[ValidateAntiForgeryToken]`
removed; raw user text in a Razor page with `Html.Raw`.

## fragile

A public `async` API without a `CancellationToken`; library code without
`ConfigureAwait(false)` when the project follows that rule.
A nullable warning suppressed with `!` where a null is possible; `(T)obj` where `obj is T t`
reads the intent; `dynamic` in application code.
EF: lazy loading inside a loop (N+1), a read-only query without `AsNoTracking`, a list endpoint
without paging.
`IEnumerable` enumerated twice when the source is a query or a generator.
Magic strings for route names, config keys and claim types where `nameof` or a constant
exists.
A class that should be `sealed` and is subclassed nowhere; a value-like model that mutates
where a `record` would carry the intent.

## unclear

`StringBuilder` missing in a loop that concatenates; LINQ chains in a hot path that allocate
per element; `new`-ing a service that the container provides.

## Not findings here

Naming of private fields; region directives; file layout; XML doc comments on internal
members.
