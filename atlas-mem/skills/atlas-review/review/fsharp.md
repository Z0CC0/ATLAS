# F# — .fs .fsx

Checks to run before reading: `dotnet build` on the project (file order in the `.fsproj`
matters: a file moved or added in the wrong place is a build error, not a style point), then
`dotnet test`. A failure is the first line of the review.

## breaks

A union matched with `_` where a case was added since: the compiler no longer reports the
missing branch, and the new case silently takes the default path.
`Unchecked.defaultof`, `null` or `Option.get` / `.Value` on an option that can be `None`.
`failwith` for a condition the caller is expected to handle (a `Result` was the contract).
A `mutable` or `ref` shared across `async` / `task` workflows without a lock or an agent.
`Async.RunSynchronously` or `.Result` on a thread that can be the UI or request thread.
A record `with` expression that forgets the field the change was about, when the function's
purpose was that field.
Interop: an option, a union or an F# list handed to C# or to a serializer that cannot read it;
a .NET `null` from a library used before an `isNull` or `Option.ofObj` at the edge.

## fragile

Pattern match on a list with `[a; b]` where the length is not guaranteed; `List.head`,
`List.item`, `Seq.head` on data that can be empty.
`List` used for random access or for data in the tens of thousands (`Array`, `ResizeArray`).
`Seq` re-evaluated: a lazy sequence passed around and enumerated more than once with a side
effect inside.
Exceptions for expected failures; `try ... with _ -> ()` around work whose failure changes a
result.
A tupled function where the rest of the module is curried, or the reverse: callers break on the
next change.
`sprintf` in a hot path; string concatenation in a loop.
A module without `[<RequireQualifiedAccess>]` whose function names shadow `List`, `Map`,
`Option` or the project's own.
A public API typed with `obj`, `dynamic`-like reflection, or a boxed value where a union carries
the intent.

## unclear

Point-free pipelines three levels deep where a named intermediate value would say what the
data is; a computation expression of the project's own that the file's reader has to go and
learn; `function` keyword matching inside a lambda inside a pipe.

## Not findings here

`.fsproj` file ordering that builds; formatting Fantomas would change; whether `async` or
`task` is used, when the project has already chosen; naming of private values.
