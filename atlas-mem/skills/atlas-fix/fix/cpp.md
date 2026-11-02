# C and C++ builds

Commands: `cmake --build <build dir>` (the directory the project already uses), or `make`.
Configure errors come from `cmake -S . -B <build dir>`. Fix the first error: one missing
semicolon or include produces a page of followers.

## Compile errors

`use of undeclared identifier`, `was not declared in this scope` — missing `#include`, a
missing namespace qualifier, or a typo.
`incomplete type`, `invalid use of incomplete type` — a forward declaration where the full
definition is needed: include the header in the `.cpp`, not in another header if avoidable.
`no matching function for call to` — read the candidate list the compiler prints: constness,
a reference to a temporary, an implicit conversion that does not exist.
`cannot convert`, `invalid conversion` — convert explicitly with the named cast that says what
happens; never a C-style cast to quiet it.
`expected ';'`, `expected '}'` — the line above, or the end of a class definition.
`template argument deduction/substitution failed` — the argument type does not satisfy what
the template uses; fix the argument, or state the template argument.
`call to deleted function`, `use of deleted function` — a copy of a move-only type: move it,
or pass by reference.
`discards qualifiers` — a non-const method called on a const object: make the method `const`
if it does not mutate; otherwise the object should not be const here.
`narrowing conversion` in braces — an explicit cast after checking the range.

## Link errors

`undefined reference to`, `unresolved external symbol` — a function declared and not defined,
a source file not in the target, a library not linked, or a template or inline function
defined in a `.cpp`. The first three touch the build files when the fix is a new source in an
existing target (allowed) or a new library (stop).
`multiple definition of` — a non-inline definition in a header: `inline`, or move it to a
`.cpp`.
`vtable for X` undefined — the first non-inline virtual function is not defined.

## CMake

`Could NOT find <Package>` — a system dependency: stop.
`Target … links to target … but the target was not found` — a missing `find_package` or
`add_subdirectory`.
`CMAKE_CXX_STANDARD` errors — toolchain: stop.

## Stops specific to this toolchain

New third-party libraries, compiler flags, the language standard, sanitizer settings,
`-fpermissive` and its kin, `#pragma warning(disable …)`.
