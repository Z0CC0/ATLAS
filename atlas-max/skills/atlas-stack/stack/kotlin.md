# Kotlin — also coroutines, Android, Compose

## The language

`val` over `var`; read-only collection types in signatures. Nullability in the type, and
handled: `?.`, `?:`, `let`; `!!` only where absence is a bug, rarely.
Data classes for values; sealed interfaces or classes for closed sets, with `when` as an
expression so a missing case fails to compile. Value classes for ids and units that must
not be mixed.
Expression bodies for one-liners. Extension functions to add behaviour near where it is
used, not as a dumping ground. Scope functions when they make the code read better, never
nested.
Named and default arguments in place of overloads and builders. `require` and `check` for
preconditions and state.
A `Result`-like sealed type for expected failures; exceptions for the unexpected.

## Coroutines

Structured: every coroutine is launched in a scope that someone owns and cancels.
`viewModelScope`, `lifecycleScope`, or a scope injected and cancelled with its owner;
never `GlobalScope`.
`suspend` functions are safe to call from the main thread: they move blocking or heavy
work themselves with `withContext`, on dispatchers that are injected so tests can replace
them.
`coroutineScope` with `async` for parallel parts that fail together; `supervisorScope`
when one failure must not cancel the siblings.
Cancellation is cooperative: `CancellationException` is rethrown, never swallowed by a
broad `catch`; long loops check `isActive` or call `ensureActive`; cleanup in `finally`.

## Flow

Cold `Flow` for streams of values; `StateFlow` for state that always has a current value;
`SharedFlow` or a channel for one-off events. Exposed read-only, the mutable one private.
Collected with the lifecycle on Android (`collectAsStateWithLifecycle`,
`repeatOnLifecycle`), so nothing runs while the screen is not visible.
`stateIn` with a started policy that stops when there are no subscribers. Operators over
manual collection inside collection.

## Android architecture

Three layers with dependencies pointing inward: UI (composables and view models), domain
(use cases and models, plain Kotlin, no Android imports), data (repositories, network,
database, mappers). The domain defines repository interfaces; the data layer implements
them.
One source of truth per piece of data, usually the local database, observed as a flow and
refreshed from the network.
Dependency injection with the project's framework (Hilt on Android only, Koin when shared
with other platforms). Modules split by feature, build logic in convention plugins.

## Compose

A screen's state is one immutable object exposed by the view model as a `StateFlow`;
events go up as function calls. Composables are stateless where possible: state hoisted,
passed down, `remember` only for UI-local state.
`Modifier` is the first optional parameter, passed to the root element; modifier order
matters and is deliberate.
Slots (`content: @Composable () -> Unit`) for flexible components.
Recomposition kept cheap: stable or immutable parameter types, `key` in lazy lists,
`derivedStateOf` for values computed from fast-changing state, no allocation or work in
the composable body that belongs in `remember` or the view model.
Side effects in effect handlers (`LaunchedEffect`, `DisposableEffect`) with correct keys.
Navigation with typed routes on versions that have them. Theme values from the theme, not
literals.
Shared code across platforms: `expect`/`actual` only for what truly differs.
