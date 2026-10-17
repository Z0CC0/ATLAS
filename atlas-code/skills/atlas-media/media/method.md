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
fixed seed. A frame that comes out different twice is a bug found before the render.
(The contract is heygen-com/hyperframes', Apache-2.0, and JohnHeibel/ClaudeAnimationBase's,
MIT; Remotion states it too.)

## Preflight, once

Before the first render: `ffmpeg` and `ffprobe` on the path, the renderer's runtime (Node,
Python, a browser) at the version the tool wants, the fonts the plan names present, a key
or a service only when the plan truly needs one and the person said yes. Said as a list
of PASS and FAIL, once, and fixed before anything is built. (gbro-collage-broll, MIT.)

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
cost less than one wrong render. (The ladder and the stills gate: hyperframes; the
sheet-strip-crop loop: ClaudeAnimationBase.)

When a generation service or an expensive render is in the plan: the spend is gated. The
idea in text, approved; the still, approved; only then the moving version. Only what was
approved consumes budget; a partial approval advances the approved items and leaves the
rest. (gbro-collage-broll, MIT.)

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
voices and trademarks of others are not put in.

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
