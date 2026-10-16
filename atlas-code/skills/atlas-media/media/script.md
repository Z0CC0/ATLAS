# Script, storyboard, narration

A video is written before it is rendered. The script decides the length, the storyboard
decides what is on screen for each sentence, and only then is anything animated. A piece
that starts from the animation ends up long, pretty and unclear.

## Length first

The audience's time is the budget: an explainer of one idea, 60 to 90 seconds; a feature
demo, 2 to 3 minutes; a talk, as long as the slot minus questions. Spoken narration runs
at 140 to 160 words a minute in English, 130 to 150 in Italian; a 90-second piece is at most
220 words. Silence is allowed: a visual that needs three seconds to be read gets three
seconds of no words.

## The script

One idea per piece. The first sentence names the problem in the viewer's terms; the second
says what they will know at the end. Then the explanation in the order the viewer needs,
not the order the system works in: what they see, what it means, why it matters. Every
sentence that can be said with a picture is shorter when the picture carries it ("here" and
a pointer beats a description). The last sentence says what to do next, once. No "in this
video we will"; no "as you can see"; no apology for what is left out.

Sentences under twenty words, read aloud before being kept: a sentence that makes the
reader breathe twice is two sentences. Numbers rounded to what the ear keeps (about
three hundred, not 312) unless the exact figure is the point. Terms defined the first time,
in the sentence, by what they do.

## The storyboard

A table, one row per sentence or beat: the words (or "silence"), what is on screen, what
moves and when, how long. Durations summed and compared with the budget before any
rendering. Every visual answers "what does the viewer look at first"; a frame with no
answer is redesigned. Text on screen is at most one short line that the narration does not
also say word for word; the viewer cannot read and listen at once.

## Narration and captions

A recorded voice (the person's, never a cloned one) or captions only; a synthetic voice is
outside this skill and is said so. Captions: one or two lines, 32 to 42 characters a line,
on screen at least a second, in sync with the beat, never over the thing being pointed at.
The caption file (`.srt` or `.vtt`) is generated from the script timings, not typed twice.

## Where it goes

`media/<piece>/script.md` with the storyboard table in it; the renders read their text and
timings from this file, so a change to a sentence is one edit. The script is shown and
approved before the first draft render, because changing words after rendering costs a
render.
