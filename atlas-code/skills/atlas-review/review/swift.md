# Swift — .swift

Checks to run before reading: `swift build` or `xcodebuild build` for the scheme the project
names; `swiftlint` when present; the tests of the changed target. A failure is the first line
of the review.

## breaks

`!` unwrap, `try!`, `as!` on a value that can be nil, throw or be another type on a real
input. `try?` that drops an error a caller needed.
`fatalError`, `precondition` in library code on a condition the caller could have handled;
`assert` used for a check that must hold in release (it is stripped).
Secrets in source or in `UserDefaults`; token in a log; App Transport Security exception added
without a reason.
Mutable state touched from more than one isolation domain without an actor, a lock or
`@MainActor`; a non-`Sendable` value crossing a `Task` boundary; UI touched off the main actor.
`Task { }` fire-and-forget holding `self` strongly with no cancellation, in a view model or
controller that can be dismissed.
State read across an `await` inside an actor as if nothing could have changed (reentrancy).
A closure stored by a long-lived object capturing `self` strongly; a `delegate` property that
is not `weak`.
String interpolation into a query or a shell command; a path from input without
standardising and checking the prefix; `JSONDecoder` on untrusted bytes with no limits where
size matters.

## fragile

`default:` on a `switch` over an enum the module owns, hiding a new case; `@unknown default`
missing on a system enum.
A `class` where a `struct` carries no identity and no shared mutation; a protocol existential
(`any P`) in a hot path where `some P` or a generic would do; `Any`/`AnyObject` as a parameter
type.
A large struct copied in a loop; an array grown in a loop with the size known
(`reserveCapacity`).
Combine or async sequences subscribed with no cancellation stored.
`@objc` bridging added where pure Swift would do.

## unclear

`var` that is never mutated; a type compared, hashed, encoded or sent across tasks without
declaring the matching conformance; `print` in non-script code.

## Not findings here

Line length; extension layout; `MARK:` comments; access control on a single-file prototype.
