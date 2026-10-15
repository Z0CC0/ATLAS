# Types — when the request says types or invariants, and for every pre-merge review

A type is worth having when it makes a wrong state impossible to construct. Review the types
the diff adds or changes against that, not against style.

Invariant stated in a comment but not in the type: "must be non-empty", "always positive",
"either a or b, never both" written in prose next to a `string`, a `number`, two optional
fields. Tier `fragile`; the fix names the shape: a branded or newtype, an enum or union, a
constructor that validates.

Escape hatch next to the invariant: a public setter, a mutable field, an `any` / `unknown`
cast, a `!` assertion, an `as` to an unrelated type, `interface{}`, `Object`, `dynamic`. One
line each; tier `fragile` when the escape is reachable from outside the module.

Impossible states representable: a struct with `status` and `error` where `error` is set only
for one status; three booleans that encode four valid combinations out of eight. Tier `unclear`
unless the diff relies on the impossible state, then `fragile`.

Narrowing by assertion rather than by check: a value asserted non-null, cast to a subtype, or
unwrapped without a guard in reach. Follow the type flow before writing the line; a guard two
lines up makes it a non-finding.

Public surface widened without need: a parameter typed wider than the function handles, a
return type that says "maybe" when the function never returns nothing. `unclear`.

Not findings: missing annotations on private helpers whose types are inferred; a generic that
could be more generic; naming of type parameters.
