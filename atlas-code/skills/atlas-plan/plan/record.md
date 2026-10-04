# Writing a decision down — when the request says record, ADR, decision log

A decision record is for the person who, in a year, asks "why is it like this" and finds
nobody who remembers. It is written once, at the time, and not edited afterwards: a decision
that changes gets a new record that names the one it replaces.

## Where

The project's existing place wins: `docs/adr/`, `docs/decisions/`, `adr/`. None: propose
`docs/adr/` and wait for a yes before creating it. Files numbered in order,
`0007-refunds-through-provider-api.md`; the number is never reused.

## What goes in

Written in whole sentences, for a reader outside this conversation.

**Title**: the decision as a statement, not a topic. "Refunds go through the provider's API",
not "Refund handling".
**Status and date**: proposed, accepted, replaced by NNNN.
**Context**: what was true when the decision was made: the constraint, the load, the
deadline, what hurt. Facts, with numbers where there are any. Not the story of the
discussion.
**Decision**: what will be done, in the active voice, one paragraph.
**Alternatives**: each one that was seriously considered, in two or three lines, with the
reason it lost. "Do nothing" included when it was an option.
**Consequences**: what becomes easier, what becomes harder, what is now owed. The bad ones
are written as plainly as the good ones; a record with only benefits will not be believed.
**Reopen when**: the condition that would make this the wrong call.

## What stays out

Implementation steps (that is the plan), the names of who argued what, anything that will be
false in a month. Half a page is the right length; a decision that needs three has not been
made yet.

## After writing

One line back to the user: the path and the title. The record is not summarised again in the
conversation.
