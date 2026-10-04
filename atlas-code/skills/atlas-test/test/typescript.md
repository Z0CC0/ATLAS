# TypeScript and JavaScript tests

Runner, read from `package.json` and config files: Vitest (`vitest.config.*`), Jest
(`jest.config.*`), Bun's own (`bun:test` imports), Node's (`node --test`), Mocha. Use the one
there; they differ in mocks and timers. Run one file: `vitest run path`, `jest path`,
`bun test path`, `node --test path`.

Files beside the code or under `tests/`, whichever the project does; name `x.test.ts`.

## Idioms

`describe` per unit, `it`/`test` per behaviour; the name is a sentence.
One reason to fail per test; several `expect` are fine when they describe one outcome.
Async: `await` the call and the assertion (`await expect(p).rejects.toThrow(…)`); a test that
returns before its promise settles passes by accident.
Errors: assert the type and the message or code, not only that something threw.
Table cases with `it.each` / `test.each` when the same behaviour is checked on many inputs.
Time: fake timers of the runner, advanced explicitly; the real clock never.
Network: `msw` or the project's own fake at the HTTP boundary; not a mock of `fetch` returning
whatever the test needs line by line.
Modules: mock at the edge the code already has (an injected client, a module boundary); a
`vi.mock`/`jest.mock` of the unit's own internals tests the mock.
Reset between tests what the test changed: timers, mocks, env, module state.

## React components

Testing Library: render, then query the way a user finds things, `getByRole` with a name,
`getByLabelText`, visible text. `getByTestId` last. Interact with `userEvent`, awaited.
Assert what the user sees or what was called at the boundary, not state or implementation.
`findBy…` for what appears after an async step; no manual `act` unless the library asks.
One accessibility assertion per component is cheap: the role and name are there.
Hooks: through a small component or `renderHook`; not by calling them bare.
Server components and server actions: test the function with its inputs; the rendering in an
e2e flow.

## Not worth a test here

Type-only code; a component that only lays out children; a re-export; styling.
