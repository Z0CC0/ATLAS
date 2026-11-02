# Taste: what makes a screen look designed

A screen looks designed when every choice on it was made once and then kept. Taste is not
decoration; it is fewer decisions, each visible everywhere. The rules below are the ones
that separate "a form" from "a product" in the first second, with the numbers that make
them checkable. The project's own style file (`house.md`) overrides any of them.

## One scale for space

Every margin, padding and gap comes from one scale: 4, 8, 12, 16, 24, 32, 48, 64 px. Nothing
at 10 or 18. Space between related things smaller than space between groups (8 inside a
card, 24 between cards); the biggest space on the screen marks the biggest division. Edges
aligned to a grid the eye can feel: left edges of text in a column line up, numbers right-
aligned, icons on the same baseline as their label.

## Type: two faces, five sizes, three weights

One typeface for text, at most one more for display or code. A size scale with a ratio
(1.2 to 1.25 between steps): 12, 14, 16, 20, 24, 32. Body at 14 to 16 with line height 1.4
to 1.6; headings tighter (1.1 to 1.2) and with a little negative letter-spacing when large.
Weights: regular, medium, bold, nothing else; emphasis by weight or colour, never both.
Line length 45 to 75 characters. Capitals only for very short labels, and then with letter-
spacing. Numbers in tables with tabular figures.
Display type: tracking −0.02 to −0.05 em, leading 0.85 to 1.05, `text-wrap: balance`, a
measure of about 14 characters so a headline is two lines or fewer at every width. Text:
16 to 20 px with leading 1.45 to 1.6. Nothing sits between the lead size and the heading
size: a size that is "a bit bigger than body" is a sixth size. (Numbers from
Leonxlnx/taste-skill, MIT, consistent with the 1.2 to 1.25 ratio above.)

## Colour: 60-30-10, and one accent

Most of the screen is one neutral (60%), surfaces and borders a second neutral (30%), one
accent for what can be acted on (10%) and nothing else in the accent colour. Red, amber,
green mean error, caution, success and are used for nothing else. Text contrast at least
4.5:1, large text 3:1; a disabled state is lower contrast, not a different hue. Dark mode is
not the inverse: dark surfaces slightly lighter than the background, shadows replaced by
borders or tonal lifts, saturated accents desaturated a step.

## Surfaces and depth

One corner radius for controls, one larger for cards and dialogs, consistent to the pixel.
At most two levels of elevation (resting, raised); shadows soft, low, slightly tinted, never
black at full opacity. Borders one pixel, low contrast; a border and a shadow on the same
element is one too many. Hairlines separate, backgrounds group: when both are there, one
is removed.
A surface can be a tone step instead of a border or a shadow: a panel two to six lightness
points from the background reads as a panel with nothing drawn around it. No panel inside a
panel. The ground is 70 to 90 percent of the screen; the accent under 5 percent of any
screen. (Tone steps and the two percentages: Leonxlnx/taste-skill, MIT.)
Depth written as named levels, so every surface can be checked against the list: level 0
flat on the ground; level 1 a surface one step up with a hairline; level 2 two steps up with
a stronger hairline; level 3 three steps up, for what floats; the focus ring apart from all
of them. (The format of named levels is how the DESIGN.md files collected in
voltagent/awesome-design-md, MIT, describe elevation; the values are each project's own.)
Colour strategy chosen once: either the strongest colour owns one region (a sidebar, a
header, the one card) and the rest is neutral, or one saturated colour carries a third to
a half of the surface on purpose; scattered small accents are neither. (pbakaus/impeccable,
Apache-2.0.)

## Hierarchy: one thing first

Each screen has one primary action, in the accent, and everything else secondary or
tertiary (outline, text-only). One heading at the top size; the rest a step down. Density
chosen for the task: a dashboard denser than a form, a reading page sparser than both.
Empty, loading, error and success states designed, not left to the browser default; the
empty state says what to do next.

## Motion, restrained

Transitions 150 to 250 ms, ease-out on enter and ease-in on exit; nothing bounces in a
tool. Motion explains a change of state (where the panel came from) and is otherwise
absent; `prefers-reduced-motion` respected.

## The tells of a screen made without taste

Centered body text; four typefaces; every control the accent colour; grey text on grey at
3:1; a different radius on the button and on its input; icons from two sets; a shadow
under everything; a table with no alignment; capitals everywhere; a screenshot-sized
hero image on a settings page; placeholder copy ("Lorem", "Click here"); a dark mode that
is the light mode with the colours inverted.
And the ones that are refused outright: a coloured side border thicker than a pixel on
cards, list items and alerts; a modal for a task that interrupts nothing and protects no
focus; monospace worn as a costume for "technical"; the big-number-small-label metric
template; hard offset shadows (`4px 4px 0`) outside a design that is actually brutalist;
light or dark chosen because of the product's category instead of where it is used.
(pbakaus/impeccable's refuse list, Apache-2.0.)
Tells have a date. What a generated page looked like in 2023 (purple gradients, icon
cards) is not what it looks like now; the lists of "use this instead" become the next
year's tells. So the list above is dated 2026 and is re-read, not trusted, in a year.
Where a number exists, it comes from a study of 247 showcase sites against weak ones
(Leonxlnx/taste-skill, MIT, collected October 2026): icon-topped cards 1% of the strong
sites against 28% of the weak, pill badges 14% against 34%, tiny uppercase labels 16%
against 57%, gradients 22% against 52%, resting shadows 24% against 48%, fully rounded
buttons 23% against 59%. Cited, not reproduced as ours.

## How to use this

Read the project's existing screens and extract what they already do (scale, type, accent,
radius); write it down as the project's house file if it has none. Apply the rules above
only where the project has made no choice. Check the result in the browser at phone width
and at 1440, in both colour schemes, and say what was changed and by which rule.
