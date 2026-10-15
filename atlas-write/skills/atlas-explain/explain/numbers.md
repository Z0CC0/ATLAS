# What the numbers mean

A table of measurements says less than it looks. The explanation says exactly how much:
what was measured, against what, how many times, and what a difference has to be before it
means anything.

## Before the numbers

**What was measured**, in one sentence a reader can picture: "the tokens of the answer, as
the API counts them, with the thinking removed", not "performance".
**Against what**: the baseline, named. A number without a baseline is a count, not a result.
**How many times**: rounds, cases, machines. Once is an anecdote.
**On what**: the version of the thing, the model, the date. Numbers from different versions
do not sit in the same table without saying so.

## The numbers themselves

The median, not the mean, when one odd run exists (it always does). Beside it the band: the
worst and the best round, because that is where the real value will fall next time. A
difference smaller than the band is noise and is written as noise, whatever it looks like.
A percentage with its base ("34% of 4,193 tokens"); a ratio when the reader will compare
("1.5 times"). Units on every number. The unfavourable rows kept and named: a table that
only has wins was edited.

## What a result proves and does not

For each claim the reader might make from the table, say whether the measurement supports
it: "it compresses more — yes, on these twelve questions, in English, with this model";
"it is better for long sessions — not measured: every call here was one turn". The second
kind of line is the honest one and the one most often left out.

## The verdict

One line, cold, before the detail: what changed, by how much, with what confidence. If the
result is disappointing, the line says so in the same tone as a win. Then where the thing
loses, as a list, before where it wins.

## Reading someone else's numbers

The same questions, asked of the table: baseline, rounds, version, band. A table that
cannot answer them is reported as "a claim without its measurement", not repeated as a fact.
A vendor's comparison table is a claim by the vendor.
