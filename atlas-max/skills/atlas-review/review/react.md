# React and Next.js — on top of typescript.md, when the diff imports react or next

## breaks

`dangerouslySetInnerHTML` with content from a user and no sanitiser; `href`/`src` from a user
without a scheme check (`javascript:`, `data:`).
A `"use server"` action that reads `FormData` or arguments with no schema, or with no check
that the current user may do the operation.
A server-only module (database client, secret) imported from a `"use client"` file; a full
server record passed as props to a client component, tokens and hashes included.
A session token kept in `localStorage`/`sessionStorage`.
A hook called inside a condition, loop or after an early return; a hook called from a
function that is not a component or a `use…` hook.
State mutated in place (`list.push`, `obj.x = 1`) then set: no re-render, broken equality.
`setState` during render with no condition: infinite loop.

## fragile

`useEffect`/`useMemo`/`useCallback` missing a value they read; an `eslint-disable` of
`exhaustive-deps` added by the diff.
An effect that only derives state from props: compute during render.
An effect with a subscription, interval, listener or fetch and no cleanup or `AbortController`.
A handler or interval reading a value that has changed since (stale closure): functional
update or a ref.
`key={index}` on a list that can reorder, insert or delete.
The same fact stored twice in state, or in state and a derived copy.
State initialised from a prop with no `key` to reset it when the prop changes.
A `<div onClick>` where a `<button>` gives keyboard access; an `<input>` with no label; an
`<img>` with no `alt`; `target="_blank"` without `rel="noopener noreferrer"`.
A `"use client"` directive on a file that pulls a whole subtree to the client.

## unclear

`useMemo`/`useCallback` with no measured reason; an object or function created inline and
passed to a memoised child; synchronous heavy work in render; a single Suspense at the route
root where sections could reveal progressively.

## Not findings here

Prop drilling two levels deep; component file length; CSS approach; missing loading state on
a component that renders synchronously.
