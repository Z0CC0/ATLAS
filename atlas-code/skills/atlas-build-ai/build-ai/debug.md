# Debug — when a model feature or an agent gives wrong results

Retrying until it works is not a diagnosis. A failure that is not understood comes back.

## Capture before touching anything

The exact failing call, replayable: the full prompt as sent (not the template), the model
and its parameters, the tool definitions, every tool result, the output. From the logs of
`method.md`; if they do not exist, adding them is the first fix.
Then: does it fail again on replay. Run it five times.
Every time: a deterministic cause, usually in what was sent.
Sometimes: the instruction is ambiguous or the case is at the edge; count the rate, it is
the number to move.
Never again: suspect what differed in production: other context, a truncated history, a
different model version, a tool that returned something else.

## Read what the model actually saw

Print the final assembled input and read it top to bottom as if knowing nothing. Most
causes are visible here:

- the instruction is not there: a template variable was empty, a section was dropped by a
  length limit, the system prompt was replaced by a wrapper
- two instructions contradict: the product's prompt and one a framework added silently
- the answer is not in the context: retrieval missed, a tool returned an error or nothing,
  the document was cut
- old or wrong content is in it: stale memory, a previous turn's mistake carried forward,
  another user's data
- the context is so long the relevant part is buried
- untrusted text in the context is giving orders

## Walk the layers

From outside in, and stop at the first that is wrong:

1. **Transport and rendering.** Was the output right and then damaged: truncated by a
   token cap, broken by streaming assembly, mangled by markdown or JSON post-processing,
   cut by the interface.
2. **Wrapper.** Does the raw model, given the same task directly, do better than the
   product. If so, something the application adds is hurting: an over-long prompt, a
   framework's hidden instructions, a repair loop rewriting good output.
3. **Context.** What went in: retrieval, memory, history, tool results (the list above).
4. **Tools.** Wrong tool chosen, right tool with wrong arguments, a result the model could
   not interpret, an error that did not say how to recover (`tools.md`).
5. **Prompt.** The case was never covered, or covered ambiguously (`prompt.md`).
6. **Model.** Only after the others: the task is beyond this model, or its version
   changed. Check the version actually served.

For an agent, find the first step that went wrong, not the last. The visible failure at
step fifteen usually began with a bad result at step four that every later step trusted.

## Hidden repairs

Look for code that quietly fixes model output: retries until parse succeeds, a second
call that "cleans up", fallbacks that swallow errors. They hide the real failure rate and
multiply cost. Count how often each fires; a repair that fires on a third of calls is the
bug.

## Fix one thing

State the cause in one sentence, with the evidence. One change that addresses it. Replay
the failing case several times; then the whole regression set, because a fix for one case
breaks others. Add the case to the set.

```
symptom   refund agent issues duplicate refunds, 3 of 50 runs
first bad step 6: orders_refund returned a timeout; the refund had gone through
cause     the tool's error did not say whether the action happened; the agent retried
fix       tool takes an idempotency key and returns the existing refund on repeat
after     0 of 50 duplicates; regression set 61/61; case added
```

Not found: say what was ruled out, layer by layer, and what data is missing to go on.
