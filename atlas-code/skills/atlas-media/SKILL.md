---
name: atlas-media
description: >
  Makes videos, slides and demos with tools that run on this machine and send nothing out:
  animated explainers in Manim, videos written in React with Remotion, HTML slide decks, a
  recorded walkthrough of a web app with Playwright, checks on a Blender scene by numbers,
  and the measured look of reference footage as a grade and a cut rhythm. Plans the piece
  first, renders small before rendering well. Use for "atlas media", "make an explainer
  video", "animate this concept", "build slides", "record a demo", "check this Blender
  animation", "match the look of this clip" — in any language.
---

Everything here is code that renders locally. No generation service, no upload, no API
key. A request that needs one (generated footage, a cloned voice, stock media) is said to
be outside this skill, in one line.

## What to read

Everything below lives in the `media/` folder beside this file.

1. `media/method.md`, always: the plan before the code, draft renders, where the long
   output goes, what is checked before saying it is done.
2. One file by what is being made:
   "explainer", "animate this concept", "diagram that moves", maths, an algorithm, a
   system → `explainer.md` (Manim)
   "video in React", "Remotion", captions, a product video from components and data →
   `react-video.md`
   "slides", "deck", "presentation", "convert this PowerPoint" → `slides.md`
   "demo", "walkthrough", "screen recording", "record the app" → `demo.md`
   "Blender", "rig", "walk cycle", "retarget", "feet sliding", "facing the wrong way" →
   `blender.md`
   "match the look", "grade like", "same style as this clip", "cut rhythm" → `look.md`

The tool must be installed: check with its version command first. Missing: say which and
how it is installed, and stop; nothing is installed without a yes.

## With the other skills

Renders and recordings run through the `atlas-runner` subagent when it exists: the log
stays out of the conversation and only the verdict and the output path come back. Looking
at a page before recording it: `atlas-browser`. Motion inside a product's interface is
`atlas-ui`, not this.

## Form

The active compression level governs what is said here. Words that appear on screen
(titles, captions, slide text) are written for the audience, in their language.
