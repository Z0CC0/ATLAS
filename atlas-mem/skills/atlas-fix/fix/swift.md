# Swift builds

Commands: a package, `swift build` then `swift build --build-tests`. An Xcode project,
`xcodebuild -list` to find the scheme, then `xcodebuild -scheme <S> -destination
'generic/platform=iOS Simulator' build`. `swiftlint` only when the project has a
`.swiftlint.yml`. Xcode's log is long: the lines that matter contain `error:`.

## Error, usual cause, right fix

`cannot find type / 'X' in scope` — missing `import`, a typo, or the file is not a member of
the target (an Xcode project setting: stop).
`value of type 'X' has no member 'Y'` — the wrong type, or an extension in a module not
imported.
`cannot convert value of type` — convert explicitly; an optional where a value is expected:
unwrap with `guard let` or supply a default that is correct. Not `!`.
`value of optional type must be unwrapped` — the same.
`type 'X' does not conform to protocol 'Y'` — implement the missing requirements; Xcode's
stub fix-it gives the signatures, the bodies are yours.
`missing return` — a path through the closure or function has no value.
`expression is 'async' but is not marked with 'await'` — add `await`, and make the caller
`async` up to a place that owns a task.
`call to main actor-isolated … in a synchronous nonisolated context` — `await` it from an
async context, or mark the caller `@MainActor` when it is UI code. Not `nonisolated(unsafe)`.
`non-sendable type … crossing actor boundary`, `capture of 'self' with non-sendable type` —
make the type `Sendable` if it truly is (immutable or internally synchronised), or pass the
values needed instead of the object. `@unchecked Sendable` is a stop.
`reference to captured var in concurrently-executing code` — copy to a `let` before the
closure.
`ambiguous use of` — give the type explicitly.
`cannot assign to property: 'x' is a 'let' constant` — decide whether it should mutate; a
`struct` method needs `mutating`.
`initializer requires that 'X' conform to 'Decodable'` — add the conformance to the nested
type that lacks it.
Linker `Undefined symbol`, `No such module` — target membership, a package product not linked,
or derived data stale: stop, named.
Signing and provisioning errors — never touched.

## Stops specific to this toolchain

`Package.swift` dependencies, `Package.resolved`, any `.xcodeproj`/`.pbxproj` edit, build
settings, Swift language version, entitlements, signing.
