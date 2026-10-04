# Rust

## Ownership

Borrow by default: `&str` and `&[T]` in parameters, not `&String` or `&Vec<T>`. Take
ownership when the function keeps the value. Return owned values.
`clone` is a decision, not a way to quiet the borrow checker: when it appears, it is
because a copy is wanted. `Cow` when a value is usually borrowed and sometimes changed.
Lifetimes are written only when the compiler cannot infer them; a struct full of lifetime
parameters often wants to own its data.
`Arc` for shared ownership across threads, with `Mutex` or `RwLock` inside when it is
mutated; `Rc` and `RefCell` only single-threaded and only when ownership truly is shared.

## Errors

`Result` and `?`. In a library: an error enum, one variant per failure a caller can act
on, derived with `thiserror`. In an application: `anyhow` (or the project's equivalent)
with `.context(...)` saying what was being attempted.
`unwrap` and `expect` in tests, in examples, and where a failure is a bug with the reason
written in the `expect` message; not on input, I/O or anything from outside.
`Option` combinators and `let … else` in place of nested matches.

## Types that make wrong states impossible

Enums for "one of": a state machine is an enum with data in its variants, not a struct of
booleans and options. `match` exhaustively; no catch-all arm on an enum the crate owns, so
a new variant is a compile error where it matters.
Newtypes for values that must not be confused (`UserId`, `Metres`) and for values that
carry an invariant, built through a constructor that checks it.
A builder for a struct with many optional fields. Private fields with constructors when
the fields have rules.

## Traits and generics

Generic over a trait when the caller chooses the type and speed matters; `dyn Trait` when
the set is open at run time or compile time and binary size matter more. `impl Trait` in
argument and return position for readability.
Standard traits implemented where they make sense (`Debug` always; `Clone`, `PartialEq`,
`Default`, `From`, `Display`, `FromStr`), derived when possible.
Iterator chains over index loops; `collect` into the type that is needed.

## Async

One runtime, the project's. Nothing blocking inside an async function: blocking work goes
to the runtime's blocking pool. No standard `Mutex` guard held across an `.await`.
Tasks are joined or deliberately detached; cancellation is a dropped future, so state is
left consistent at every await point. Timeouts on everything that waits on the outside.

## Unsafe

Avoided; when needed, the smallest block, with a `SAFETY:` comment stating why the
invariants hold, wrapped in a safe API.

## Project

Modules by domain; `pub` on as little as possible, `pub(crate)` for the rest. Features
additive. `clippy` clean at the level the project sets, `rustfmt` applied. Public items
documented, with examples that compile as doc tests.
Dependencies few; check maintenance and feature flags before adding one, and turn off
default features that are not used.
