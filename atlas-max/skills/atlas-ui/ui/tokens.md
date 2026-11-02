# Tokens — the design system the code already implies

Two jobs: read out the system that is scattered through an existing codebase, or check a
codebase against the system it claims to have.

## Read it out

Count, do not sample by eye. Search styles, theme files and components for every colour,
font size, weight, line height, spacing value, radius, shadow, breakpoint, z-index and
duration, with how often each occurs. Output to a file; back here only the tallies.

Then cluster:

```
colour   #1a1a1a ×214  #1b1b1b ×9  #222 ×31        → one text colour, three spellings
spacing  4 8 12 16 24 32 48  (and 13 ×2, 18 ×5, 22 ×1)  → a 4-based scale with 8 strays
radius   6 ×88  8 ×41  4 ×12  10 ×3                 → two radii in real use
type     12 14 16 20 24 32  (15 ×7)                 → six sizes and one stray
```

Near-duplicates (a grey one step off, 13 beside 12) are almost always accidents. A value
used once or twice is a stray unless it sits somewhere deliberate, like a logo.

## Name it

Two layers, no more unless the project already has more.
**Raw scale**: the values themselves, named by position: `gray-100…900`, `space-1…8`,
`radius-sm/md/lg`.
**Roles**: what a value is for, pointing at the scale: `text-primary`, `text-secondary`,
`surface`, `surface-raised`, `border`, `accent`, `danger`, `focus-ring`. Components use
roles. Dark mode and themes change what the roles point at, and nothing else.

Roles are named by purpose, never by look: `danger`, not `red`; `surface-raised`, not
`white`.

Written in the form the project's styling system reads: CSS custom properties, the theme
object of its framework, its utility config. One source; anything else (a JSON for design
tools, native constants) is generated from it or not kept.

Contrast is checked for every role pair that will meet: each text role on each surface
role, in every theme, against the numbers in `a11y.md`. A pair that fails is fixed in the
scale, now, not per component later.

## Move the code onto it

A proposal first: the scale, the roles, and for each stray value the token it would
become and how many places change. Merging two near colours changes pixels: that is a
visual change and the user approves the mapping.
Then mechanically, one category at a time (colours, then spacing, then the rest), each a
separate reviewable diff. Values inside third-party overrides, images, charts with their
own palette and email templates are listed and left.

## Check a codebase against its system

For a project that already has tokens: every raw value in components that is not a token
reference, with position and the nearest token. Roles used against their purpose (the
danger colour on a decorative element). Components that re-implement one that exists.
Tokens defined and never used.

```
src/components/Banner.tsx:14  raw  #f5f5f5  nearest: surface-muted (#f4f4f5)
src/pages/billing.tsx:77      raw  padding 18px  nearest: space-4 (16) or space-5 (24)
tokens                         unused  shadow-xl, gray-950

41 raw values in 17 files · 2 unused tokens · 1 duplicate component (IconBtn / IconButton)
```

Nothing is changed by the check.

## Not done

A new system imposed on a project that has one. A preview page, a documentation site or a
package, unless asked. Renaming tokens other code or other teams consume.
