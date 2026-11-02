# Dart and Flutter builds

Commands: `flutter analyze` (or `dart analyze` for a pure Dart package) first, it is fast and
names most build errors; then the build the project targets. Run from the directory that has
`pubspec.yaml`.

## Error, usual cause, right fix

`The name 'X' isn't defined`, `Undefined name` — a missing import, a typo, or generated code
that does not exist yet (see below).
`A value of type 'X?' can't be assigned to a variable of type 'X'` — handle the null: a
check, `??` with a default that is correct, or make the receiver nullable if null is real.
Not `!`.
`The argument type 'X' can't be assigned to the parameter type 'Y'` — convert, or the call is
to the wrong API.
`Non-nullable instance field must be initialized` — initialise in the constructor, give a
default, or make it nullable; `late` only when something really assigns it before first read.
`The method 'X' isn't defined for the type 'Y'` — the wrong type, or an extension not
imported.
`Missing concrete implementation of` — implement the members; check whether the interface or
the class changed.
`'await' applied to 'X', which is not a 'Future'` — remove the `await`, or the function was
meant to be async.
`The return type 'X' isn't a 'Widget'` and `setState() called after dispose()` at run time —
the build method returns on every path; guard with `mounted` before `setState` after an await.
`Part of directive`, `*.g.dart` / `*.freezed.dart` not found or stale — generated code:
`dart run build_runner build --delete-conflicting-outputs` is a stop, named; never edit a
generated file by hand.
`version solving failed` — conflicting constraints in `pubspec.yaml`: stop.
`Gradle task assembleDebug failed`, `CocoaPods` errors — the platform toolchain: quote the
first decisive line and stop.

## Stops specific to this toolchain

`pubspec.yaml` versions, `pubspec.lock`, `flutter pub get/upgrade`, `build_runner`, anything
under `android/` or `ios/`, `// ignore:` comments, `analysis_options.yaml` rule levels.
