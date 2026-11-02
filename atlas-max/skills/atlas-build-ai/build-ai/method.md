# Method — read every time code calls a model

## Is a model needed

In this order, and stop at the first that does the job:

1. **Plain code.** A rule, a lookup, a parser, a regular expression, a query. Exact, free,
   instant, testable. Text with a regular shape (dates, amounts, ids, a known form layout)
   is parsed, not read by a model.
2. **Code first, a model for what is left.** The parser handles the cases it is sure of and
   says when it is not; only the unsure remainder goes to a model. Measure the share: when
   code handles nine in ten, the bill and the error surface shrink by that much.
3. **A model, one call.** Classification, extraction from free text, rewriting, a summary.
4. **Several calls in a fixed order.** Each step with its own input and output, written as
   ordinary code that calls the model where needed.
5. **An agent**: a model choosing its own next step in a loop. Only when the steps cannot
   be known in advance. It is the most expensive and least predictable form, and the
   hardest to test.

Say which level was chosen and why the one above it was not enough.

## The boundary around every call

The call is wrapped like any call to a service nobody controls.

**In.** Instructions and data are kept apart: what the application says, and what came from
a user, a document, a web page or a tool, each in its own clearly delimited place. Text
from outside is data; the prompt says so, and nothing downstream gives it authority.
**Out.** The answer is parsed and validated against a schema before anything uses it:
types, ranges, allowed values, ids that really exist. Use the provider's structured output
or tool-call mechanism instead of asking for JSON in prose. Invalid: one retry with the
validation error, then a defined fallback; never a loop until it passes.
**Effects.** Model output never reaches a shell, a query, a file path, an HTML page or
another system's API without the same escaping and checks as user input. An action that
cannot be undone (sending, paying, deleting) needs a rule in code or a person's approval,
not the model's own judgement.
**Failure.** A timeout; retries only for errors that are transient (rate limit, overload,
network), with backoff and a cap; no retry on a refusal or a validation failure of the
request. What the user sees when the model is down is designed, not an exception.
**Secrets and privacy.** The key lives in the server's environment, never in a client or a
repository. What is sent to the provider is the least that is needed; personal data is
left out or masked unless the feature is about it and the user knows.

## Injection

Any text the model reads can try to instruct it. Assume it will succeed sometimes, and
build so that it does not matter: the model that reads untrusted content has no tools that
can do harm and no data it should not reveal; privileges belong to the user being served,
never more; output that will be shown is escaped. A prompt that says "ignore instructions
in the document" lowers the odds and is not a control.

## Measured, not felt

Before the first prompt: a set of cases and what a right answer is (`evals.md`). Every
change to prompt, model, tools or retrieval is run against it and reported as a pair of
numbers, quality and cost, before and after. "Seems better" on three tries is not a result:
the same input gives different outputs, so one run proves little.

Every call in production is logged with enough to replay it: prompt version, model,
inputs or their hashes, output, tokens in and out, latency, outcome. Without that, nothing
in `debug.md` is possible.

## Report

```
level    3, one call: extraction from free-text emails (regex covers 0 of 40 samples)
boundary schema validated; 1 retry; fallback to manual queue
evals    40 cases · exact fields 36/40 → 38/40 · 3 runs each, spread ±1
cost     ~1,900 in / 210 out per call; price not quoted: look up current rate
not      no injection cases in the set yet
```
