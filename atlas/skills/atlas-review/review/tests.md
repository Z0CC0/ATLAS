# Tests — when the request says tests or coverage, and for every pre-merge review

The question is not "are there tests" but "would these tests fail if the change were wrong".

Map first: every function, branch and error path the diff adds or changes, and the test that
exercises each. A changed path with no test is one line, tier `fragile`, naming the input the
missing test would feed.

A test that cannot fail: asserts only that no exception was thrown; asserts on a mock's
return value it set itself; compares a value with itself; snapshot updated in the same diff
without a reason. Tier `unclear`: it reads as coverage and is not.

Behaviour, not lines: a test that calls the function with the happy input only, when the
diff added an error branch, a boundary (0, empty, max, negative, unicode, timezone) or a
concurrent path. Name the missing input.

Flaky by construction: real time, real network, real randomness, order-dependent shared
state, sleeps as synchronisation. Tier `fragile`, with the nondeterministic source named.

Tests that test the mock: so much is mocked that the code under test is the glue between
mocks. One line, `unclear`.

Deleted or skipped tests in the diff: each one is a line, `ask`, with the question "what
replaced it".

Coverage numbers are not findings. A percentage says which lines ran, not which behaviours
were checked. Quote one only when the project enforces a threshold and the diff crosses it.
