# A page — slow to load, sluggish, bundle size, web vitals

## Measure

The three numbers a visitor feels: how long until the main content shows (LCP), how long an
interaction waits for a response (INP), how much the layout jumps (CLS). Plus bytes shipped
and the number of requests on first load. On a throttled profile, a mid-range phone on a
slow connection: a developer machine on fibre hides everything.
Lighthouse or the browser's performance panel, through `atlas-browser` when it exists; the
bundler's analyser for what is in the bundle. Three runs at least; page measurements are
noisy.

## Where it usually is, in the order worth checking

**Waiting in sequence for things that could be in parallel.** Requests that start only after
another finished: independent fetches awaited one by one; data fetched in a child after the
parent rendered; a font or script discovered late because nothing preloaded it. Start early,
await late.
**Shipping code the first screen does not use.** A whole library imported for one function;
barrel files that pull a package's every module; a heavy component (editor, chart, map)
loaded up front where a dynamic import on use would do; development-only code in the
production bundle; several versions of one dependency.
**The largest element arriving late.** The hero image not prioritised, not sized, in a
legacy format, or injected by script; render blocked by synchronous CSS or JS in the head.
**Work on the main thread during interaction.** A handler that does heavy synchronous work;
state updates that re-render a large tree; long lists rendered whole where a windowed list
would do; layout read and written alternately in a loop.
**Layout moving.** Images, ads, embeds without reserved dimensions; fonts swapping with
different metrics; content inserted above what the user is reading.
**The server's part.** Slow time to first byte is not a front-end problem: go to
`backend.md`.

## React and similar, when that is the stack

Re-renders that are not needed: state held higher than it has to be; a context value that
is a new object every render; an inline object or function passed to a memoised child.
Measure with the profiler before adding `memo`: memoisation that does not hit is cost.
Derived values computed in effects and stored in state: compute during render.
Server rendering available and not used for content that does not need the client.

## Variants worth a row

Each is one hypothesis: split this import; preload this resource; size this image; move this
fetch up; window this list. Not "apply best practices".

## Not worth chasing

A perfect score. A metric already in the good range. Micro-optimisations in code that runs
once. Anything under the noise of the measurement.
