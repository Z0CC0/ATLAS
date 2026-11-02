# Vue and Nuxt — on top of typescript.md, when the diff imports vue or nuxt

## breaks

`v-html` with content from a user and no sanitiser; `:href`/`:src` from a user without a scheme
check.
Nuxt: a secret in `useRuntimeConfig().public`; a `server/api` or `server/routes` handler that
reads body, query or params with no schema.
A session token in `localStorage`/`sessionStorage`.
A `ref` read or written without `.value` inside `<script>`; `reactive()` on a primitive;
`state = newState` on a `reactive` object (reactivity lost: `Object.assign`).
`watch(() => myRef, …)`: it watches the ref object, which never changes; the source must read
`.value`.
Props destructured in `<script setup>` on Vue below 3.5: snapshot copies, not reactive.
Props mutated in the child.

## fragile

A composable with side effects at module scope (state, timers, subscriptions created once for
the whole app instead of per component); a composable that reads a ref's `.value` once and
keeps the snapshot; a composable returning plain values where consumers expect reactivity;
missing teardown of watchers, listeners, intervals and requests.
`v-for` without `:key`, or keyed by index on a list that reorders; one element carrying both
`v-for` and `v-if`.
`v-model` bound to a computed with no setter: input silently ignored.
`v-bind="$attrs"` forwarded without `inheritAttrs: false`: attributes land twice.
A route guard returning `false` with no redirect and no message; `useRoute().params`
destructured at setup top level, so navigation inside the same component keeps the old value.
Pinia: multi-field business mutations written from components instead of actions or `$patch`;
non-serialisable values in state that is persisted or hydrated.

## unclear

A single-file component past 300 lines of template plus script; props without `type`; events
emitted in camelCase where the project uses kebab-case; `document.querySelector` where a
template ref would do.

## Not findings here

Options API versus Composition API when the project has chosen; CSS scoping style; file
naming.
