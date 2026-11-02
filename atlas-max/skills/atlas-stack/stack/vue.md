# Vue and Nuxt

On top of `typescript.md`. Vue 3, Composition API with `<script setup>`, unless the project
is on the Options API: then follow it.

## Components

Single-file components in the order the project uses, usually script, template, style.
Props declared with types and defaults; events declared with `defineEmits`; two-way binding
through `defineModel` or the `modelValue` pair. A child never mutates a prop.
Presentational components take props and emit events; the components that fetch and hold
state sit above them.
Template logic stays small: anything longer than a simple expression becomes a computed.
`v-for` always with a stable `:key`; `v-if` and `v-for` not on the same element.

## Reactivity

`ref` for values, `reactive` for objects that are not replaced; pick one habit per project.
`computed` for anything derived; `watch` only for side effects, with an explicit source.
Destructuring a reactive object loses reactivity: `toRefs`, or keep the object. Reassigning
a `reactive` variable disconnects it.

## Composables

`useSomething`, one concern each, returning refs. State created inside the function, so
each caller gets its own; module-level state only when sharing is the point. Everything
started is stopped: listeners, timers, watchers, requests (`onScopeDispose`).
Inputs accepted as refs or getters when the caller's value can change.

## State and routing

Local first; props down, events up; `provide`/`inject` for a subtree; Pinia for what is
shared across routes. Stores small and by feature, written in the setup style when the
project allows; changes through actions.
Routes lazy-loaded; params read reactively, since the same component instance is reused
when only the param changes. Guards return a location or an error, never a bare `false`
with no feedback.

## Nuxt

Data on the server through `useFetch` or `useAsyncData`, with a stable key; `$fetch` alone
inside setup fetches twice (server and client). Results are serialised to the client: only
what the page needs, nothing secret.
Server routes under `server/` validate body, query and params with a schema and check
authorisation; they are the API.
Configuration through runtime config: the private part stays on the server, only `public`
reaches the browser.
Hydration: the server and the first client render must produce the same markup. Nothing
random, time-based or browser-only in the initial render; such parts go in a client-only
wrapper or after mount.
Rendering mode per route (prerendered, server-rendered, cached, client-only) through route
rules, chosen on purpose.
Auto-imports are convenient and hide where things come from: keep composable and component
names unambiguous.

## Performance

`v-memo` and `shallowRef` only after measuring. Large lists virtualised. Heavy components
lazy with `defineAsyncComponent` or the `Lazy` prefix in Nuxt.
