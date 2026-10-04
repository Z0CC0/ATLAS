---
name: atlas-build-ai
description: >
  For code that calls a language model: features built on an LLM API, agents with tools,
  retrieval over documents, MCP servers. Decides first whether a model is needed at all,
  writes the evals before the prompt, treats model output as untrusted input, and puts a
  number on quality and cost before and after every change. Use for "atlas build-ai", "add
  an AI feature", "write the system prompt", "build an agent", "design the tools", "RAG",
  "evals", "the agent keeps failing", "cut the LLM bill", "MCP server" — in any language.
---

A model call is a slow, paid, non-deterministic function whose output nobody has
validated. Everything here follows from taking that seriously.

## What to read

Everything below lives in the `build-ai/` folder beside this file.

1. `build-ai/method.md`, always: whether a model is needed, the boundary around a call,
   what must be measured, what is never taken from memory.
2. By the words of the request, one file or more:
   "prompt", "system prompt", "instructions", "it ignores what I say" → `prompt.md`
   "agent", "tools", "function calling", "loop", "harness" → `tools.md`
   "evals", "test the model", "is it better", "regression", "judge" → `evals.md`
   "RAG", "retrieval", "embeddings", "search my documents", "chunks" → `rag.md`
   "cost", "bill", "tokens", "cheaper", "caching", "which model" → `cost.md`
   "MCP", "MCP server", "connector" → `mcp.md`
   "scraper", "collect", "monitor this site", "daily digest", "track prices" → `collect.md`
   "keeps failing", "wrong answers", "got worse", "why does the agent" → `debug.md`

Any change to a prompt, a tool or a model: `evals.md` as well, whatever was asked.

## Never from memory

Model names, context sizes, prices, rate limits, SDK method names and parameters: they
change faster than anything else in software. Each one is read from the provider's current
documentation, or through the documentation tools of this session, before it is written
into code or quoted. A number that was not looked up is not given.

## With the other skills

The code around the model is ordinary code: `atlas-review`, `atlas-test`, `atlas-fix`
apply. Design choices with alternatives go through `atlas-plan`. Latency of a pipeline is
`atlas-perf`.

## Form

The active compression level governs what is said here. Prompts, tool descriptions and
eval rubrics are written for a model to read: whole sentences, uncompressed, in the
language the application works in.
