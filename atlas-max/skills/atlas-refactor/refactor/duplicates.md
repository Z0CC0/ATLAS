# Duplicates — when to merge, when to leave two

## Is it the same thing

Two pieces of code that look alike are one thing only when they must change together. Ask:
if the rule changes for one caller, does it change for the other, for the same reason. Yes:
duplication, merge. No: two rules that happen to share a shape today; merging ties together
things that will be pulled apart later, at a higher price than the copy.

Signs it is real: the same bug was fixed in both, at different times (`git log -L` on each);
the same constant or the same business term appears in both; a comment says "keep in sync
with".
Signs it is coincidence: different owners or layers; the same lines over different concepts
(a price and a weight both rounded to two places); test setup that reads alike.

Two copies are noted. Three are merged. Two are merged when one has already drifted and the
drift is a bug.

## Find

The project's own detector when it has one. Else: `npx jscpd <dir>` for most languages, or
search for a distinctive line of the suspected block. Types and schemas declared twice are
found by name. Output to a file; only the candidates come back.

## Merge

1. Put the copies side by side and list every difference, including the ones that look
   accidental: a different default, a missing null check, another order. Each one is either
   a parameter, a bug in one copy, or the reason not to merge.
2. A difference that looks like a bug is not fixed silently: it goes under `noticed`, and
   the merged version keeps each caller's present behaviour unless the user says which is
   right.
3. Write the shared version beside the most general copy, in the place the project keeps
   shared code of that layer. Not a new `utils` file.
4. Move one caller, run. Then the next. The old copies go when their last caller is gone.

## The merged thing must be simpler than the copies

More than two parameters to cover the differences, or a flag that switches behaviour
inside: the copies were not one thing. Undo, leave them, say why.
A shared function whose callers each use a different half: split it back.
Across package or service boundaries: sharing code creates a dependency and a release
order. Usually the copy is cheaper; name the cost and ask.

## Types and constants

One declaration, imported. A type derived from the source of truth (the schema, the API
definition) instead of written again by hand. A literal that appears in several places with
one meaning gets one name; the same number with two meanings gets two.
