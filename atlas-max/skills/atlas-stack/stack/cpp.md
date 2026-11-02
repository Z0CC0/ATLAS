# C++

Follows the C++ Core Guidelines. Check the language standard the build sets before using a
feature, and the project's stance on exceptions and RTTI: some codebases disable them.

## Resources

RAII for everything: memory, files, locks, sockets. An object owns its resource and
releases it in the destructor; nothing is released by hand on each exit path.
No naked `new` or `delete`. `std::unique_ptr` for single ownership (the default),
`std::shared_ptr` only when ownership really is shared, `std::make_unique` and
`std::make_shared` to create them. Raw pointers and references mean "does not own".
Rule of zero: let members manage themselves, declare no special member functions. When
one must be written (a class that manages a resource directly), all five are considered.
Locks through `std::scoped_lock` or `std::lock_guard`.

## Interfaces

Types say what is meant. Pass cheap things by value, others by `const&`; take by value and
move when the function keeps a copy; return by value. `std::span` and
`std::string_view` for non-owning views, with care that the viewed data outlives them.
`std::optional` for "may be absent", `std::variant` for "one of", a result type
(`std::expected` where available) for "value or error".
`const` on everything that does not change, `constexpr` on what can be computed at compile
time, `noexcept` on moves and on functions that cannot throw. `[[nodiscard]]` on results
that must not be ignored.
Strong types for values that must not be confused; `enum class`, never plain `enum`.
Single-argument constructors `explicit`.

## Classes

Invariants established in the constructor: no two-phase initialisation. Members
initialised in the class or in the initialiser list, in declaration order.
A base class meant for polymorphic use has a virtual destructor; overrides marked
`override`. Composition before inheritance. Data-only aggregates are `struct`s.

## Expressions

Initialise at declaration, with braces where narrowing matters. `auto` when the type is
obvious or unwieldy. Range-based `for` and the standard algorithms over index loops.
No C-style casts; no `const_cast` to write. No macros for constants or functions.
Smallest scope for every name. No owning globals; no `using namespace` in headers.

## Errors

Exceptions for errors that cannot be handled locally, thrown by value, caught by
reference, in code that is exception-safe because it uses RAII. Where exceptions are off:
result types, checked.
Assertions for programmer errors. Destructors do not throw.

## Concurrency

Share as little as possible. `std::jthread` or tasks over raw threads; data shared
between threads guarded by a mutex that is declared next to it, or atomic. No lock held
while calling unknown code. Condition variables always waited on with a predicate.

## Build and tools

Headers self-contained, with include guards or `#pragma once`; include what is used,
forward-declare where it avoids a dependency. Warnings high and treated as errors where
the project sets it. Sanitizers (address, undefined, thread) in test builds; `clang-tidy`
and `clang-format` with the project's configuration. CMake targets with their own
properties (`target_*` commands), not global flags.
