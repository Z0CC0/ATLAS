# TypeScript and JavaScript builds

Commands, the project's script first: `npm|pnpm|yarn|bun run build`, `run typecheck`,
`run lint`. Defaults when no script: `npx --no-install tsc --noEmit -p tsconfig.json`,
`npx --no-install eslint <changed files>`. Never `npx tsc` without `--no-install`: it would
fetch an unpinned compiler and the errors would differ from CI.

## Error, usual cause, right fix

`TS2307 Cannot find module` — the path is wrong, the `paths` alias is not in `tsconfig`, or
the package is not installed. Fix the path or the alias; a missing package is a stop.
`TS2304 Cannot find name` — missing import or a typo; import it from where its siblings do.
`TS2322 / TS2345 not assignable` — two types disagree. Read both definitions. Fix the one
that is wrong about the data, usually the narrower: convert or parse the value, or widen the
receiving type if it really accepts both. Not `as`.
`TS2531 / TS2532 / TS18048 possibly null or undefined` — add the check the type asks for: an
early return, a guard, a default with `??` when a default is correct. Not `!`.
`TS2339 Property does not exist` — the property is missing from the interface, or the value
is a union and was not narrowed. Narrow first; add the property only if the data has it.
`TS7006 / TS7031 implicitly any` — annotate with the real type; `unknown` plus a narrowing
when the data is external.
`TS2554 Expected N arguments` — the callee changed; update the call, or the callee if the
call is the newer contract. Find which by `git log -p` on the callee.
`TS1308 await outside async`, `TS2794` — mark the function `async` and check every caller now
awaits it.
`TS2416 / TS2420 incorrectly implements` — the class and the interface drifted; decide which
is the contract.
`TS6133 declared but never used` — remove it; if it is a parameter required by a signature,
prefix `_`.
ESLint `react-hooks/rules-of-hooks` — move the hook to the top level of the component.
`react-hooks/exhaustive-deps` — add the dependency, or move the value inside the effect; not a
disable comment.
Bundler: `Module not found` after a rename (case-sensitive on CI, not on Windows or macOS);
`ERR_REQUIRE_ESM` / `Cannot use import statement` (module system mismatch: fix the import
form, not `type` in `package.json`); `process is not defined` in client code (a server module
reached the client bundle).
Next.js: `"use client"` missing on a file using state or effects; a server-only import in a
client file; `Dynamic server usage` on a route meant to be static.

## Stops specific to this toolchain

Any change to `tsconfig.json` `strict*` flags, `skipLibCheck`, `eslint` rule levels,
`package.json` versions, the lockfile, or `@types/*` installation.
