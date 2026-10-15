# C and C++ — .c .cc .cpp .cxx .h .hpp

Checks to run before reading: the project's build (`cmake --build`, `make`), the tests of the
changed target; `clang-tidy` on the changed files when configured; a sanitizer build when the
diff touches memory or threads and the project has one. A failure is the first line of the
review.

## breaks

Raw `new`/`delete` or `malloc`/`free` pairs where an exception, early return or second owner
can skip the release; a resource not held by an object (no RAII).
Dangling: a reference or pointer to a local returned; an iterator used after the container
changed; a `string_view` or span outliving its buffer.
Unchecked bounds: C arrays indexed from input, `strcpy`, `sprintf`, `gets`; integer arithmetic
on untrusted sizes before an allocation.
Read before write: a member not initialised in every constructor path; a local read on a
branch that did not set it.
Input in `system()`, `popen()`, or as the format string of `printf`.
Data shared by threads without a mutex or atomic; two mutexes taken in different orders;
manual `lock()`/`unlock()` where `std::lock_guard` or `std::scoped_lock` would survive an
exception; a `std::thread` neither joined nor detached before destruction.
`reinterpret_cast`, a C-style cast between unrelated types, without the reason beside it.
Secrets in source.

## fragile

Rule of five incomplete: a class with a destructor or an owning pointer and defaulted copy.
A large object passed by value where `const&` is meant; a sink parameter not moved.
Narrowing conversions on sizes and indices; signed/unsigned comparison on a boundary.
`std::vector` grown in a loop with the size known (`reserve`); `std::string` built by `+` in a
loop.
Exceptions crossing a C boundary or a destructor.

## unclear

Missing `const` on a method or parameter that does not mutate; `using namespace std;` in a
header; an include that the file does not use; a `typedef` where the project uses `using`.

## Not findings here

Brace style; `auto` taste; header guard style when the project is consistent; function
length.
