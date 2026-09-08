---
name: atlas-skill
description: >
  Build a Claude Code skill from an idea, or fix one that never fires. Use whenever the user
  says "atlas skill", "/atlas-skill", "make me a skill", "turn this into a skill" — in any
  language — or describes a workflow they keep repeating — even when they do not use the word
  "skill". Also use when an existing skill exists but does not trigger.
---

Turn the idea into a skill that actually fires. Most skills fail at the description, not the body.

## First: is the answer already in this conversation?

If the user says "turn this into a skill", the workflow is usually right here — the tools used,
the order, the corrections they made along the way, the shape of the output. **Extract it from
the conversation and show it back for confirmation.** Asking from scratch what has already been
demonstrated costs a round and tells the user nothing was read.

Only ask about what the conversation does not answer.

## Then ask, one question at a time

Multiple choice where the options can be named, the tradeoff inside each option, always a way to
answer in their own words. Stop when the next answer would not change the skill.

1. **What should it let Claude do?** One sentence. If it needs an "and", it may be two skills
2. **When should it fire?** The actual phrases they would type. This decides the description,
   which is the only part loaded in every session
3. **What must it never do?** The boundary is usually more useful than the capability
4. **What does the output look like?** A file, a report, an edit, a decision
5. **Are test cases worth it?** Objectively checkable output — a transform, an extraction, a
   fixed sequence — yes. Subjective output like writing style, usually not. Suggest, let them pick

Match their vocabulary. "Assertion" and "eval" are jargon: use them only after the user has used
words that show they land.

## Write the description for triggering, not for brevity

Claude **undertriggers** skills — it fails to consult them when they would help. So the
description says what the skill does **and** the contexts that should invoke it, including the
ones where the user will not use the obvious word.

Weak: `Builds dashboards for internal data.`
Working: `Builds dashboards for internal data. Use whenever the user mentions dashboards, metrics,
charts, or wants company data displayed — even if they never say "dashboard".`

This costs tokens in every session, and it is still the right trade: a skill that never fires
costs its full price and returns nothing.

**How triggering really works, which changes what to write:** skills are consulted for tasks
Claude cannot easily do alone. A one-step request — "read this file" — will not trigger a skill
however well the description matches, because it gets handled directly. Write the description
around the substantial cases, not the trivial ones.

## Keep the body small by moving detail out

Three levels, loaded at different times:

| level | when it loads | keep it |
|---|---|---|
| name + description | **every session, always** | tight, and trigger-shaped |
| `SKILL.md` body | when the skill fires | under ~500 lines |
| `references/`, `scripts/`, `assets/` | only when read or run | as large as needed |

```
skill-name/
├── SKILL.md
├── references/   docs read on demand — point to them from SKILL.md and say when to read
├── scripts/      code that runs without being read into context
└── assets/       templates, icons, fonts used in the output
```

When a skill covers several variants, split by variant into `references/` and let only the
relevant one be read.

## Writing style

Imperative. **Say why a rule exists instead of shouting MUST** — a reason survives paraphrase,
an order does not. Write a draft, then read it again cold and cut what only restates the line
above it.

Never build a skill that misleads about what it does, exfiltrates data, or hides its behaviour
from the person installing it. A skill's contents must not surprise someone who read its
description.

## Before handing it over

- read the description back: are those really the words they would type?
- 2-3 realistic test prompts — the kind a real user would send, substantial enough to trigger a
  skill at all. Run them. A skill that has never fired once is a draft
- say what it costs: the description every session, the body only when it fires
- if an existing skill already covers this, say so instead of building a second one

What this writes leaves the conversation, so it is written normally at every level — the dials do
not reach it. Only the report back in chat follows the active level.
