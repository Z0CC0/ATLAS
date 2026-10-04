---
name: atlas-ui
description: >
  Builds and repairs interfaces so they look intended and work for everyone: a design
  direction, the small details that make a screen feel finished, accessibility to WCAG 2.2
  AA, motion, design tokens, and turning a screenshot or mock-up into components of the
  project's own kind. Starts from what the project already has and checks the result in a
  browser when there is one. Use for "atlas ui", "make this look better", "it feels off",
  "accessibility", "a11y audit", "animate this", "design tokens", "build this from the
  screenshot" — in any language.
---

An interface is judged in the first second and used for years. Both count: what it looks
like, and whether a keyboard, a screen reader and a small phone can use it.

## What to read

Everything below lives in the `ui/` folder beside this file.

1. `ui/method.md`, always: what to read in the project first, the states every component
   has, how the result is checked, the report.
2. By the words of the request, one file or more:
   "direction", "redesign", "landing page", "looks generic", a new screen from nothing →
   `direction.md`
   "polish", "feels off", "cramped", "flat", "unfinished", "make it nicer" → `polish.md`
   "accessibility", "a11y", "WCAG", "screen reader", "keyboard", "contrast" → `a11y.md`
   "animate", "transition", "motion", "feels jumpy" → `motion.md`
   "tokens", "design system", "theme", "dark mode", "inconsistent colours" → `tokens.md`
   a screenshot, a mock-up, a design export, "build this" → `from-image.md`
   Nothing named, a component to build: `method.md` and `polish.md`.

Every new or changed component is held to the "always" section of `a11y.md`, asked or not.

## With the other skills

Looking at the result: the `atlas-browser` subagent, which reports in words and keeps the
screenshots out of this conversation. Component code is reviewed by `atlas-review` with its
framework file. Speed of the page is `atlas-perf`. A demo video is the media piece, not
this one.

## Form

The active compression level governs the prose. It never overrides the audit line format
in `a11y.md` or the report in `method.md`. Text that appears in the interface is written
for its users, in the product's language and voice.
