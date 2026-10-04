# Explainers — Manim

For ideas with structure: maths, algorithms, data flowing through a system, a graph that
changes. Manim Community is a Python library; `manim --version` says whether it is there,
and it needs `ffmpeg`, and LaTeX only for typeset formulas.

Its API moves between releases: read the documentation of the installed version for the
classes used, and prefer the plain, long-standing ones.

## Structure

One `Scene` class per scene of the plan, in one file or one per file; the scenes are
rendered apart and joined at the end. Shared colours, fonts, sizes and timings in one
module, so the piece looks like one piece.

Inside a scene, the same three steps repeated: put something on screen, change it, pause.
Every change is an animation with a stated run time; every beat ends with a wait long
enough to take it in.

## What makes it read

Build up, do not show everything and then explain: an object appears when it is first
needed.
Keep an object the same object. Transform it into its next form in place of fading one out
and another in: continuity is what makes an explainer explain.
One focus at a time: the thing being talked about is highlighted, the rest dimmed, not
removed.
Position relative to other objects (next to, aligned to, arranged in a row or a grid), not
by absolute coordinates: the layout survives a change of content.
Few colours, each with a meaning held through the whole piece. Text large; a label
belongs next to what it names.
Stay inside the frame with a margin: check the widest and tallest moment of each scene.
Graphs and networks: laid out by an algorithm or by hand once, then held still; nodes that
jump between scenes lose the viewer.

## Render

```bash
manim -ql scenes.py LoadBalancer        # draft: low quality, fast
manim -qh scenes.py LoadBalancer        # final: high quality
```

`-s` renders only the last frame, the quickest check of a layout. `-n a,b` renders a
range of animations while working on one part. A vertical or square piece sets the frame
size and pixel size in the config, both, or the layout is cropped.

Join the scene files with `ffmpeg` concat, without re-encoding when they share settings.
Narration or music is laid over at the end; scene durations are set from the audio's
timings before the final render.

## Usual mistakes

Text or formulas overflowing the frame. Everything animated with the same duration. An
object added without being animated in, so it pops. Formulas rendered with LaTeX on a
machine that does not have it: use plain text objects or say what must be installed.
A scene that tries to hold the whole idea.
