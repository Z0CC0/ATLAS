# Pace, rhythm, cuts

Pace is how long each thing stays on screen; rhythm is whether the changes land where the
meaning changes. A piece that drags holds frames after the viewer has read them; a piece
that races cuts before they have. Both are fixed with numbers, not with feel.

## How long a shot stays

Long enough to be read once by a slow reader: a title, 2 seconds; a line of text, 3 to 4;
a diagram with three parts, 5 to 8; a code block, as long as it takes to read the lines
that matter, with the rest dimmed. Nothing under a second except a transition. A shot
whose content is already understood is cut, not shortened.

## Where to cut

On the beat of the narration: a new sentence that introduces a new thing starts a new
shot; a sentence that adds detail to the same thing keeps the shot and changes one element
in it. Cut on the action, not after it: the new element appears as the word for it is
spoken, not a second later. A pause in the voice is a chance to let the picture settle,
not a reason to change it.

## Transitions

A cut is the default and is invisible. A fade (200 to 400 ms) marks a change of topic or
time. A wipe or a slide says "next item in a sequence" and is used for nothing else.
Nothing spins, zooms through or shatters in a tool's explainer; a transition the viewer
notices has taken attention from the content. One transition style per piece.
By energy: a calm piece crosses in 0.5 to 0.8 s, a medium one in 0.3 to 0.5, a fast one in
0.15 to 0.3; the opening a little longer, the outro longest. One primary transition
carries 60 to 70 percent of the changes, one or two accents the rest. The outgoing and the
incoming scene move at the same instant: a fade-out followed by a fade-in is two
transitions and a hole. Nothing exits except on the last scene; what is finished is cut
away by the next scene's entrance. The rhythm is written before building, as a pattern
("fast, fast, SLOW, fast, hold"), and the finished piece is checked against it. (The
bands, the 60-70 rule, the no-exit rule and the pattern: heygen-com/hyperframes,
Apache-2.0.)

## Silence, and the sound that follows it

At least two real silences, or near silences, before the turn or the emotional peak; the
first sound after a silence is one of the most important sounds of the piece, so it is
chosen, not whatever happens next. Sound carries a transition at least twice (a J-cut,
where the next scene is heard before it is seen; an L-cut, the reverse). Before the
heaviest impact, a short suck-out: 0.2 to 0.45 s with music and foley down about 25 dB,
then the hit. (lemomo-ai/lemo-opuscar, MIT.)

## What crosses the cut

Every cut names the element that survives it, in the storyboard's carry columns: a
colour, a shape, a position, a direction of movement. A piece where nothing ever carries
is a slideshow; a piece where everything carries is one shot. Checked by looking at the
frame before and the frame after each cut side by side. (onetake's "carry".)

## Motion inside a shot

Elements enter with the words that name them, in reading order, 150 to 300 ms each with
ease-out; elements leave faster than they came (100 to 200 ms, ease-in). Movement shows a
relation (A flows to B, C grows) or it is removed. The camera (pan, zoom) moves to follow
the viewer's attention, never to look alive; a slow push-in of a few percent over a long
shot is the most that a still frame needs. Loops (a spinner, a pulse) run for the time a
state lasts and stop when it ends.

## Rhythm check

Before the final render, the shot list with durations is read as a sequence of numbers:
three shots of the same length in a row make a metronome, five seconds followed by one
second is a jolt unless the meaning jolts. As numbers: the shot lengths vary (their
coefficient of variation at least a quarter, or it is a metronome); some frames are still
(a quarter of them, with at least one quiet stretch of a second, or the eye never rests);
at least one burst exists (several big changes inside a second and a half, not evenly
spaced); two consecutive shots never end the same way. Durations in note values when the piece
has a beat: a snap starts one note early and lands on the beat; the finest subdivision
used divides the frames in a minute evenly (at 24 fps, 1,440), or the hits drift off
their frames. The camera: at least four different moves and real changes of framing in a
piece, one signature shot, the subject filling at least a third of the frame height at the
key moments, no frozen frame longer than a second (a hold still creeps 2 to 5 percent),
transitions made from the medium itself before a default fade. Per movement: fast 0.15 to 0.3 s,
medium 0.3 to 0.5, slow 0.5 to 0.8, very slow 0.8 to 2; the slowest scene three times
slower than the fastest; no more than two movements in a scene with the same easing; a
stagger finishes inside half a second however many items it has; an entrance longer than
its exit (0.4 against 0.25). A scene splits roughly 30-40-30: build, breathe with one
ambient movement, resolve. Anything that travels more than about eighty pixels a frame (at
1080p) needs motion blur or a shorter path; blur on one to three elements per piece, never
on text that must be read. (The measurable rhythm gates: onetake; the movement bands, the
stagger cap, the asymmetry, the 30-40-30 and the blur budget: hyperframes.)
The whole piece is watched at 1.5x: what still
reads at that speed was too slow; what is lost was too fast. Then once at normal speed
with the sound off: the pictures alone must tell the order of things.

## What fails, seen in renders

The subject too small or against the frame edge; a colour on the same colour; subtitles
covering the subject; a gag too fast to land; a blank frame inside a transition; an effect
timed to a subject that stops tracking it after a camera move; poses switched inside a
condition instead of blended with keyframes and easing (a deliberate one-frame pop is the
exception); a rolling object whose rotation is not distance ÷ radius. (lemomo-ai/lemo-opuscar, MIT.)

## What drags, in practice

A list of bullets appearing one by one with a second between them; a code block typed
character by character; a logo animation at the start; the same diagram redrawn for every
sentence; a narration that reads what the screen already shows.
