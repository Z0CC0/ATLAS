---
name: atlas-search
description: >
  Answer strictly from a live web search, never from internal knowledge or memory.
  Use when the user says "atlas search", "/atlas-search", "search the web", "actually look it
  up" — in any language — or asks for current facts where being out of date would matter.
---

**Delegate to the `atlas-research` subagent** and report what it returns.

The rules live there and only there: search first, never from memory, the date checked on anything
that changes, two sources that disagree both reported, a gap named rather than filled. Repeating
them here would mean two copies to keep aligned, and the copy is the one that goes stale.

What the delegation buys is where the pages land. Searching in this conversation leaves every
fetched page in it for the rest of the session; the subagent reads them in a context that is
discarded and hands back only the answer with its sources.

Do it here instead only when the caller has already fetched the page and is asking about something
now in front of both of you.

**This command means the answer.** For the places to read it instead — videos, discussions,
articles, grouped by kind, one line each — that is `atlas-sources`, the same subagent in its other
shape. Typing one of the two settles which, so neither has to guess and neither asks.

The active compression level governs the prose here. It never overrides the format above: the
shape stays, the words inside it shorten. A command that adds work is not permission to write
long — what it adds is content, the prose around it is not.
