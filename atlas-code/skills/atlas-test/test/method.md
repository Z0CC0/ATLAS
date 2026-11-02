# Method — read for every test task

## Find the runner

The project's own command wins: the `test` script, a `Makefile` target, the CI workflow. The
package manager is not the runner: a project installed with Bun may run Jest; `bun test` and
`bun run test` are two different things. Read the script before calling it.
Run the suite once before writing anything. It is the baseline: tests that fail now are not
yours, and are named in the report as failing before.
No runner configured: say so, name the one the language file suggests, and stop. Adding a test
framework is the user's decision.

## What a test names

Each test states, in its name, an input and the behaviour expected on it: `returns 401 when
the token expired`, not `test auth 2`. Before writing one, say in a line what breaks if it is
missing. Cannot say it: the test is not written.

For every function or path under test, the inputs worth a test are the ones where behaviour
changes: the boundary values (0, 1, empty, the maximum, one past it), the absent value (null,
missing key, empty string), the malformed one, the duplicate, the error from a collaborator
(timeout, refusal, partial data), and, when it applies, order, concurrency, timezone, unicode.
One happy path is one test, not five.

## Never written

A test that cannot fail: asserts nothing; asserts only that no exception was thrown where the
return value matters; checks a mock returned what it was told to return; compares a value with
itself.
A test of the mocks: everything real replaced, the code under test reduced to glue.
A test that depends on another having run first, on wall-clock time, on real network, on real
randomness, on a sleep.
A snapshot of something large and unstable, accepted without reading it.
A test written to raise a coverage number with no behaviour named.
A test for a private helper that the public behaviour already covers.

## Doubles

Fake the boundary, not the logic: the network, the clock, the filesystem, the random source,
the payment provider. Keep the code under test and its pure collaborators real. A fake that
needs its own logic gets a test or gets simpler.

## When a new test fails

It found a bug, or it is wrong. Decide which by reading the code, in one line. A bug: the test
stays, marked in the report as `found`, and the code is not changed here unless the mode is
test-first on that code. A wrong test: fix the test.

## Report

```
tests/auth.test.ts  added 4
  returns 401 when the token expired
  returns 401 when the signature is wrong
  accepts a token expiring this second
  rejects a token for another audience           found: src/auth/verify.ts:52 accepts any audience

PASS  57 passed (53 before), 1 new failing — a bug, not the test
```

Per file: how many added, one line per test name. A test that fails because the code is wrong
carries `found:` with the place and the defect. Last line: the runner's verdict with the count
before and after. Tests failing before this run are listed once as `failing before`. No
coverage percentage unless the project enforces one, and then only the number and the
threshold.
