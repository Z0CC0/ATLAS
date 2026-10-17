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

Beats by length: 15 seconds holds three to five, 30 seconds five to eight, 60 seconds seven
to twelve; the narration fills 80 to 85 percent of the runtime, the rest is picture; the
hook (the problem, in the viewer's terms) lands inside the first three seconds. Written
for a synthetic or a recorded voice alike, the script spells what the ear needs ("nearly
two trillion dollars", not "$1.9T"; "A P I" when the letters are said). When the voice
is generated, its word timestamps set every scene length, and a synced value is never
edited by hand. (Beat counts, the 80-85 percent rule and voice-first timing:
heygen-com/hyperframes, Apache-2.0.)

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

Two more columns when a cut is more than a cut: `carry out` and `carry in`, the element
that survives the cut and where it is on both sides (position, scale, what it is doing).
A cut with nothing carried is a hard cut and says so. The last beat rhymes with the first:
same place, pose or motif, changed by what happened. The piece in one line before the
table: "<who> wants <what>, but <obstacle>, so <what we show>". (Carry fields:
hyperframes' product-launch skill and onetake; the rhyme and the logline:
ClaudeAnimationBase.)

Before the table, for a piece with any ambition, the treatment: three candidate
structures and the chosen one with its reason; the logline; a benchmark piece with what to
learn from it and what not; the shot list (framing, angle, move, duration, reason); the
beat sheet by the second; the cue map (tempo, bars, instruments per section, the beats
where cuts, actions and subtitles land); a sound design table (ambience bed, main foley,
music state per section); the subtitle and title design. A storyboard of six to nine key
shots rendered with real code, tiled with shot number, framing, duration and line, only
when the person asks for one; otherwise the treatment is approved and production starts. (lemomo-ai/lemo-opuscar, MIT.)

A spoken line that needs a picture of its own (B-roll, an illustration): one line, one
image, one metaphor, three to six objects at most, the emotion of the line choosing the
base colour, and never the line's own words printed on the screen. (gbro-collage-broll,
MIT, does this for collage B-roll; the rule holds for any illustration.)

## Narration and captions

A recorded voice (the person's, never a cloned one) or captions only; a synthetic voice is
outside this skill and is said so. Captions: one or two lines, 32 to 42 characters a line,
on screen at least half a second and in practice a second, a gap of about a second and a
half between groups, each word within 80 ms of when it is said, fading in and out in 150
to 250 ms, never over the thing being pointed at. Size about 4.5 percent of the frame
height (48 px at 1080p), weight 500 to 600, baseline 80 to 120 px above the bottom in 16:9
and well above the lower fifth in 9:16 where the interfaces of phones overlay, a 30 to 40
percent scrim behind the text box only. One group on screen at a time. The caption file
(`.srt` or `.vtt`) is generated from the script timings, not typed twice. (The numbers are
hyperframes' caption rail, Apache-2.0.)
A subtitle holds at least 1.8 s and never less than the spoken line plus 0.6 s; a text
that animates in holds, after the animation, letters ÷ 15 + 1.5 s (characters ÷ 4.5 + 1.5
for Chinese, Japanese, Korean); a title card at least 4 s; two options the viewer must
compare, at least 2.5 s before the verdict. These are asserted in the timeline, not hoped.
The text the voice reads and the text the screen shows are two fields of one line: the
voice gets numbers spelled out and abbreviations expanded, the screen gets digits and the
short form. A generated voice is transcribed back and compared with the script line by
line (a similarity under about 0.92 is regenerated), and its word timestamps drive the
caption reveal. Two languages at once: one line each per cue, never wrapped; a long cue is
split, not stacked. (lemomo-ai/lemo-opuscar, MIT.)

A second language is a strings table and a switch, never a second shoot: the same
composition with the other strings, verified frame by frame against the first where no
text differs. (onetake's localisation rule.)

## Where it goes

`media/<piece>/script.md` with the storyboard table in it; the renders read their text and
timings from this file, so a change to a sentence is one edit. The script is shown and
approved before the first draft render, because changing words after rendering costs a
render.
