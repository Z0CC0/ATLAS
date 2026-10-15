# C# and .NET builds

Commands: `dotnet build` at the solution, then `dotnet test --no-build` to see whether tests
load. `dotnet format --verify-no-changes` when the project gates on it; formatting is fixed
by `dotnet format`, not by hand.

## Error, usual cause, right fix

`CS0246 type or namespace name could not be found` — a missing `using`, a typo, or a project
or package reference that is not there (the last is a stop).
`CS0103 name does not exist in the current context` — scope or a typo.
`CS1061 does not contain a definition for` — the wrong type, or an extension method whose
namespace is not imported.
`CS0029 / CS0266 cannot implicitly convert` — convert explicitly, or fix the declared type.
`CS8600 / CS8602 / CS8604` nullable warnings as errors — add the null check or make the
declaration nullable if null is a real value. Not `!`.
`CS0161 not all code paths return a value` — the missing path.
`CS4033 await requires async` — mark the method `async` and return `Task`; never `async void`
outside an event handler; then await it at every caller.
`CS1998 async method lacks await` — remove `async` and return the task, or await the call that
was meant to be awaited.
`CS0535 does not implement interface member` — implement it; check which side changed.
`CS0121 call is ambiguous` — name the overload by casting the argument to the intended type.
`CS0122 inaccessible due to its protection level` — use the public surface; widening access is
a design choice.
`CS0234 namespace does not exist` after a move — the namespace no longer matches the folder.
`NETSDK1045`, `NU1101`, `NU1202` — SDK or package resolution: stop.
Analyzer errors (`CA…`, `IDE…`) — fix the code; a suppression is proposed, not applied.

## Stops specific to this toolchain

`PackageReference` changes, target framework, `Nullable`, `TreatWarningsAsErrors`,
`#pragma warning disable`, `[SuppressMessage]`, `.editorconfig` severities.
