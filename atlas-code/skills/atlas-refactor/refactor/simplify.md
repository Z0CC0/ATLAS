# Simplify — less to hold in the head, same result

The measure: can someone who has never seen this function say what it does after one read.
Shorter is not the measure; a clever one-liner is a step backwards.

## Moves, cheapest first

**Names.** A name that says what the value is, in the project's vocabulary. A boolean reads
as a question. One concept, one word across the file.
**Guard clauses.** The cases that end early leave first; the main path runs down the left
margin without nesting.
**One job per function.** Extract a block when it has a name of its own and a clear input
and output; not when the only name available is "part two".
**Conditions.** A long condition gets a name. Nested ternaries become an `if` or a lookup
table. A flag argument that selects between two behaviours becomes two functions.
**Data over branches.** A chain of `if` on the same value becomes a map from value to
result, when the branches really are data.
**Flow.** Callback pyramids to the language's linear form; a loop that builds a list to the
language's own map or filter when the project uses them; a mutable accumulator to a returned
value.
**Remove indirection that pays for nothing.** A wrapper that only forwards; an interface
with one implementation and no test double; a helper used once whose name says less than
its body; a config option nobody sets.
**Leftovers.** Commented-out code, debug prints, a TODO for something already done.

## How far

Follow the style the file already has. A simplification that makes one function unlike its
forty neighbours is not one.
Stop when the next move is a matter of taste. Say so rather than making it.
Three moves on one function and it is still hard: the problem is the design, not the
wording. That is `atlas-plan`, not more moves.

## Not simplifications

Swapping one library or pattern for another. Rewriting in a newer syntax for its own sake.
Adding types or validation that change what input is accepted. Catching an error that used
to propagate, or letting one through that used to be caught. Reordering operations with side
effects. Changing a default. Each of these changes behaviour and is refused under this
heading, however small.

## Equal, and shown to be

Before moving a block, note what it reads and writes outside itself: globals, `this`,
closed-over variables, the order of awaits. The extracted function gets those as arguments
and returns; nothing is captured by accident. After the move, the tests from the baseline,
and for anything untested the argument for equivalence in one line under the move.
