# Prompts — writing instructions a model will follow

## Before changing a word

Have the failing cases in hand: the actual inputs and the actual outputs that were wrong.
A prompt edited without them is edited by guess. Read ten outputs in full before forming a
theory; the problem is often not the one reported.

## What a good prompt contains

Written as to a capable colleague who knows nothing about this project.

**The situation.** Who the output is for and what it will be used for. A model that knows
why a rule exists applies it to cases the rule did not foresee.
**The task**, stated once, plainly, early.
**What good looks like**: the qualities of a right answer, and the hard cases with what to
do in each: missing information, ambiguous input, input that is out of scope, when to say
"I do not know". Most bad outputs come from a case the prompt never mentioned.
**The material**, delimited and labelled, kept apart from the instructions. Long documents
before the question, not after.
**The output form**, exactly: fields, order, length, what to leave out. Enforced by a
schema where the provider supports it, described in words only for what a schema cannot
say.

Positive instructions over prohibitions: say what to do in place of what not to. Reasons
over emphasis: capitals and "IMPORTANT" make a model over-apply one rule and neglect the
others; a sentence of why does more.

## Examples

A few, varied, realistic, covering the hard cases and not only the easy one. Models copy
examples closely: three examples of the same shape produce that shape forever, including
its length and its quirks. Each one is labelled as an example. When outputs come out
uniform, look at the examples first.

## Room to think

For anything with steps of reasoning: let the model reason before the answer, in the
provider's own reasoning mode or in a field that comes before the final one in the output.
An answer asked first and justified after is a justified guess.

## Structure of a system prompt for a product

Role and situation; what it helps with and what it does not; how it speaks; the rules,
each with its reason; the tools and when to use each (details in `tools.md`); the output
form. Stable content first and identical between calls, so it can be cached; what changes
per request last.

## Edit like code

One change at a time, each run against the evals. The prompt lives in the repository, in
one place, versioned, with the version logged on every call. A fix for one failing case is
checked against all the others: prompts regress exactly like code.

When a rule keeps being added for each new failure, stop: the prompt is turning into a
list of patches. Step back to what the model is misunderstanding about the situation and
say that instead.

## What a prompt cannot do

Guarantee a format (validate), enforce a permission (check in code), keep a secret that is
in the context (do not put it there), or make a model reliable at arithmetic, counting or
exact lookup (give it a tool). When the request is one of these, say so and build the real
thing.

## Diagnosing a prompt someone else wrote

One line per finding: what the prompt says, what the model does with it, the change.
Contradictions between two rules; a rule with no reason; the task buried under context;
examples that all look alike; instructions and data mixed; an output form described twice
in two ways; emphasis doing the work of explanation.
