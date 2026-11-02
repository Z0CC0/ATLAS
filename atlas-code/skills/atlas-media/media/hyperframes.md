# Video with HyperFrames — when it is installed, it owns the video

HyperFrames (heygen-com/hyperframes, Apache-2.0) is HTML plus one paused GSAP timeline,
rendered frame by frame by its own CLI. It ships its knowledge as skills: a router, the
composition contract, forty-odd motion rules, twenty scene blueprints, a transition
catalogue, typography and palette guidance, the CLI loop. None of that is summarised here:
it is read, from the installed copy, before the composition is written. This file is the
order to read it in and what the plugin adds on top.

## Found how

Any of: `~/.claude/skills/hyperframes*` (standalone skills), a `hyperframes` plugin in the
session's skill list, `npx hyperframes --version`. Found → this file. The composition is
written with HyperFrames even when the person does not name it; a video made by hand with
a canvas while HyperFrames was installed is the failure to avoid.

## Read, in this order, before writing

1. The router `hyperframes/SKILL.md`: which workflow owns the request (motion graphic,
   explainer, product video, music video, captions, slideshow, general video).
2. `hyperframes-core`: the contract. Root `data-composition-id`, `data-start`,
   `data-duration`, `data-width`, `data-height`, `data-fps`; one paused timeline on
   `window.__timelines`; `fromTo` with explicit from-states; nothing random, nothing
   timed by the clock. Its `references/full-screen-motion.md` for a shared background.
3. `hyperframes-animation/rules-index.md`: choose two to four rules per scene and open
   only those (`rules/<name>.md`). A blueprint (`blueprints-index.md`) only when a scene
   matches one. Then `transitions/overview.md` and `transitions/catalog.md`, and the one
   `css-*.md` file per transition type used.
4. `hyperframes-creative/references/typography.md`: the list of fonts the renderer
   embeds, the list of fonts that are banned, the pairing rules. A display face from the
   embedded list; never the default sans.
5. `hyperframes-cli/SKILL.md`: `init`, `check`, `render`, the quality rungs.

What the rules say is followed as written: one beat grid for a scene, distinct entrances
per element, arrivals with binary opacity, counters by proxy with `tabular-nums`, no
overshoot on data, a transition at every seam, no exit before a transition, exits only in
the last scene, text inside the title-safe box (the central 80%).

## Build

```
npx hyperframes init <name> --non-interactive --example blank --resolution portrait|landscape
npx hyperframes browser ensure
```

The project pins the CLI version in `package.json`; that pin is what renders, so the same
file renders the same later. Scenes are plain `div`s inside the root in a standalone
composition: the first visible, the others `opacity: 0`, revealed by the transition
tweens. Fonts the renderer embeds need no file; a font outside that list is downloaded
once, under its licence, into `assets/`, declared with `@font-face`, and credited.

The facts on screen come from a source the person can open; a film that states numbers
carries them with their origin in its `script.md`.

## Check, in this order

1. `npx hyperframes check` — lint, runtime, layout, motion, contrast. Zero errors before
   a render. Warnings read one by one: the static analyser attributes every tween inside a
   helper function to the first selector it meets and reports overlaps that do not exist;
   say which warnings are that, and fix the rest.
2. The legibility gate on the DOM, `media/tools/readcheck.mjs` beside this file, copied
   into the project: every text element carries `data-read`; the script seeks the
   composition's own timeline every 0.04 s and counts a text visible only while its box is
   inside the frame, its effective opacity is at least 0.95 and no ancestor is blurred;
   each run must hold `max(1.5, letters / 15 + 1.5)` seconds. Zero failures before a
   render; a failure is fixed by time or by fewer words, never by lowering the threshold.
3. `npx hyperframes render --quality draft`, then from the file: a contact sheet of one
   frame per scene, and a strip of twelve frames across every transition (`ffmpeg
   select='between(n,a,b)'` with `tile`). The strips are where the defects are: an
   incoming scene still empty when the whip lands, a line that wrapped, a nested span
   positioned by a selector meant for its parent. Each is fixed and the strip cut again.
4. `npx hyperframes render --quality delivery --output <name>.mp4`, once. Then `ffprobe`
   (size, rate, frames), `blackdetect` for black frames before the ending, and the sheet
   from the final file.

## Known traps

- `toLocaleString` has no locales in the headless shell: thousands separators are
  formatted by hand.
- A selector such as `.ln span` reaches a `span` nested for colour; use `.ln > span`.
- A whip or push that lands on a scene whose first element arrives 0.4 s later shows a
  black frame; the first element arrives within 0.15 s of the seam.
- Scenes pushed off-canvas trip the overflow check: `data-layout-allow-overflow` on the
  scene, after the stills confirm the push is what was wanted.
- Voice and music through HyperFrames (`tts`, `media-use`) go through its hosted service
  and an account; that is a generation service, named to the person, used only after a
  yes. Without it the piece is silent or takes the audio the person supplies.

## Report

The report of `method.md`, plus which HyperFrames rules each scene used, the `check`
verdict with the warnings explained, the gate's count, and which seams were looked at as
strips.
