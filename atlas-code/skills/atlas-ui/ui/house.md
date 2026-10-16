# The project's own style

Every rule in this folder is a default. A project that has decided its look overrides all
of them, and the first job is to find where that decision is written.

## Where to look, in order

1. `.atlas/ui.md` at the project root, or `docs/design.md`, `DESIGN.md`, `STYLE.md`: a
   file written for this purpose. Read whole.
2. A design tokens file: `tokens.css`, `theme.ts`, `tailwind.config.*`, a `--color-*`
   block in the root stylesheet, a `ui-kit/` folder. The values there are the palette, the
   scale, the radii; they are not to be extended without a decision from the person.
3. A component library the project already uses (its own, or one it imports): new screens
   are made of those components before anything is built from scratch.
4. The existing screens themselves: the two or three most finished ones set the bar.

## What the house file holds

Written by the person, or extracted from the screens and shown for a yes, never invented:
- the palette, with each colour's job (background, surface, text, accent, the four
  semantic colours), and the rule for new colours (none without a decision);
- the type: faces, scale, weights, line heights;
- the space scale and the radii;
- the effects the project uses (one glass, one shadow, one motion style) and the ones it
  has refused;
- the words: how labels are written, which language, capitals or not, how errors speak;
- the don'ts learned the hard way (the components that must not be touched, the layout
  tricks that were tried and reverted).

## How it is applied

The house file wins over `taste.md`, `polish.md`, `motion.md` and `tokens.md` wherever the
two disagree. A screen that needs something the house file does not have (a new colour, a
new effect, a new component kind) is a question to the person, shown as a proposal apart
from the code, not a silent addition. When the project has no house file, the first
delivery includes a draft of one, extracted from what exists, for the person to keep or
correct.
