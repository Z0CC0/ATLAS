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

## How to use this

Read the project's existing screens and extract what they already do (scale, type, accent,
radius); write it down as the project's house file if it has none. Apply the rules above
only where the project has made no choice. Check the result in the browser at phone width
and at 1440, in both colour schemes, and say what was changed and by which rule.
