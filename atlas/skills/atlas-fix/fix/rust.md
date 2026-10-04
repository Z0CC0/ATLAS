# Rust builds

Commands: `cargo check` (fast, same errors as build), then `cargo clippy -- -D warnings` when
the project gates on it, `cargo fmt --check` (fixed by `cargo fmt`, not by hand),
`cargo test --no-run` to compile the tests.

The compiler's own suggestion (`help:`) is right more often than not for imports and
conversions, and wrong often for borrows: read it, do not apply it blind.

## Error, usual cause, right fix

`E0432 / E0433 unresolved import`, `cannot find … in this scope` — wrong path, a missing
`use`, a feature not enabled, or a crate not in `Cargo.toml` (the last two are stops).
`E0599 no method named` — the trait that provides it is not in scope: `use` the trait.
`E0308 mismatched types` — convert with the conversion that says what happens (`.into()`,
`try_into()?`, `as` only for plain numeric casts you have checked for truncation).
`E0277 trait bound not satisfied` — add the bound to the generic, derive the trait, or the
type is the wrong one for this call.
`E0382 use of moved value` — borrow instead of move, or restructure so the move is last.
`.clone()` only when two owners are really needed.
`E0499 / E0502 cannot borrow` — end the first borrow before the second begins: narrow the
scope, split the struct borrow by field, collect then mutate. `RefCell` changes the design:
stop and ask.
`E0597 does not live long enough` — return an owned value, or move the owner up so it
outlives the reference.
`E0106 missing lifetime specifier` — annotate; if the function returns a reference to
something created inside it, the return type should be owned.
`E0004 non-exhaustive patterns` — add the missing arms. Not `_ =>` on an enum the crate owns.
`future cannot be sent between threads` — something non-`Send` (an `Rc`, a `RefCell`, a std
mutex guard) is alive across an `.await`: drop it before the await.
`async fn in trait` and object safety errors — a design change: stop.
`unused variable / import / must_use` under `-D warnings` — remove, or `_name` for a
parameter a signature requires; a `must_use` result is handled, not discarded.
Linker errors, `could not find native library` — a system package: stop, named.

## Stops specific to this toolchain

Editing `Cargo.toml` dependencies or features, `Cargo.lock`, `rust-toolchain`, adding
`#[allow(…)]`, introducing `unsafe`.
