---
name: atlas-review
description: >
  What is wrong with the current diff, one problem per line: where, what breaks, the fix.
  Nothing about what is fine. Use when the user says "atlas review", "/atlas-review",
  "review my diff", "check this code" — in any language — or asks whether the
  current changes are safe to commit.
---

Read the current diff. Each problem is one line:

`<file>:<line>  <tier>  <what breaks, and on what input>. <the fix>.`

Tiers: `breaks` (wrong result or crash on an input that will occur), `fragile` (right on the
inputs seen, wrong on a plausible one), `unclear` (right, but the next reader will misread it),
`ask` (cannot be judged without something only the author knows). Ordered by tier.

A finding names a failure. "Could be cleaner" is not one. Whitespace, naming and style count
only when they change what the code does. Code outside the diff gets one line at the end
marked `outside`, and no fix. Nothing wrong: `nothing found`, and stop.

The active compression level governs the prose here. It never overrides the format above: the
shape stays, the words inside it shorten. A command that adds work is not permission to write
long — what it adds is content, the prose around it is not.
