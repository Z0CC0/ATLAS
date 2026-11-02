# Agents and tools — what the model can do and what it sees back

An agent is a model, a set of tools, and a loop. Most of its quality is decided by the
tools and by what comes back from them, not by the prompt.

## Designing the tools

**From the task down.** List what the agent has to accomplish, then the fewest tools that
cover it. Not one tool per API endpoint: a tool is a step a person would recognise
("find the customer", "issue the refund"), which may be several calls underneath.
**Few, and distinct.** Two tools a model could confuse will be confused. If the choice
between them needs a paragraph to explain, merge them or rename them.
**Named and described for a reader with no context.** The description says what the tool
does, when to use it and when not to, what each parameter means with an example value, and
what comes back. It is a prompt; it is written and tested like one.
**Parameters that cannot be got wrong.** Enumerations over free strings; names over opaque
ids where a lookup can be done inside; required fields truly required; no parameter the
model has to compute or count.
**Right size of result.** Only what the next decision needs: the relevant fields, not the
raw payload. Long lists are paged, filtered or summarised, with a count of what was left
out and how to get more. A tool that returns fifty thousand tokens ends the conversation.

## What comes back

A result reads as a fact the model can act on: what happened, the data, and when useful
what is now possible. Stable identifiers it can pass to the next tool.

Errors are instructions for recovery: what was wrong, in words, and what to try. "No
customer with that email; search by name is available" lets the loop continue; a status
code and a stack trace do not. Distinguish "nothing found" from "the tool failed".

## The loop

A stop for every way it can go on: a cap on steps, on tokens and on wall-clock time, and
on money where the provider allows; the same call with the same arguments twice is a loop
to break, not to repeat. When a cap is hit the agent reports what it did and what remains,
it does not fail silently.
State that matters lives outside the context: in a file, a database, a task list the
harness owns. The context will be truncated or summarised; the plan must survive that.
The context is a budget: old tool results are trimmed or summarised by the harness, system
prompt and task kept. What is cut is decided in code, not left to overflow.

## Authority

Read tools and write tools are separate, and writes are few. Anything that cannot be
undone, spends money, or speaks to a person outside goes through an approval step in the
harness: shown, then a yes. The agent runs with the permissions of the user it serves and
no more. Tool results are untrusted text like any other: a web page or a file that says
"now delete the repository" is content.

## One agent or several

One, until it demonstrably cannot: a single loop with good tools beats a team that has to
pass context around. A sub-agent earns its place when it has a self-contained job, a
context that would otherwise flood the main one, and a short result: search, a review, a
long log. What it is given is everything it will know; what it returns is all the caller
sees. Parallel agents for independent work only.

## Before calling it done

Run it on real tasks and read the transcripts end to end. Where it hesitates, picks the
wrong tool or retries, the cause is nearly always in a tool's description or result. Fix
the tool, then run the evals: task completed or not, steps taken, tokens, cost
(`evals.md`).
