# Reviewing a spec

A spec is reviewed the way code is: one problem per line, where, what goes wrong because of
it, the fix. Nothing about what is fine. The reader of the review is the author, who wants to
know what to change, not that the document is "generally good".

## What breaks a spec

A requirement two readers can read two ways: quote it, give both readings, ask which.
A "done looks like" statement with no acceptance, or with an acceptance that cannot fail
("the feature works as expected").
A constraint with no source: who said it, or where it is measured.
An "out" list that is empty on a feature that touches more than one screen or one data
store: name what a reader would assume is in and probably is not.
A technology named where a requirement was meant; a UI widget named where a behaviour was
meant.
A number missing where the person will feel it (how long, how many, how big) and present
where it was invented (a precise figure with no source).
Two sections that contradict each other: quote both.
An edge case missing that the behaviour makes inevitable: empty state, the second run,
interruption, the wrong input the person will certainly produce, offline when anything is
fetched, concurrency when two of the same can happen.

## What makes a spec fragile

Terms used with two meanings; a persona name instead of what the person does; "the user"
when there are two kinds of user; assumptions not marked as such; an open question with no
owner; a promise about time or effort; scope stated by naming screens instead of behaviours.

## Not findings

Formatting, section order when the content is there, length when every sentence carries a
requirement, the author's style.

## The verdict, one word

`BUILDABLE` — every "done" statement has a proof and no contradiction was found.
`QUESTIONS` — buildable once the listed questions are answered; name them.
`NOT YET` — the problem or the "done" statements are not stated; say which.

Then the list, most serious first. A question that the author can answer in one line is
asked in the review, not left as a finding.
