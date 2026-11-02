# What the code does today — when the request says spec, what does this do, before I change this

Before changing behaviour nobody wrote down, write it down from the code. The result is what
the change must keep, or must knowingly break.

## Scope

The module, feature or entry point named. Find its edges first: the public functions, routes,
commands, events it handles; what it reads and writes. Delegated to `atlas-finder` when the
area is wide.

## Read for behaviour, not for structure

For each entry point: the inputs it accepts, what it returns or changes for each kind of
input, what it does on bad input and on a failing collaborator, what it leaves in storage,
what it emits. Follow the branches; a behaviour is a branch somebody can observe from
outside. The existing tests are the second source: what they assert is behaviour somebody
cared about; what they do not cover is unconfirmed.

## Two kinds of statement

A **requirement**: on this input, this happens. One per observable behaviour, with the
position that implements it and the test that pins it, or `untested`.
An **invariant**: something true before and after every operation: a balance never negative,
an order with at least one line, a token used at most once. With where it is enforced, or
`not enforced: relied on by <caller>` when the code only assumes it.

State what the code does, not what it should do. Behaviour that looks like a bug is written
as it is and marked `suspect`, with the reason; fixing it is a decision for the plan.

## Output

```
refunds/issue  src/services/refunds.ts:20

R1  a refund up to the remaining amount is issued and recorded      :34   tests/refunds.test.ts:12
R2  a refund over the remaining amount is rejected with 409         :41   tests/refunds.test.ts:30
R3  a provider timeout leaves the refund in `pending`               :58   untested
R4  a second request with the same key returns the first result     :27   untested   suspect: key compared case-sensitively
I1  refunded total never exceeds the charge                         enforced :41
I2  one refund row per provider id                                  not enforced: relied on by reports/monthly.ts:77
```

Short, flat, positions on every line. Written to a file only when the user asks, and then in
whole sentences.
