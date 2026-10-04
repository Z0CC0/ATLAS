# Evals — knowing whether it works, and whether a change helped

An eval is a set of inputs, a way to grade each output, and a number that comes out. It is
written before the prompt, as a test is written before the code.

## The cases

Start with twenty to fifty, from real inputs when there are any; invented ones are too
easy and too alike. Cover: the common case, in its real proportions; the hard cases; input
that is empty, huge, malformed, off-topic, in another language; attempts to instruct the
model from inside the data; the things that must never happen.
Every failure seen in production or in testing becomes a case, kept forever. That is the
regression set, and it only grows.
Cases live in the repository as data, with the expected result or the rubric beside each.

Keep a part aside that is never looked at while tuning. A prompt tuned on all the cases
has memorised them; the held-out part says whether it learned anything.

## Grading — cheapest that is valid

1. **Code.** Exact match, a field equals, a schema validates, a test suite passes, a
   forbidden string is absent, the cited source exists. Free, instant, the same every
   time. Use it wherever the right answer can be stated.
2. **A model as judge.** For what code cannot check: is the summary faithful, is the tone
   right. One criterion per judgement, a rubric with the levels described, a yes/no or a
   short scale, the reason asked before the verdict. The judge sees the input, the output
   and the rubric; never which variant produced it.
   A judge is itself a model feature: grade thirty outputs by hand, compare with the
   judge, and report the agreement. Below roughly nine in ten, fix the rubric before
   trusting any number it produces.
3. **A person.** For the first rounds, for calibrating the judge, and for anything where a
   mistake is costly. Blind to the variant.

Asking the model that wrote the output to rate itself is not grading.

## The numbers

Run each case more than once: outputs vary. Three runs at least; five when differences
are small.
Report the pass rate, and two views of repeated runs when reliability matters: passed at
least once in k tries (what the system can do) and passed every time in k tries (what a
user can rely on). They can be far apart, and the second is the one a product lives on.
Always with the count: "36 of 40", not "90%". With forty cases, one case is two and a half
points: a difference of one or two cases is noise unless it holds across repeated runs.
Run the unchanged version twice to see the noise before reading any improvement.
Beside quality, every time: tokens in and out, cost, latency at median and at the tail.

For agents: task completed (checked on the final state of the world, not on what the agent
said), steps, tool errors, total tokens.

## Comparing

Change one thing. Same cases, same judge, same day. A table:

```
variant        pass     every-time(3)  in/out tokens  p50 latency
baseline       33/40    29/40          1,850 / 240    2.1 s
shorter rules  36/40    34/40          1,420 / 235    1.9 s
+ 3 examples   36/40    30/40          2,300 / 250    2.4 s
noise (baseline twice): ±1 case
```

Rejected variants stay in the table. A variant that wins on average and newly fails a
must-never case has lost.

## In the pipeline

The regression set runs on every change to prompt, model version, tool or retrieval, like
tests. A model upgrade is a change: run everything before switching. Thresholds from the
project's own baseline, not from a round number.

## Tuning an agent's own setup

Hooks, skills, sub-agent definitions, routing rules, context limits, permissions: changes
to the harness are graded like changes to a prompt, and are easier to get wrong because
they apply to every task at once.

1. A set of real tasks with a checkable end state, and the setup's own tests. Run both
   first: that is the baseline, with tokens and time beside the pass counts.
2. Keep a copy of every file about to change.
3. One change. Run again. Worse on any must-pass task, or the setup's tests fail: put the
   copy back and write the variant down as rejected.
4. Report the table as above, with what the setup costs in every session (the tokens of
   descriptions and injected rules) before and after.

Only configuration is touched, never the product's code. A change that widens what the
agent may do without asking (permissions, a hook removed, a safety check relaxed) is shown
and waits for a yes, however good its numbers.

## Not evals

A demo that worked. A benchmark score from the provider's page. A judge nobody calibrated.
A set the prompt was tuned on. One run.
