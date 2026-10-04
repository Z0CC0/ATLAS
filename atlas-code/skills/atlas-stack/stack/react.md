# React — also Next.js, Vite, React Native

On top of `typescript.md`. Check the installed major version first: what is idiomatic
differs between them (server components, the compiler, form actions).

## Components

Rendering computes the output from props and state and does nothing else: no side
effects, no mutation, no reading of something that changes outside React.
Small components composed through `children` and props; shared state by lifting it or by
context, not by inheritance. A component defined inside another component is recreated on
every render: move it out.
Props typed; a discriminated union when some props only make sense together.

## State — where it lives

In this order, and stop at the first that fits:
derived from props or other state → computed during render, not stored;
used by one component → `useState`, or `useReducer` when updates depend on each other;
shared by a subtree → lifted, or context for values that change rarely;
from the server → a data library or the framework's loader, which owns caching, refetch and
deduplication; not copied into local state;
in the address bar (filters, tabs, page) → the URL;
truly global client state → the store the project already has.

## Effects

An effect synchronises with something outside React: a subscription, a timer, a DOM API, a
network connection. It returns its cleanup.
Not for: deriving state, reacting to an event (do it in the handler), fetching in a
component that could use the data layer.
Dependencies listed honestly; an effect that "needs" a dependency left out is designed
wrong.

## Performance

Measure with the profiler before memoising. Usual real causes: state too high in the tree,
a context value recreated each render, a list without stable keys, a long list not
virtualised. With the React Compiler on, manual `useMemo` and `useCallback` are mostly
redundant: follow the project.
Code split at routes and at heavy, rarely used parts.

## Forms

The project's form library when it has one; validation with the same schema the server
uses. Every field labelled, errors tied to fields (`atlas-ui`, accessibility).

## Next.js (App Router)

Server components by default; `"use client"` at the leaf that needs state, effects or
browser APIs, kept small. Data fetched on the server, close to where it is used; secrets
never reach a client component.
Mutations through server actions or route handlers, each one validating its input and
checking authorisation itself: they are public endpoints.
Caching and revalidation are explicit choices per fetch and per route; state which, do not
rely on a default that changed between versions.
`loading`, `error` and `not-found` files for each segment that can wait or fail.
Images and fonts through the framework's components.

## Vite

Environment variables reach the client only with the `VITE_` prefix: nothing secret there.
Aliases defined once and mirrored in `tsconfig`. Keep plugins few; check the bundle with
the analyser before optimising by hand.

## React Native

One navigation library, typed routes, params validated. Lists through the virtualised list
components, never a mapped array in a scroll view. One styling system. Tokens and secrets
in the platform's secure storage, not in async storage. Native modules wrapped in hooks
that clean up. Test on both platforms: layout, keyboard and permissions differ.
