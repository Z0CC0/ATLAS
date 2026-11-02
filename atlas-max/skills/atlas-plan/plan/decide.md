# A decision with more than one good answer — when the request says X or Y, which, should we, council

For choices where reasonable people differ: one repository or several, ship now or polish, a
flag or a full rollout, build or buy. Not for facts (look them up), not for "is this code
right" (`atlas-review`), not for breaking work into steps (`method.md`).

## One question

Reduce it to a sentence: what is being decided, under which constraints, and what would count
as having chosen well. If it cannot be written, ask one question and stop.

## Own position first

Before hearing anyone: the answer you would give, the three reasons, and the main risk of it.
Written down. Otherwise the synthesis only mirrors the last voice read.

## Three voices, apart

Three subagents, each started fresh with the question, the constraints and only the context
the decision needs: never this conversation, never the position above, never each other's
answer. Each has one job:

the one who doubts the premise: is this the real question; what if we did less, or nothing;
which assumption, if false, changes everything;
the one who has to ship it: what gets users something soonest, what it does to operations
next month, what the team can actually maintain;
the one who looks for the failure: the input, the load, the day it goes wrong; what is hard to
undo.

Each answers in at most ten lines: a position, the reasons, what would change their mind.
No subagents available: write the three in turn, each without rereading the previous, and say
in the output that they were not independent.

## Verdict

```
question   one repository or one per service, for the three services we have
mine       one — shared types, one CI
doubt      one — but the question is premature: two of three services are unreleased
ship       one — a single pipeline to fix
failure    several — one broken test blocks three deploys
agree      shared types are the real need
split      blast radius of CI: 3 to 1
verdict    one repository, with per-service CI jobs so a red test blocks only its own deploy
           reverses in a day while there are three services; revisit at eight
```

Where the voices agree, where they split and by how much, the verdict, the cost of reversing
it, and the condition under which to reopen it. A position that changed after reading the
voices says so: "mine was X; the failure case moved it". A verdict never averages; it picks.

Asked for outside models as well: that is `atlas-multi`, which adds them as further voices
under the same rules.
