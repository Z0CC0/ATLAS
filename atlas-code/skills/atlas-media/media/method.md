# Method — read every time something is rendered

## The plan comes before the code

Three things, agreed in a few lines before anything is written:

**The one sentence.** What the viewer should understand or feel at the end. A piece that
cannot be put in one sentence is two pieces.
**The frame.** Aspect ratio (16:9 unless told otherwise; 9:16 for phones), resolution,
frame rate, length, with or without sound, where it will be shown.
**The scenes.** Three to six for a short piece, each with what it shows, the one thing it
establishes, and its length:

```
1  0:00–0:06  the problem: one request, three servers, which one answers?
2  0:06–0:18  round robin: requests dealt in turn, one server falls behind
3  0:18–0:32  least connections: the slow server receives fewer
4  0:32–0:38  one line: balance by load, not by turn
```

One idea per scene. Things appear when they are spoken of, not all at once. Movement shows
a change of state; nothing moves to fill time. On-screen text is short and stays long
enough to be read twice.

**The reads.** Under the scenes, the ordered list of the things the viewer must understand,
one per line, each with where the eye is when it starts. One read at a time; a shot lasts
as long as its reads take, not the reverse. Timing is the rule most often got wrong, and
this list is what keeps it honest. (The reads as the unit of timing: JohnHeibel/
ClaudeAnimationBase, MIT.)

**The brief, in one message.** The questions that change the piece, asked once, with the
defaults stated beside them (30 to 60 seconds unless told otherwise; longer multiplies
time and tokens; the loudness target; anything that would need the network), and the gaps
filled with the defaults, not with a second round of questions. (lemomo-ai/lemo-opuscar, MIT.)

**What was asked, and nothing beside it.** A title card is a title card, not a title card
plus three scenes, music and captions; an addition is proposed and built after a yes.
(heygen-com/hyperframes, Apache-2.0.)

Sound, when there is any: the voice or the music fixes the timing, and the pictures are
cut to it, not the reverse. The audio file is supplied by the user.

## Every frame is a function of its time

Whatever the tool, a frame is computed from its time value alone, so the same time gives
the same pixels on any machine, in any order, twice. Nothing in a composition reads the
clock, the date, an unseeded random, the network, the pointer or the scroll; a loop
repeats a finite number of times computed from the duration; fonts and media are loaded
before the timeline is built, never while it plays; a simulation is precomputed from a
fixed seed. A frame that comes out different twice is a bug found before the render. No state carried
from the previous frame. Drawings may step on twos (twelve changes a second) where the
style wants it, but the camera and the light move every frame: a stepped camera reads as
lag. Any effect that follows a subject (an iris, a zoom, a spotlight) goes through the one
function that maps the world to the screen; screen coordinates are never typed by hand. (lemomo-ai/lemo-opuscar, MIT.)
(The contract is heygen-com/hyperframes', Apache-2.0, and JohnHeibel/ClaudeAnimationBase's,
MIT; Remotion states it too.)

## Preflight, once

Before the first render: `ffmpeg` and `ffprobe` on the path, the renderer's runtime (Node,
Python, a browser) at the version the tool wants, the fonts the plan names present, a key
or a service only when the plan truly needs one and the person said yes. Said as a list
of PASS and FAIL, once, and fixed before anything is built. (gbro-collage-broll, MIT.)

## Quality before tokens, for a video

The reading a video needs (the framework's own rules, the transition catalogue, the
typography list) is done in full, before the first line, whatever it costs: a video made
with less than the installed tools offer is the expensive outcome, not the tokens. The
compression dial still governs the conversation, not the work.

## Draft first

Render at the lowest quality and smallest size the tool offers until structure and timing
are right; one scene at a time while working on it. Full quality once, at the end. A
render that takes minutes is not a way to check a typo.

The ladder has three named rungs and the middle one is where the work happens: a draft
(small, fast, to see structure and timing), a looks render (full size, good quality, to
judge the picture), a delivery render (the final settings of `export.md`), once, after a
yes. Before any of them, stills: the first, middle and last frame of every scene on one
contact sheet; then, for a moment that matters, every frame of that half-second in a
strip; then a crop at full resolution where the detail is. Three zooms, in that order,
cost less than one wrong render. For the key actions (a hand-over, a fall, a hit) the
strip is at a fifth of a second; two full passes of sheets before the final render.

Legibility is a gate with a formula, not an impression (`tools/readcheck.mjs` beside these
files, for any page with a seekable timeline): every on-screen text is registered
with its box; it counts as visible only while the whole box is inside the frame; it must
hold for at least `max(1.5, letters / 15 + 1.5)` seconds (characters / 4.5 for Chinese,
Japanese, Korean), sampled every 0.04 s; a text that fails is listed with its time, and
the render does not proceed. Fast is fine; make it fast with fewer words per screen. (lemomo-ai/lemo-opuscar, MIT.)

On the final file, by tool and then by eye: loudness and true peak (`ffmpeg -af
ebur128=peak=true`), black frames (`blackdetect`), the voice transcribed back from the mix
and compared with the script, no NaN or empty frames; then watched once at full speed with
the sound on, and the last seconds watched twice, because the end is where a render is
cut short. A film that states facts carries a `FACTS.md`: each claim with its source and
the quoted wording, or the measurement that produced it. (lemomo-ai/lemo-opuscar, MIT.) (The ladder and the stills gate: hyperframes; the
sheet-strip-crop loop: ClaudeAnimationBase.)

When a generation service or an expensive render is in the plan: the spend is gated. The
idea in text, approved; the still, approved; only then the moving version. Only what was
approved consumes budget; a partial approval advances the approved items and leaves the
rest. (gbro-collage-broll, MIT.)

## Rendering in parallel

One browser (or one process) per worker, frames piped to one encoder per worker, the
segments joined without re-encoding; a lock on the output path so two renders never write
one file; the number of concurrent renders capped machine-wide; a page error kills the
render instead of producing a film with a hole in it. (lemomo-ai/lemo-opuscar, MIT.)

## Long output stays out

Renders print thousands of lines. Run them through `atlas-runner` when it exists, or with
output to a file in the scratch directory, reading only errors and the final path.

## Look at what came out

A render that exited cleanly is not a finished video. Check, from the file:
duration, resolution and frame rate with `ffprobe`;
a still from the middle of every scene (`ffmpeg -ss <t> -i out.mp4 -frames:v 1`), opened
and looked at: nothing cut off at the edges, no overlapping text, legible at the size it
will be watched, the last frame of each scene is the intended one.
What was not looked at is said.

## Assets and rights

Fonts, images, music, footage and logos come from the user or from the project. Nothing is
downloaded from the web into a piece without a yes and a note of its licence. Faces,
voices and trademarks of others are not put in. What is taken in is CC0, CC BY or OFL, or
the person's own; public-domain counts as CC0, "no known restrictions" does not; a
share-alike or database licence is named to the person before it is used. Every asset in
a `CREDITS` file, and at sign-off a search of the sources finds no licence text outside
`LICENSE` and `CREDITS`. Fonts are self-hosted beside the piece and loaded before the first
draw (`document.fonts.load`), never linked from a font service at render time; text is
measured after the font and the letter-spacing are set, or the measure is wrong. (lemomo-ai/lemo-opuscar, MIT.)

## Files

Source in the project where the user says, or a folder beside it; renders in an output
folder that is not committed. Nothing existing is overwritten: a new name per version.

## Report

```
made     out/load-balancing-v2.mp4  1920×1080 · 30 fps · 0:38 · no audio
source   media/load_balancing.py (4 scenes)
looked   stills at 0:03, 0:12, 0:25, 0:35: text inside the frame, legible
not      not watched at speed; timing against narration unchecked (no audio supplied)
```
