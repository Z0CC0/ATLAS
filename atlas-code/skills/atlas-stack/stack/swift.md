# Swift — also SwiftUI, concurrency, the newest Apple frameworks

Apple changes concurrency rules and UI APIs every year. Read the deployment target and the
Swift language mode in the project settings first, and Apple's current documentation for
anything introduced in the last two releases: names below are ideas to look up, not
signatures to trust.

## The language

Value types (`struct`, `enum`) by default; a class when identity or shared mutable state
is the point. `let` over `var`.
Optionals unwrapped with `if let`, `guard let`, `??`; a force unwrap only where nil is a
bug and the reason is obvious. `guard` for early exits.
Enums with associated values for states and results; `switch` without a `default` over an
enum the module owns.
Protocols for what a dependency must do, injected through initialisers, so tests can pass
a fake. Extensions to group conformance and behaviour.
Errors: typed error enums, `throws` and `do`/`catch`; `Result` at boundaries that are not
async. Access control tight: `private` and `internal` unless it must be public.

## Concurrency

`async`/`await` and structured tasks (`async let`, task groups). A `Task` created by hand
is stored and cancelled by its owner; long work checks for cancellation.
UI state lives on the main actor. Shared mutable state lives in an actor; what crosses
between isolation domains is `Sendable`.
In the recent language modes, code is isolated to the caller's actor unless it says
otherwise, and background work is opted into explicitly: follow the mode the project has
set and do not sprinkle annotations to silence the compiler; a data-race diagnostic is
describing a real design question.
No semaphores or locks blocking a thread inside async code.
Persistence behind an actor: one owner for the file or the store, async methods, callers
never touch the storage directly.

## SwiftUI

State by who owns it: `@State` for a view's own values, `@Binding` to edit a parent's,
an observable model object (the `@Observable` macro on current targets) held with `@State`
by the view that creates it and passed down or put in the environment.
`body` is cheap and pure: no work, no formatting of large data, no object creation that
could live in the model.
Small views; a subview extracted limits what is re-evaluated when state changes. View
modifiers for repeated styling.
Lists with stable identifiers, lazy containers for long content.
Navigation with `NavigationStack` and typed values; the path is state.
`task` for async work tied to a view's lifetime: it is cancelled when the view goes away.
Previews for each state of a view, with fake data.
System components, dynamic type, colours and materials before custom drawing; the newest
system materials and glass effects are applied through the system's own modifiers and
containers, sparingly, to controls and navigation layers and not to content.

## On-device models

Apple's on-device language model framework: check availability at run time and offer a
path when the model is not there; ask for structured output through the framework's
typed-generation feature in place of parsing text; keep sessions short, since the context
is small. Treat its output as untrusted, as in `atlas-build-ai`.

## Project

Swift Package Manager for dependencies and for splitting the app into modules. Secrets in
the keychain, never in user defaults or the bundle. Strings localised through the catalog.
