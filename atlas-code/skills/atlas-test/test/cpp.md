# C and C++ tests

Runner: `ctest --test-dir <build dir> --output-on-failure -R <regex>`; or the test binary
directly with the framework's filter (`--gtest_filter=Suite.Name`, Catch2 `"[tag]"`).
GoogleTest, Catch2 or doctest: the one the project has. None: stop; adding one touches the
build.

Files under `tests/` or beside the source as the project does; the new file is added to the
existing test target in `CMakeLists.txt`, which is the one build edit this skill makes.

## GoogleTest

`TEST(Suite, BehaviourWhenCondition)`; `TEST_F` with a fixture when setup is shared;
`TEST_P` with `INSTANTIATE_TEST_SUITE_P` for many inputs.
`EXPECT_*` to keep going, `ASSERT_*` when the rest would crash (a null pointer about to be
dereferenced, a size about to be indexed).
`EXPECT_EQ(got, want)`; floats `EXPECT_NEAR` or `EXPECT_DOUBLE_EQ`; strings `EXPECT_STREQ` for
C strings, `EXPECT_EQ` for `std::string`.
Errors: `EXPECT_THROW(f(), std::invalid_argument)`; `EXPECT_DEATH` only where termination is
the contract.
gMock for an interface at the boundary: `EXPECT_CALL` for interactions that are the
behaviour, `ON_CALL` for stubs; `NiceMock` to silence the rest.

## Catch2 / doctest

`TEST_CASE("returns 401 when the token expired", "[auth]")`, `SECTION`s for variations sharing
setup, `REQUIRE` to stop, `CHECK` to continue, `REQUIRE_THROWS_AS`, `GENERATE` for inputs.

## All

Run the tests under AddressSanitizer and UndefinedBehaviorSanitizer when the project has a
preset for it; a test that passes and leaks is a failing test.
Dependencies through an abstract base or a template parameter; no global singletons reached
from the test.
No real files outside a temporary directory; no real sockets; no sleeps for threads, use a
condition variable or a latch.
Each test builds its own objects; nothing static carried between tests.

## Not worth a test here

A trivial accessor; a `struct` of plain data; a header-only alias.
