# Slides — an HTML deck

One HTML file that opens in any browser, with no build step and no network: styles,
script and images inside it or beside it. It is presented full screen and can be printed
to PDF.

## Content first

Who is in the room, what they should do or believe afterwards, how long the talk is. Then
the outline: one line per slide, each a claim, not a topic ("Latency fell by half after
the cache", not "Performance"). Roughly one slide a minute, fewer when they are dense.
The outline is agreed before any styling.

Converting an existing deck (`.pptx`): extract text, notes and images with a script
(`python-pptx`), show the outline that came out, and rebuild; do not imitate the old
layout slide by slide.

## Style

Asked with something to look at, not with adjectives: two or three title slides in
different directions, built for real, and the user picks. Then one type scale, one palette
with one accent, one grid, held for the whole deck (`atlas-ui`, direction).
The project's or the company's existing fonts and colours when there are any.

## Every slide fits the screen

The rule that breaks most generated decks: a slide never scrolls and never overflows.
Each slide is exactly the viewport (`100vh`, `100dvh`), with `overflow: hidden`.
Type and spacing scale with the viewport (`clamp()` with viewport units), so the deck
holds on a laptop, a projector and a phone.
Content limits, so that it can fit: a title and at most five or six short lines; or one
image; or one chart; or one quotation; or a small code block of around ten lines. More
than that is two slides.
Images sized by the height left over, never by their own height.
Check at 1280×720 and at one small and one tall size before calling it done.

## Behaviour

Arrow keys, space and page keys move; so do swipe and click. The slide number is in the
address, so a reload or a shared link lands on the same slide. A progress indicator, quiet.
Speaker notes kept in the markup and hidden, shown by a key.
Entrances are short and few: a fade or a small rise for the elements of a new slide; none
on text the audience is waiting to read. `prefers-reduced-motion` honoured.
A print stylesheet: one slide per page, no animation, backgrounds kept.

## Legible from the back

Large type: body text never small enough to need leaning in. Contrast by the numbers in
`atlas-ui`'s accessibility file. One idea per slide; the speaker says the rest.
Charts simplified for the room: the one series that matters highlighted, labels on the
data, no legend to decode.
Code: a few lines, large, with the line that matters marked.
Real headings and alternative text, so the file is usable with a screen reader.

## Hand over

The file, the outline it implements, how to present (open, full screen, keys) and how to
export a PDF from the browser's print dialog. Checked sizes listed; what was not checked,
said.
