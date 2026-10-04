---
name: atlas-context
description: >
  Looks after the context window: measures what every session loads before the first word
  (skills, agents, MCP tools, rules, hook output) and says what to trim; says when to
  compact a long conversation and what to write down first so nothing is lost; gives one
  answer at a chosen depth without touching the dials; answers a side question mid-task
  and resumes. Use for "atlas context", "what is
  eating my context", "audit my setup", "should I compact", "the session feels slow", "short
  version", "tldr", "the exhaustive answer" — in any language.
---

The window is a budget that is spent whether or not anyone looks. Four ways to spend it
well.

## What to read

Everything below lives in the `context/` folder beside this file. One file per question:

"what is eating my context", "audit", "how much does my setup cost", "too many skills",
"which MCP servers are heavy" → `audit.md`
"should I compact", "long session", "running out of context", "it is getting slow",
"before I start the next thing" → `compact.md`
"short version", "tldr", "in two lines", "the full answer", "exhaustive", "how long will
the answer be" → `depth.md`
"by the way", "quick question", "aside", a question asked in the middle of a task →
`aside.md`

## One rule for the numbers

A number is measured or it is labelled an estimate, with how it was reached. No precision
that the method does not have: a count from a real tokenizer is a count; characters
divided by four is "about".

## With the dials

`low` and `high` set how every answer is written until changed. `depth.md` is for one
answer and leaves them alone. `silent` wins over everything here: with it on, the audit
table or the answer is given and nothing around it.

## Form

The active compression level governs the prose. It never overrides the table in
`audit.md` or the checklist in `compact.md`.
