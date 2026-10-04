# From an image — a screenshot or a mock-up into the project's components

The image is read here, by this model. It is not sent to any other service.

## What an image can and cannot tell

It shows one state, at one width, with one set of content. It does not show: hover, focus,
loading, empty, error; what happens when the text is longer; what happens on a phone; what
is clickable; exact values. Everything it does not show is either taken from the project's
existing patterns or asked.

Colours and sizes read from pixels are estimates. They are snapped to the project's tokens;
where no token is near, the estimate is reported as a guess, not written as if measured. A
design file's export with real values (a spec, CSS, a token file) beats the picture every
time: ask whether one exists.

## Read it in this order

1. **Structure.** The regions, top to bottom, outside in: what is layout, what repeats,
   what is a component. Written as a short tree before any code.
2. **Match.** For each node, the project's existing component that it is, with the props
   that produce what is drawn. Only what has no match is new.
3. **Layout.** Which things are in a row, which in a column, what stretches, what is fixed,
   what would wrap. Flex and grid from that; no absolute positions copied from pixel
   coordinates.
4. **Type and colour.** Each text style mapped to the type scale; each colour to a role.
5. **Content.** Which text is real copy and which is sample data. Sample data becomes
   props; real copy goes where the project keeps its strings.
6. **Assets.** Icons from the project's icon set by meaning; a logo or illustration that is
   not in the repository is asked for, never redrawn or replaced by a look-alike. Photos get
   a placeholder with the right aspect ratio.

The tree, the matches and the open questions go to the user in a few lines before a larger
screen is built. A single component is just built.

## Build

In the project's framework and component library, in the style of the nearest existing
file. Semantics by what things are, not how they look: the thing that looks like a tab bar
is tabs; the bold line is a heading of the right level. The "always" section of `a11y.md`
applies.

The states the image does not show are built from the project's patterns, as in
`method.md`. Responsive behaviour likewise: the width in the image is one point; say what
was decided for the others.

Several images of one flow: shared components are found across all of them first, then
each screen. Several widths of one screen: they are the breakpoints, and the differences
between them are the responsive rules.

## Compare

When a browser is available, `atlas-browser` opens the result at the image's width and
reports the differences from the reference in words: spacing, alignment, sizes, colours,
missing elements. Fix what differs; two passes, then report what remains.

```
built    src/pages/Pricing.tsx  3 existing components, 1 new (PlanCard)
guessed  card shadow, the muted grey of the footnote (no token near #8b8f97)
assumed  below 640 px the three plans stack; annual toggle keeps its state
missing  the illustration in the hero: placeholder at 16:9, file needed
looked   1440 wide against the image: heading 4 px lower, otherwise matches
```

An image of someone else's product is a reference for layout, not something to clone with
its brand, logo and copy.
