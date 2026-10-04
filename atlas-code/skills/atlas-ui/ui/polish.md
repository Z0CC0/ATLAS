# Polish — the details that make a screen feel finished

Each of these is small. A screen that gets them right reads as cared for; one that misses
them reads as "off" without anyone being able to say why. Look for them in this order and
change only what is wrong.

## Alignment and rhythm

Everything sits on something: a shared left edge, a baseline, a grid column. Count the
distinct left edges on the screen; fewer is calmer.
Spacing from the scale, and consistent in kind: the same gap between the same kind of
things everywhere. More space around a group than inside it.
Optical, not only geometric: a play triangle, an arrow, an icon beside text often needs a
pixel or two to look centred. Icons the same visual weight and stroke as their neighbours,
aligned to the text's centre line, not to its box.

## Shape

Nested rounded corners: the outer radius is the inner radius plus the padding between them;
equal radii on both look pinched. When the padding is large, treat them as separate
surfaces.
Borders separate; shadows lift. A border and a heavy shadow on the same element is two
answers to one question. Shadows soft, low opacity, layered rather than one hard blur, and
consistent in direction. On dark surfaces depth comes from lighter surfaces and borders,
not shadows.
Images that end in the same colour as the page get a hairline inset outline in neutral
black or white at low opacity.

## Text

Headings and short titles: `text-wrap: balance`. Short paragraphs and captions:
`text-wrap: pretty`. Neither on long prose or code.
Numbers that change or line up in columns (prices, counters, timers, tables):
`font-variant-numeric: tabular-nums`.
Line height tighter on large headings, looser on body. Letter spacing slightly negative on
large display sizes, never on small text.
Truncation is a decision: what is cut, where, and how the full value is reached.
No widows of one word under a heading; no orphaned label away from its value.

## Controls

A hit area of at least the sizes in `a11y.md`, even when the visible mark is smaller:
extend with padding or a pseudo-element, without overlapping the neighbour's.
Every interactive thing answers at once: hover where there is a pointer, a visible focus
ring for the keyboard, a pressed state. A press may scale slightly (around 0.97); not on
large surfaces.
A disabled control says why nearby when it is not obvious. A button that starts something
slow shows it is working and cannot be pressed twice; its width does not change when the
label does.
The cursor tells the truth: pointer on what navigates or acts, default elsewhere.

## Movement

Transition the properties that change, by name: `transition: all` animates things nobody
meant. State changes are transitions, so they can reverse midway. Details in `motion.md`.
Nothing shifts when content arrives, a scrollbar appears, or a font loads.

## Colour and contrast

Fewer greys: three or four text levels at most, each with a job. Pure black on pure white
is harsh on large areas; near-black on off-white reads easier, within the contrast limits
of `a11y.md`.
One accent doing one thing. A destructive action looks different from a primary one.

## Reporting a polish pass

One line per change, before and after in plain words:
`OrderCard  radius 8 inside 8 → 12 outside, 8 inside (4 padding)`.
Things that are a matter of taste and not clearly wrong are offered, not applied.
