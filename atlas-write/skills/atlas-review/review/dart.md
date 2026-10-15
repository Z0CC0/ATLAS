# Dart and Flutter — .dart

Checks to run when the project has them, before reading: `dart analyze` (or
`flutter analyze`) on the changed files, then `dart format --output=none --set-exit-if-changed`.
A failure is the first line of the review.

## breaks

`!` on a value that can be null on a reachable path; a `late` field read before the code
that sets it has run (first build, a callback that fires early).
`BuildContext` used after an `await` with no `mounted` check: the widget may be gone, and
`Navigator`, `ScaffoldMessenger` or `Theme.of` on it throws.
`setState` called after `dispose`, or on a state whose async work was never cancelled.
A controller, focus node, animation controller, stream subscription or timer created and
never disposed or cancelled.
A `Future` not awaited where its error matters: the exception goes to the zone and the
caller continues as if it had succeeded.
`jsonDecode` output cast with `as` to a concrete type with no check: a missing or
differently typed field crashes at run time.
A token, key or password in source, in `SharedPreferences`, or printed to the log.
A `catch` with no type that swallows the error and leaves the UI in a loading state.
State mutated in place where the state library compares by identity or equality (a list
changed inside an emitted BLoC or Riverpod state): listeners are not notified.

## fragile

Work in `build`: network or disk access, sorting or filtering large collections, creating
controllers or futures. A `FutureBuilder` or `StreamBuilder` whose future or stream is
created inside `build`, so it restarts on every rebuild.
A long or unbounded list built with `children:` in place of a builder constructor.
List items that move or are removed without keys; a `GlobalKey` created in `build`.
`setState` high in the tree for a change that concerns one small widget.
A helper method returning a widget where a widget class would let it rebuild alone and be
`const`.
Navigation or a dialog triggered from `build` instead of a listener or a callback.
Hard-coded sizes that break at a larger text scale or a narrow screen; text with no
overflow handling inside a row.
A platform channel or plugin call with no handling of the "not available on this platform"
or permission-denied case.
`dynamic` where a type is known; `print` in place of the project's logger.
`initState` doing async work with no handling of the widget being disposed before it ends.
Colours, text styles and spacing as literals where the project reads them from the theme.

## unclear

A widget file holding several unrelated widgets; a `build` method past about eighty lines;
a boolean parameter whose meaning is not in its name; a state class with flags that can
contradict each other where a sealed class would say which states exist.

## Not findings here

The choice of state management library when the project is consistent; trailing commas
and formatting the formatter owns; `const` missing where the lint is off by the project's
choice.
