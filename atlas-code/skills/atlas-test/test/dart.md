# Dart and Flutter tests

Runner: `flutter test path/to/x_test.dart --name "…"` or `dart test` for a pure Dart package;
integration tests with `flutter test integration_test`. Files under `test/` mirroring `lib/`,
named `x_test.dart`.

## Unit

`group('Thing', () { test('returns 401 when the token expired', () { … }); });`
`expect(got, equals(want))`; matchers that explain themselves on failure: `isA<T>()`,
`throwsA(isA<FormatException>())`, `closeTo`, `containsAll`.
Async: `await` the call, or `expectLater(future, completion(…))`; streams with
`emitsInOrder([…])`.
`setUp`/`tearDown` per group; nothing shared between groups.
Fakes implementing the interface for collaborators; `mocktail` or `mockito` as the project
has; `verify` only for interactions that are the behaviour.
Time: `fakeAsync` and `async.elapse(…)`, or an injected clock; no real delays.

## Widget

`testWidgets('shows the error when the request fails', (tester) async { … });`
`await tester.pumpWidget(…)` with the providers the widget needs and fakes behind them.
Find by what the user sees: `find.text`, `find.byType` for structure, `find.bySemanticsLabel`;
a `Key` where those are ambiguous.
After every interaction `await tester.pump()`; `pumpAndSettle()` when animations must finish,
never around an infinite animation.
Assert `findsOneWidget`, `findsNothing`; the callback or the state holder at the boundary.
State management (Bloc, Riverpod, Provider): test the notifier or bloc as plain Dart first
(`bloc_test`, a `ProviderContainer`), the widget with it faked.
Golden tests only if the project keeps goldens; they break on font and platform changes.

## Integration

Few: the flows that matter, on a device or emulator, by key or semantics label. The same
rules as any end-to-end test: wait on state, own data, nothing left behind.

## Not worth a test here

Generated files (`*.g.dart`, `*.freezed.dart`); a widget that only composes others with no
logic; theme constants.
