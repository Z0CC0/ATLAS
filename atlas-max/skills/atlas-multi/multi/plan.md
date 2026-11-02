# An approach from outside — before building something with real alternatives

For work where the first idea is rarely the best: a new module, a migration, an interface
others will depend on. Not for work whose shape is obvious.

## Ground first, here

The outside voices cannot read the repository, and they are not handed it. So the grounding
is done in this session, by `atlas-plan`'s method: the goal in one sentence, the constraints,
how the code around it already does this kind of thing, with two or three short excerpts that
show the conventions. That, and nothing more, is the packet.

Write this session's own approach before sending, and keep it aside.

## Ask

Each voice is asked for an approach, not a plan with file names: the structure it would
choose, the two or three decisions that matter and which way it goes on each, what it would
build first, the main risk, and what it would deliberately not do. At most twenty lines.
A voice may include a short sketch of an interface or a schema; it is read as a proposal.

When the work splits naturally, two questions can go out: one about the data and logic, one
about the interface and interaction. Each to every voice; not one question per vendor, which
would hide where they differ.

## Combine

Lay the approaches side by side on the decisions that matter, one line each. Where they
agree, that is probably the unforced choice. Where they differ, that is the real decision:
state it, pick, and say why, with the cost of reversing it. An idea taken from a voice is
credited to it; an idea rejected is one line with the reason.

Then the plan itself, in `atlas-plan`'s format, written here against the real files. → the
gate: nothing is built until the user says yes.

## Report, before the plan

```
approaches   refund service
             mine     service + repository, provider behind an interface
             codex    same, plus an outbox table for provider calls        other vendor
             gemini   event-sourced refunds                                other vendor
decisions    provider calls     inline (mine) · outbox (codex) · events (gemini)   → outbox: retries survive a crash
             storage            one table (mine, codex) · event log (gemini)       → one table: nothing else here is event-sourced
taken        outbox, from codex
left         event log — a second persistence model for one feature
```

## Building with them

Asked to let another model write part of it: it is asked for a unified diff against the
excerpts it was given, as text. The diff is read here like a pull request from a stranger,
by `atlas-review`'s method, then written into the files by this session, changed where it
does not fit. It is never piped into `git apply`.
