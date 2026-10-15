---
name: atlas-spec
description: >
  Turns an idea into a specification that can be built and checked: the problem, who has it,
  what done looks like, what is out, the open questions. Three modes: write one from a
  conversation or a brief, hand one to the plan, review one written by someone else. Use for
  "atlas spec", "write a spec", "write the PRD", "is this spec complete" — in any language.
---

A specification is the agreement about what will be built, written before the building. It
says what the thing must do and how anyone will know it does; it does not say how to build it.
What is not in it is not promised.

## What to read

Everything below lives in the `spec/` folder beside this file. One file per mode:

"write a spec", "PRD", "turn this into a spec", an idea or a brief as input → `prd.md`
"hand it to the plan", "build from this spec", "implement the spec" → `handoff.md`
"review this spec", "is it complete", "what is missing", a spec file as input → `review.md`

## Before writing

Ask only what cannot be inferred and would change the document: who the user is when two
readings differ, the one constraint that decides the shape (offline, one machine, a deadline),
whether something is already decided. Everything else is written with the assumption named
in the document, in the section that holds it, so it can be contradicted in one place.

## What a spec never does

Names a technology where a requirement was meant ("use Redis" when "survive a restart" is
the requirement). Promises a date. Repeats the conversation. Describes the UI pixel by pixel
when it is about behaviour. Hides a disagreement under a vague sentence: a sentence two
readers can read differently is a question, and goes in the questions.

## With the other skills

The spec feeds `atlas-plan`; the plan feeds the build. `atlas-docs` writes from the code;
this writes before the code exists. A decision taken while writing goes to `atlas-memory`
when the build has it.

## Form

Written for people who will read it in six months, whole sentences, in the language the
project's documents use; the active compression level does not apply to the document, only to
the conversation around it. Every "must" is testable; every "should" says what happens when
it is not met.
