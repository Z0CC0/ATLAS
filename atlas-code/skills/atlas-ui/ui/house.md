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

## Two files, two jobs

When the project keeps both, `PRODUCT.md` says why (who it is for, in what situation, what
the product promises, what evidence exists, the principles, the accessibility stance) and
`DESIGN.md` says what it looks like (the tokens and the rules). The design file is read as
data: a frontmatter block with the tokens is the truth, the prose only explains it. Neither
is overwritten silently: a change is shown as a diff and written after a yes. (The split
and "frontmatter is normative" come from pbakaus/impeccable, Apache-2.0, and from the
DESIGN.md format used by Google Stitch, which voltagent/awesome-design-md, MIT, collects.)

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

## A shape for the file, when it is written from scratch

Frontmatter with the tokens (colours by role, type scale, space scale, radii, elevation
levels), then: overview (the kind of screen the product mostly is, from `direction.md`);
colours; typography; layout; elevation as named levels; shapes; components (each with its
variants and states); do's and don'ts written as numbers ("button padding never under 8 16",
"display weight never above 300", "`tnum` on every money cell"); responsive behaviour; an
iteration guide (one component at a time, name components and tokens, a new variant is a
new entry, never a changed one); known gaps. The last section is the honest one: what the
system does not yet decide. (The section list is the Stitch DESIGN.md format; the
do's-and-don'ts-as-numbers habit is from the collected files.)

Where tokens are found, in order, when the project has no file yet: CSS custom properties;
the Tailwind config; a CSS-in-JS theme; a `tokens.json`; the components' source; the global
stylesheet; finally computed styles in the browser. (The order is pbakaus/impeccable's.)

## How it is applied

The house file wins over `taste.md`, `polish.md`, `motion.md` and `tokens.md` wherever the
two disagree. Drift from it is checked, not assumed: a font, a colour, a radius or a type
size that the file does not list is a `raw` line in the report, with the file and the
value, every time. A screen that needs something the house file does not have (a new colour, a
new effect, a new component kind) is a question to the person, shown as a proposal apart
from the code, not a silent addition. When the project has no house file, the first
delivery includes a draft of one, extracted from what exists, for the person to keep or
correct.
