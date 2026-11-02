# Direction — deciding what it should look like before building it

Generic comes from skipping this step: the same centred hero, the same purple gradient, the
same three cards with icons. A direction is a few decisions made on purpose and then held.

## Three questions first

Who uses it and in what state of mind: someone doing a job eight hours a day, or someone
deciding in ten seconds whether to stay. A tool is dense, quiet and fast; a pitch is
spacious and has one thing to say.
What is the one thing the screen is for. It gets the size, the contrast and the position;
everything else steps back.
What exists already: a logo, a brand colour, a product people know. The direction grows
from that, not over it.

Not answerable from the project: ask, at most these three, once.

## Four kinds of screen, and what wins in each

A screen is one of four things, and the kind decides every tie. **Persuade**: it must earn
attention and an action in seconds; the one idea gets the size and the space. **Operate**:
a tool used for hours; scanning, speed and the controls people already know win, and the
product's own character is allowed exactly four things: the type, the palette, the density
and one signature move; it never invents the navigation or the controls. **Read**: a long
text; structure for comprehension, measure, rhythm, nothing that competes with the words.
**Experience**: the content leads (a map, a canvas, a video) and the interface recedes
until needed. Name the kind in the brief; a tool designed like a pitch is the most common
way a screen goes wrong. (The four modes and the four things a tool may own are
pbakaus/impeccable's, Apache-2.0.)

## The decisions

Write them down in a few lines before any component; they are the brief the rest is held
to.

**Type.** One family, two at most, and why. A scale with clear steps, few sizes. Weight and
size carry hierarchy before colour does. Body text at a comfortable measure, roughly 45 to
75 characters a line.
**Colour.** A neutral range that does most of the work; one accent, used for the thing that
matters and little else; the semantic colours (danger, success, warning) kept apart from
the accent. Dark mode is designed, not inverted.
**Space.** One spacing scale. Density chosen once: compact for tools, generous for reading.
Related things close, unrelated things apart: spacing does the grouping before borders and
boxes do.
**Shape and depth.** One radius family; flat, bordered or elevated, picked and kept.
**Voice.** How the interface speaks: labels as verbs, sentence case or not, how errors are
worded.

One thing that is the product's own: a layout idea, a typographic choice, a way of showing
its data. One is enough; three is noise. Written as one sentence before building: "on this
screen, <something from the subject> becomes <the device>", so the idea can be checked.
Then the ownership test: cover the logo, could this screen belong to anyone? Would the
same idea pass for the nearest competitor? If yes to either, the idea is not yet the
product's own. (The sentence and the test are Leonxlnx/taste-skill's, MIT.)

## Signs of no direction

Every section centred. A gradient because the page looked empty. Icons in coloured circles
above every heading. Cards inside cards. Four font sizes within one component. Emoji as
icons. Shadows on everything. A hero sentence that could sit on any product. Decorative
elements that say nothing about what the product does. Each is fine when chosen; together
they are the look of nothing chosen.

## Show before building wide

For a new screen or a redesign: the decisions in a few lines, and one representative
section built for real. The user sees that before the other ten sections are written. Two
directions are offered only when they truly differ; then each in three lines and one
recommendation.

An existing product with a settled look: this file is not for changing it unasked. Work
inside what is there.
