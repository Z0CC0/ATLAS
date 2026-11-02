# A component from a public registry

For "is there a component for this", "a pricing table from a library", "find me a
date picker", "do not write it from scratch". The idea is the one every component
catalogue sells: search, fetch the source, adapt it to this project, verify. Here it is
done with public registries that need no account and no key, and nothing is installed
behind the user's back.

## 1. Search, here, with one command

```
node "${CLAUDE_PLUGIN_ROOT}/tools/catalog.mjs" ui "<two or three words>"
```

It reads three public registries and prints at most eight lines per source, so the
registries (60–125 KB each) never enter the conversation:

| source | what it has | licence |
|---|---|---|
| shadcn/ui | the base set: button, dialog, table, calendar, sidebar, charts… | MIT |
| Magic UI | animated pieces: marquee, globe, shimmer, bento grid, number ticker… | MIT |
| Aceternity UI | effects and hero sections: spotlight, beams, cards with hover… | MIT for the components the registry serves; the paid "pro" ones are not in it |

Every registry matches on the component NAME only (none carries a description): search
with the word a maintainer would use — "pricing", "marquee", "date picker" — not with the
need ("make the plans look good"). Two words at most. `nothing matched` from a source means
it answered and has nothing; `skipped` means it could not be reached, say which.

21st.dev holds twelve thousand community components but its search and install need an
account token: it is not searched here. If the user names a piece they saw there, read its
public page and treat the code like any other third-party source below.

## 2. Pick, and say why

Two or three candidates, best first, with the line the tool printed (name, dependencies,
the JSON URL). Dependencies are the cost: a component that drags `framer-motion` into a
project that has no animation library is a worse fit than a plainer one. Say so.

## 3. Fetch the source, read it whole

The JSON URL on the line is a registry item: `files[].content` is the component source,
`dependencies` the npm packages it expects, `registryDependencies` other items of the same
registry (fetch those too, they are part of the piece), `cssVars` tokens it assumes.
Read everything before writing a byte into the project. A component that does more than
asked (telemetry, a hidden fetch, a `dangerouslySetInnerHTML`) is reported, not copied.

## 4. Make it the project's own

The project's style file wins, every time (`house.md`): its tokens replace the registry's
colours, radii and fonts; its component kind (plain React, Vue, Svelte, web components)
is what the result is written in, even if the source was React. What stays is the
structure, the states and the accessibility work — those are the reason to fetch it.

- Hardcoded colours → the project's tokens (`tokens.md`). None invented.
- `cn()` / `clsx` / icon packages: only if the project already has them; otherwise inline.
- The "always" section of `a11y.md` applies to the result as to anything else.
- At the top of the file, one line of provenance: what, from where (registry and item
  name), licence, what was changed. The rule of the house: the piece that is needed, with
  its origin written down, never a dependency on the whole library.

## 5. Dependencies: asked, not installed

List the npm packages the piece needs that the project lacks, with versions, and stop
there. The user installs, or chooses the plainer candidate. The skill never runs an
install.

## 6. Verify

Typecheck or build; then the states of `method.md` (empty, loading, error, long content,
narrow width) and, when there is a browser, `browser.md` through `atlas-browser`. The
report says: what was fetched (name, registry, licence), what was changed to fit, what the
project must install, what was checked.
