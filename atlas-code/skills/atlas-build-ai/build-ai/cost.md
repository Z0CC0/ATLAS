# Cost — spending less on model calls without losing quality

Prices, model names and limits are looked up in the provider's current documentation every
time; none is written here on purpose, and none is quoted from memory.

## Measure first

From the logs, or by adding them: per feature and per call, tokens in, tokens out, cached
tokens, calls per user action, retries. Then the bill is a table:

```
feature          calls/day  in/call  out/call  share of spend
ticket summary   12,000     6,400    180       61%
reply draft      3,100      2,900    520       27%
classifier       40,000     310      4         12%
```

Work on the top row. Output tokens usually cost several times what input tokens do, and
the split says which lever matters.

## Levers, roughly in order of return

**Do not call.** The cheapest call is the one not made: code for the regular cases
(`method.md`, levels 1 and 2); the same input answered from a store keyed on a hash of
model, prompt version and input; a debounce on calls fired by typing.
**Cache the stable prefix.** Providers bill repeated identical prompt prefixes at a
fraction. System prompt, tool definitions, long documents and examples go first and stay
byte-identical; what varies goes last. One changed character near the top (a timestamp, a
user name, reordered tools) empties the cache. Confirm from the usage fields of the
response that cached tokens are being read; do not assume.
**Send less.** The prompt trimmed of what no eval misses; retrieval that returns the few
passages needed; conversation history summarised or windowed; tool results cut to the
fields used.
**Ask for less.** A length stated and capped; a structured answer in place of prose; no
restating of the question; reasoning effort set to what the task needs.
**A smaller model where it is enough.** Route by task: classification, extraction and
routing rarely need the largest model; hard reasoning and long agentic work do. "Enough"
is shown by the evals for that task, not assumed. A cheap model that needs a retry or an
escalation half the time is not cheap: count the whole path.
**Batch what can wait.** Work with no user waiting (nightly jobs, backfills, evals) goes
through the provider's batch interface at its reduced rate.
**Fewer round trips.** An agent that takes thirty steps where eight would do pays the
whole context thirty times. Better tools (`tools.md`) cut steps; parallel tool calls cut
turns.

## Guard rails

A budget per user, per feature and per day, enforced in code before the call, with what
happens when it is reached decided in advance. A maximum on output tokens on every call.
Retries capped and only for transient errors: a retry loop on a deterministic failure is
the classic runaway bill. An alert on spend moving away from its usual line.

## Every saving is a quality change until shown otherwise

Each lever is one variant in the eval table of `evals.md`: quality before and after beside
tokens before and after. Report both.

```
change                         pass    in/out per call   est. share saved
baseline                       36/40   6,400 / 180
prefix cached                  36/40   6,400 (5,900 cached) / 180    most of input cost
history windowed to 6 turns    35/40   3,100 / 180                   rejected: 1 must-pass lost
small model for classifier     39/40 → 39/40                         kept
```

Savings are stated in tokens, which were measured. Money is given only after the current
price has been looked up, with the date and the source.
