# Checking in a browser without paying for every look

"Check it, do not imagine it" has two ways to look. `atlas-browser` returns words and a
screenshot each step, into this conversation. A browser driven from the shell returns
file paths, and an image enters the context only when it is opened. For a loop of looks
(four widths, two colour schemes, before and after) the second is cheaper by an order of
magnitude; for one look, the subagent is simpler. Nothing is installed for this: the
project's own browser automation is used when it has one, the subagent otherwise.

## When the Playwright CLI is on the machine

`command -v playwright-cli` says. It keeps one browser session alive across calls (`-s=ui`),
prints a few lines per command, writes everything else under `.playwright-cli/` in the
project (add it to `.gitignore` once). Idea and commands from microsoft/playwright-cli
(Apache-2.0); the recipes are ours.

The loop of looks, no image in context until one is read:
```
playwright-cli -s=ui open http://localhost:5173
for s in "375 812" "768 1024" "1280 800" "1920 1080"; do set -- $s
  playwright-cli -s=ui resize $1 $2
  playwright-cli -s=ui screenshot --filename=vp-$1x$2.png
done
playwright-cli -s=ui set-color-scheme dark;  playwright-cli -s=ui screenshot --filename=dark.png
playwright-cli -s=ui set-reduced-motion reduce; playwright-cli -s=ui screenshot --filename=reduced.png
playwright-cli -s=ui set-forced-colors active; playwright-cli -s=ui screenshot --filename=forced.png
```
Then read only the screenshots that decide something (the narrow one, the dark one).

The gates that cost no image at all:
- `playwright-cli -s=ui console error` after each navigation: empty output is the pass.
- `playwright-cli -s=ui snapshot --depth=3`, then `find "Save"` or `find --regex "^Error"`:
  the label, the role, the element exist, or they do not.
- `playwright-cli -s=ui snapshot e21 --boxes`: bounding boxes, for overlap and off-screen.
- `playwright-cli -s=ui eval "el => getComputedStyle(el).color" e7`, `eval "el =>
  el.getBoundingClientRect().width" e7`: a token or a spacing checked as a number.
- `playwright-cli -s=ui screenshot e21 --filename=card.png`: one component, before and
  after, same crop.
- `open --device="iPhone 15"` for real phone metrics; `route "**/api/**"` and `state-load`
  so the page shows the same data every time.
- `tracing-start` … `tracing-stop` when something breaks in a flow: the trace holds DOM,
  screenshots, console and network per action, in `.playwright-cli/traces/`.

An Electron app has no URL to open: it needs `--remote-debugging-port` and `attach
--cdp=http://127.0.0.1:<port>`, and only when the project already runs that way.

## When it is not

`atlas-browser`, as `method.md` says: narrow and wide, light and dark, the console, then
the keyboard alone. Fewer looks, chosen: the one width where the layout changes, the one
scheme the project ships. No browser at all: `not looked at`, written in the report.

## What the two have in common

The look is compared with something: the reference image, the previous screenshot, the
token value. A screenshot read with no question in mind finds nothing. Two passes of fix
and look, then the report says what still differs; a third pass is a decision, not a
reflex.
