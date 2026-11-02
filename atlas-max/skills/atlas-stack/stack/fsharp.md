# F#

On top of `csharp.md` for the runtime, the project file, NuGet and the test runners; what
follows is the language. F# is functional first: immutable values, functions that take data
and return data, types that make illegal states unrepresentable. C# habits written in F#
syntax are the most common defect in a mixed team.

## Shape of the code

Files are compiled in the order the `.fsproj` lists them, and a file sees only what comes
before it: new files go in the right place in the list, not at the end by default. One
module per concern; `[<RequireQualifiedAccess>]` on modules whose function names collide
with others (`List`, `Map`, the project's own). Namespaces for the public surface,
modules for the functions.

## Types

Records for data, discriminated unions for alternatives, and a union case per real state
rather than a flag beside the data. Single-case unions for identifiers that must not be
mixed (`CustomerId`, `OrderId`). Options instead of null; `Result` for failures the caller
is expected to handle, exceptions for the ones it is not. Pattern matching exhaustive: a
`_` case only when every other case has been named and the rest truly share a path.
Units of measure where a number has one.

## Functions

Small, pure where possible, composed with `|>`. Partial application and currying for
pipelines; tupled arguments at the boundary with C# and where more than three parameters
would otherwise be curried. Recursion is `rec` and tail-recursive, or a fold; a loop with
mutation inside a function is fine when it is local and the function stays pure outside.
`async` / `task` by what the project uses: `task { }` at the edge with .NET APIs,
`async { }` inside where the codebase is already async-based. Computation expressions
for the project's own effects only when they are already established.

## Interop

A public API consumed from C# is a class or a record with `[<CLIMutable>]` where a
serializer needs it; options and unions do not cross that boundary without a conversion.
`null` from .NET is checked at the edge and turned into an option at once.

## Typical mistakes

- Mutable fields on records, or classes with setters, where a new record with `{ x with ... }`
  was meant.
- Matching on a union with `_` and then adding a case: the compiler no longer helps.
- `List` where the data is random-access or large (`Array`, `ResizeArray` locally).
- Exceptions used for expected failures that a `Result` would carry.
- String formatting with `sprintf` in a hot path; `String.Format` or interpolation.

## Tooling

Fantomas formats; the project's `.editorconfig` decides the settings. FSharpLint where
the project has it. Tests with Expecto, xUnit or NUnit by what is already in the solution;
FsCheck for properties when the project uses it. `dotnet fsi` for scripts (`.fsx`) with
`#r "nuget: ..."`.
