# What nothing covers — when the request says coverage, untested, missing tests

A coverage report says which lines ran. It does not say which behaviours were checked: a line
executed by a test with no assertion is covered and untested. The report is a map of where to
look, not a score.

## Find

Run the project's coverage command if it has one (`test:coverage`, `pytest --cov`,
`go test -cover`, `cargo llvm-cov`, `jacoco`). No command configured: do not add one; read the
code and the tests instead, which is slower and finds the same gaps.

Scope: the files the request names, else the files changed on this branch, else ask. The
whole repository is never the default; it produces a list nobody acts on.

## Rank what is uncovered by what it would cost to be wrong

1. Money, auth, permissions, deletion, data written to storage, anything sent to a user.
2. Error paths: the branch taken when a collaborator fails, the retry, the rollback.
3. Boundaries of the main logic: empty, one, many, the limit.
4. Everything else.

Generated code, configuration tables, logging lines, getters, and code that only delegates
are not gaps. Name them once as skipped.

## Write

For each gap in rank order, one line first: the branch, the input that reaches it, the
behaviour to assert. Then the test, by `method.md`. Stop at ten new tests and report; the
user says whether to go on. A covered line whose test asserts nothing is a gap too: add the
assertion to the existing test, do not write a second one.

## Report, on top of the usual one

Before the test list:

```
uncovered, by cost
  src/billing/refund.ts:40-58   refund larger than the charge        — written
  src/billing/refund.ts:61      provider timeout during refund       — written
  src/auth/session.ts:22        expired refresh token                — written
  src/util/format.ts:9-30       date formatting                      — left, low cost
skipped: 3 generated files, 2 config tables
```

The percentage, before and after, only when the project enforces a threshold.
