# Rust tests

Runner: `cargo test`; one test `cargo test name -- --exact --nocapture`; `cargo nextest run`
when the project uses it. Compile without running: `cargo test --no-run`.

Unit tests in a `#[cfg(test)] mod tests` at the bottom of the file they test, with
`use super::*;`. Integration tests in `tests/`, each file a crate that sees only the public
API. Doc tests for examples that should keep compiling.

## Idioms

`assert_eq!(got, want)`, `assert!(cond, "what was expected: {detail}")`; the message says what
the test was checking, since the name alone is all a CI log shows.
Errors: `assert!(matches!(result, Err(MyError::NotFound { .. })))`; return
`Result<(), Box<dyn Error>>` from the test and use `?` for setup, not for the thing asserted.
`#[should_panic(expected = "…")]` only for panics that are the contract.
Many inputs: a small table and a loop with the case in the message, or `rstest` if the
project has it.
Property tests (`proptest`, `quickcheck`) for parsers, serialisation round-trips, invariants
of data structures.
Async: `#[tokio::test]` (or the runtime the project uses); `tokio::time::pause()` and
`advance` for time; no real sleeps.
Fakes through traits at the boundary; a struct implementing the trait in the test module.
`mockall` only when the project already has it.
`tempfile` for files; no fixed paths.
Shared setup in a function returning the fixture; no global mutable state, tests run in
parallel threads by default.
`#[ignore]` with a reason for slow or external tests; never to hide a failure.

## Not worth a test here

Derived trait implementations; a type that only wraps another; code the type system already
proves.
