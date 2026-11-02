# TypeScript and JavaScript — .ts .tsx .js .jsx .mjs .cjs

Checks to run when the project has them, before reading: the `typecheck` or `tsc --noEmit`
script, then `eslint` on the changed files. A failure is the first line of the review.

## breaks

Input reaching `eval`, `new Function`, `child_process` (`exec`, `spawn` with a shell string),
`innerHTML`, `document.write`, a query string, a file path without `path.resolve` and a prefix
check. Objects from input merged into another object without `Object.create(null)` or a schema:
prototype pollution.
`JSON.parse` on external text with no `try`.
`async` function called and not awaited where the result or the error matters; `.forEach(async
…)`, which awaits nothing; a promise in a constructor or event handler with no `.catch`.
`throw "text"` or `throw {…}`: callers expecting `Error` lose the stack and the `instanceof`.
`tsconfig` changed to weaken `strict`, `noImplicitAny`, `strictNullChecks`; a `// @ts-ignore` or
`// @ts-expect-error` added without the reason beside it.
A secret read into a `NEXT_PUBLIC_`, `VITE_`, `REACT_APP_` variable or any file the client
bundle imports.

## fragile

`any` where `unknown` plus a narrowing would do; `value!` with no guard in reach; `as X` to a
type the value may not be; `==` where the operands can differ in type.
Sequential `await` in a loop over independent items where one failure should not stop the rest
or where the count is large: `Promise.all` or `allSettled`, say which and why.
Synchronous `fs.*Sync`, `execSync`, heavy CPU work inside a request handler.
External call without a timeout or an `AbortSignal`.
`process.env.X` read without a fallback or a startup check, so the failure surfaces at the
first request instead of at boot.
Module-level mutable state shared across requests.
Mixed module systems: `require` in an ESM file or the reverse, when the project does not do it
on purpose.
Optional chaining to a depth of three or more with no `??` default at the end: the value is
`undefined` on a path the author did not picture.

## unclear

A public function with no return type when the inferred one is a union the caller must
narrow.
`let` that is never reassigned; `var`.
`console.log` left in non-script code: one line with the count.

## Not findings here

Missing JSDoc; a missing return type on a private helper; `index` as key in a static list;
"should use TypeScript" in a JavaScript project; a default export.
