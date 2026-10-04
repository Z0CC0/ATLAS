# Video in React — Remotion

For pieces built from components, data and existing media: product videos, captioned
clips, charts that animate, many variants from one template. A Remotion project is a React
project; rendering needs Node, a headless browser it downloads, and `ffmpeg`.

Two things to check first. The version in `package.json`, and its documentation for the
components and functions used: the API has moved. And the licence: Remotion is free for
individuals and small teams and needs a paid company licence above a size its terms state;
say so once when the project looks commercial.

## The one rule

Everything on screen is a function of the current frame. A frame may be rendered alone,
out of order, on another machine, and must come out the same.

So: animation is computed from the frame hook with the library's interpolation and spring
functions. Never CSS transitions or keyframes, never timers, never anything that advances
in real time, never randomness without a fixed seed, never the current date.
Data is loaded before rendering (through the composition's metadata step or props), not
fetched while frames render.

## Structure

A root file registers compositions: id, size, frame rate, duration in frames, default
props. Durations are derived (`seconds * fps`, the length of the audio, the number of
captions), not typed as bare frame counts.
Scenes are components placed in sequences, each seeing its own frame count from zero;
series and transition helpers put them one after another.
Props typed with a schema, so one composition renders many variants from data.
Timings, colours and type in one module.

## Media

Files in the public folder, referenced through the library's static-file helper. Its own
components for video, audio and images, so frames wait for media to be ready; never plain
HTML media tags.
Fonts loaded through its font loading, so text does not reflow mid-render.
Captions from a subtitle file or a transcript with timings, shown by frame; long lines
split, kept inside a safe area.
Anything measured from the DOM (text that must fit) is measured before it is animated.

## Motion

Interpolation clamped at both ends unless overshoot is wanted. Springs for things that
arrive; eased interpolation for things that travel; a few frames of offset between
elements in place of everything moving at once.
What `atlas-ui`'s motion file says about restraint holds here, with longer durations: a
video is watched, not operated.

## Render

The studio (`npx remotion studio`) to scrub and check; a still of one frame to check a
layout; then:

```bash
npx remotion render <composition-id> out/video.mp4
```

Draft with a lower scale or a frame range; final at full size. Props for a variant are
passed as JSON. Concurrency lowered if the machine runs out of memory.

## Usual mistakes

A CSS animation that looks fine in the studio and stutters in the render. `Math.random`
giving a different frame each time. A duration that no longer matches the audio. Media
fetched from a URL that will not be there tomorrow.
