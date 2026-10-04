# Demo — recording a walkthrough of a web app with Playwright

A script drives the real app in a real browser while Playwright records the page. Three
passes, in order; skipping the second is why recordings fail halfway.

## 1. Discover

Open the app and read the pages in the flow before writing a step: what the fields are
really called, which elements are custom widgets and not native controls, what loads late,
what appears only after an action. Selectors come from what is there (role and name, a
label, a test id), not from what such a page usually has.
The flow written as a short list of beats: what the viewer sees, what happens, what to
notice.

Data: a demo account and seeded, invented data. Never a real customer's records, real
names or a live secret on screen; check every page in the flow for them. Credentials come
from the project's seed or environment, are not typed into the script as literals, and
the login step is left out of the recording when it shows nothing.

## 2. Rehearse

The same script, without recording, quickly. Every step is checked: the element was
found, the action had its effect, the next state appeared. A step that fails here is fixed
here. Nothing is recorded until a full rehearsal passes twice in a row.

Waiting is for a state, never for a time: wait for the element, the response, the text.
Fixed pauses are for the viewer only, added in the next pass.

## 3. Record

A new browser context with video recording on and an explicit viewport and video size that
match (for example 1280×720). The file is written when the context closes: always close
it, also on failure.

Paced for a person watching:
a cursor that can be seen: the recording does not show the system pointer, so the script
injects a small overlay element that follows mouse moves, and moves the mouse to a target
in steps before clicking;
typing with a per-key delay, so text appears and is not pasted;
a pause after each meaningful change, long enough to read what appeared (a second or two),
and none where nothing new is shown;
scrolling smoothly to bring the next thing into view before acting on it;
one flow per recording, one to two minutes; longer is several recordings.

The page is clean before the first frame: fonts and data loaded, no cookie banner, no
development overlay, a neutral window size, no notifications.

## After

The recording is WebM. Convert, trim the first and last moments and, if wanted, add
captions with `ffmpeg`. Check it by the steps in `method.md`: stills from each beat,
nothing private in frame.

```
made     out/onboarding-demo.mp4  1280×720 · 1:12
flow     sign up → create project → invite a member → first report
data     seeded demo account; no real records on screen (5 pages checked)
rehearsed 2 clean passes before recording
not      no captions; not checked at mobile size
```

## Usual mistakes

Selectors guessed and never tried. A fixed sleep where a wait was needed, so the recording
is slow on a fast day and broken on a slow one. Clicks that land before the viewer has
found the button. Recording at one size and declaring another, which letterboxes. Real
data in a table in the background.
