# Rust — .rs

Checks to run before reading: `cargo build`, `cargo clippy -- -D warnings`, `cargo test` on
the changed crate; `cargo audit` when `Cargo.toml` changed and the tool is installed. A
failure is the first line of the review.

## breaks

`unwrap()` or `expect()` on a value that can be `None` or `Err` on an input the program will
see, outside tests and `main` of a one-off tool.
`unsafe` without a `// SAFETY:` comment stating the invariant and why it holds here; raw
pointer use whose lifetime is not tied to an owner.
`let _ = result;` on a `#[must_use]` value whose error matters; `.ok()` that drops the error
before a decision depends on it.
`panic!`, `todo!`, `unimplemented!`, `unreachable!` on a path reachable in release.
String interpolation into a query; input into `std::process::Command` as a shell string; a
path from input without canonicalising and checking the prefix.
Deserialising untrusted bytes with no size or depth limit.
Blocking inside `async`: `std::thread::sleep`, `std::fs`, a sync mutex held across an `.await`.
Two locks taken in different orders on two paths.
`Mutex::lock()` result unwrapped where a poisoned lock should be handled or at least named.

## fragile

`return Err(e)` with no context (`.context(…)`, `.map_err(…)`): the caller gets "not found"
with no file name.
`Box<dyn Error>` as the error type of a library's public API; `thiserror` or an enum is the
fix.
`_ =>` on a match over a business enum, so a new variant is silently handled by the default.
Unbounded channel (`unbounded_channel`, `mpsc::channel()`) with a producer faster than the
consumer and no reason beside it.
`.clone()` added to satisfy the borrow checker where a reference or a restructure would do;
`String` or `Vec<T>` parameters where `&str` or `&[T]` suffice on a public function.
A type shared across tasks without the `Send`/`Sync` bound the compiler would otherwise prove.
`#[allow(…)]` added by the diff without the reason.

## unclear

`Vec::new()` then a loop of `push` with the size known: `with_capacity`.
`format!` for a two-piece concatenation on a hot path.
`pub` items with no doc comment on a crate that documents the rest.

## Not findings here

Derive order; `impl` block ordering; a lifetime annotation the elision rules would permit
dropping; module layout.
