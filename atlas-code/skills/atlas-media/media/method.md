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

Sound, when there is any: the voice or the music fixes the timing, and the pictures are
cut to it, not the reverse. The audio file is supplied by the user.

## Draft first

Render at the lowest quality and smallest size the tool offers until structure and timing
are right; one scene at a time while working on it. Full quality once, at the end. A
render that takes minutes is not a way to check a typo.

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
