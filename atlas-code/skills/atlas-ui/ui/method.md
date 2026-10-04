# Method — read every time an interface is built or changed

## Read the project before writing a line

1. The framework and the styling system: utility classes, CSS modules, styled components, a
   component library, native views. New work uses the one that is there.
2. The tokens: where colours, spacing, type sizes, radii and shadows are defined. A value
   comes from there; a new raw value is written only when the scale has none that fits, and
   is reported.
3. The components that exist: buttons, inputs, dialogs, layout primitives. Search before
   building; a second button is the most common mistake in this kind of work.
4. One finished screen of the same kind, as the reference for density, spacing and tone.
5. What it must run on: breakpoints in use, dark mode, right-to-left, the smallest screen.

Nothing of this in the project (a blank page): `direction.md` first, then `tokens.md` for a
minimal scale, then the component.

## Every component has all its states

Built, not left for later: default; hover, focus-visible, active; disabled; loading; empty;
error; success where there is one; the content too long, too short, and missing; one item
and a thousand. A state that cannot happen is said to be so, in one line.

Loading keeps the layout it will have: no jump when the data lands. Empty says what the
place is for and offers the first action. Error says what happened in the user's words and
what to do next; it never shows a stack trace or a bare code.

## Layout that survives

Content decides the size: no fixed heights on anything holding text. It holds at 320 CSS
pixels wide without sideways scrolling, at 200% text size, and with a translation a third
longer. Touch targets as in `a11y.md`. Images and media reserve their space with dimensions
or an aspect ratio.

## Check it, do not imagine it

When a browser is available: `atlas-browser` opens the page and reports in words what
renders, at a narrow and a wide width, in light and dark when both exist, and what the
console says. Then by keyboard alone: reach every control, see where focus is, operate it,
leave. No browser: say `not looked at` in the report; code that compiles is not a checked
interface.

Type check and the project's linter run as for any change.

## Report

```
built     src/components/EmptyState.tsx  uses Button, Stack; tokens only
changed   src/pages/orders/index.tsx  empty and error states added; table holds at 320 px
raw       1 value outside the scale: 18px gap in OrderRow (scale has 16 and 24)
looked    1280 and 375 wide, light and dark: renders, no console errors; keyboard reaches all 6 controls
not       right-to-left; no screen reader run
```

`looked` only for what was really opened. `not` lists what was not checked, every time,
even when it is short. `raw` appears when a value outside the tokens was written.
