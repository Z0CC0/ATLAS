# Triage — sorting a backlog

Triage decides, it does not do. The output is a table and a batch of proposed writes; none
is applied before a yes.

## Scope first

How many are open. More than thirty: take a slice and say which (the oldest, the newest,
one label, the ones with no label) rather than skimming them all badly. Titles and metadata
for the whole slice; bodies and threads only for the ones that need them to be placed.

## Issues — one line each

```
#412  bug      high   duplicate of #377            → close, link
#415  bug      high   reproduces on main            → keep, label
#418  question        answered in docs/setup.md     → answer, close
#420  feature  low    no reply from author in 40 d  → ask once
#423  bug      ?      no steps, no version          → ask for steps
```

Kind: `bug`, `feature`, `question`, `docs`. Weight: `high` when it loses data, breaks
security or stops a main flow; `low` when it is cosmetic; otherwise nothing is written.
A duplicate needs the number of the original, found by search, and the two read side by
side: same symptom is not always same cause.
A bug is "reproduces" only when it was reproduced here, by steps read first. Otherwise it
says what is missing.

## Pull requests — four outcomes

Read the diff, not the title. Checks and review state from the host.

`take`: self-contained, checks green, does what it says. Still goes through `atlas-review`
before any merge.
`redo`: a good idea in a form that cannot be merged (wrong base, mixed concerns, no tests,
too big). The idea is rebuilt in a new branch and the author is credited.
`close`: wrong direction, superseded, or unsafe. The reason is written for the author.
`park`: possibly useful, not now. One line saying what would bring it back.

Red checks are never `take`. When the thing really in the way is a decision nobody has
made, say that, instead of asking for more changes.

## Stale

Stale is silence where an answer was owed, not age. Use the project's own policy when it
has one (a stale workflow, a CONTRIBUTING rule). Without one, propose and let the user set
the numbers: a waiting-on-author issue with no reply gets one question; no reply to that
after a further stretch, it is closed with a note that it can be reopened. An issue waiting
on the maintainers is never stale: it is late.

Never closed for age alone: a confirmed bug, a security report, anything with a milestone.

## The batch

After the table, the writes it implies, grouped: labels, comments, closes. Each comment in
full. The user strikes what they disagree with; the rest is applied one command at a time,
and the count applied is reported against the count proposed.
