---
name: atlas-docs
description: >
  Keeps a project's documentation true to its code: regenerates what can be derived from the
  source, finds what has gone stale, and writes only what the code supports. Angles by the
  request: "map", "architecture overview" (a short map of the codebase); "onboarding", "explain
  this repo" (a guide for someone new); "how does X work", "trace" (one feature followed end
  to end); "translate", "locale files", "i18n" (locale files in
  step with the source). Use for "atlas docs", "update the docs", "is the README still right",
  "document this" — in any language.
---

Documentation is a claim about the code. Each claim here either has a source it was read
from, or it is not written.

## What to read

Everything below lives in the `docs/` folder beside this file.

"update", "sync", "is it still right", "stale", nothing named → `docs/sync.md`
"map", "codemap", "architecture overview", "where is everything" → `docs/map.md`
"onboarding", "new to this repo", "explain this codebase", "how does this project work" →
`docs/onboard.md`
"how does X work", "trace", "walk me through", "follow this flow", one named feature →
`docs/trace.md`
"translate", "locale", "i18n", "missing translations" → `docs/locale.md`

## Rules that hold in every mode

Read before writing: the document as it is, and the source it describes. Edit the section
that is wrong; leave the rest as its author wrote it, wording and order included.
Never invent: a script with no description is documented by what it runs; an option whose
effect is not clear from the code is listed with `effect not determined`, not guessed.
One owner per fact: a value that appears in two documents is stated in one and linked from
the other.
Where things go: the project's existing documents and folders. A new top-level document is
proposed, with its path, and written after a yes.
Nothing personal, no secrets, no real hostnames or keys in examples: placeholders.

## Finding the code

The `atlas-finder` subagent for where things are, when it exists; positions come back, files
do not.

## Form

Documents are written for people who did not set any dial: whole sentences, ordinary prose,
in the language the document is already in. The compression level applies only to what is
said back in the conversation, which is one line per file changed: the path and what changed.
