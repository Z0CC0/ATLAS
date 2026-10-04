# Depth — one answer at a chosen size

For this answer only. The dials stay where they are; the next answer goes back to them.

## Four depths

| depth | said as | what is in it | what is left out |
|---|---|---|---|
| `line` | "tldr", "one line", "just the answer", "yes or no" | the answer, and the one condition that could make it wrong | reasons, examples, alternatives |
| `short` | "short version", "briefly", "in a few lines" | the answer, the reason, one example when it clarifies | alternatives, edge cases |
| `full` | "explain", "in detail", "walk me through" | the answer, the reasoning, the alternatives considered, the main edge cases | rare cases, history |
| `everything` | "exhaustive", "don't leave anything out", "the deep dive" | all of it, organised so it can be skimmed | nothing |

The user's words pick the depth. No depth named: the dials decide, as always, and no menu
is shown. A menu before every answer costs more than it saves.

## What never shrinks

At any depth: a warning about safety, security or data loss; a caveat that changes the
answer ("only on version 5 and later"); numbers, units, names, code and error strings,
exact. `line` drops explanation, not facts. If the honest answer does not fit the depth
asked for, give the depth asked for and one closing line saying what was left out, so the
user can ask for it.

A shorter depth is not a vaguer answer. "It depends" at `line` depth names the thing it
depends on.

## Short first, more on request

"The short version first" is the cheapest pattern: answer at `short`, and end with what a
longer answer would add, as a list of three or four named items, not an offer to
continue. The user asks for the one they want.

## "How long will the answer be"

Say it as a range and say how it was reached: a `short` answer is some tens to a couple of
hundred tokens, a `full` one several hundred to a few thousand, depending on the code in
it. These are orders of magnitude, not a measurement: no figure is given to the token, and
no percentage of accuracy is claimed. After the answer, its size can be counted for real
when a tokenizer is at hand.

## Asked to hold a depth

"Keep it short from now on" is the dials' job: say so in one line and point to
`atlas low` or `atlas high`, in place of quietly keeping a setting nothing records.
