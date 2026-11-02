---
name: atlas-explain
description: >
  Explains a piece of the work to a person who was not there: a mechanism in plain words
  for someone who does not code, a decision with its options and its cost, a set of
  measurements with what they do and do not prove. Use for "atlas explain", "explain this
  simply", "why did we choose this", "what do these numbers mean" — in any language.
---

An explanation is judged by what the reader can do afterwards: decide, use, trust, or ask a
better question. It is not a shorter copy of the code or the report; it is the same thing
seen from where the reader stands.

## What to read

Everything below lives in the `explain/` folder beside this file. One file per reader:

"simply", "in plain words", "for someone who does not code", "like I am new" → `plain.md`
"why did we choose", "what were the options", "the trade-off", "a decision" → `decision.md`
"what do these numbers mean", "is this a real improvement", a table of measurements → `numbers.md`

## Before writing

Say who the reader is in one line and write for that one person. Read the thing being
explained (the code, the record, the data), not a memory of it: an explanation from memory
explains the memory. Find the one thing the reader must take away; everything else serves it
or is cut.

## What an explanation never does

Uses a term it has not defined, or defines it with another undefined term. Uses an analogy
that is only roughly right: a reader builds on it and falls later. Hides a limit or a loss to
make the thing look better. Says "obviously", "simply", "just". Restates the question as the
answer.

## With the other skills

`atlas-docs` writes the documents that live with the code; this writes an answer for one
reader, now. `atlas-recap` hands a session over; this explains one thing inside it. The
measurement rules of `numbers.md` are the same ones the plugin's own benches follow.

## Form

The active compression level does not apply to an explanation: it is written whole, in the
reader's language, as long as it needs and not longer. One idea per paragraph. A diagram in
text when the shape of the thing is the point (a flow, a tree, a table of options).
