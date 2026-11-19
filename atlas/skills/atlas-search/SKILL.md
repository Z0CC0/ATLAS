---
name: atlas-search
description: >
  Answer strictly from a live web search, never from internal knowledge or memory.
  Use when the user says "atlas search", "/atlas-search", "search the web", "actually look it
  up" — in any language — or asks for current facts where being out of date would matter.
  With "give me sources" in the request it returns where to read instead of the answer; "is
  there a free API / a skill / an MCP server for this" searches the public catalogues; "a
  report on", "research this in depth" runs several researchers and writes a report to disk.
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

**A catalogue question goes to the same subagent, in its catalogue mode.** "Is there a free API
for X", "what could host this for nothing", "is there already a skill / a plugin / an MCP server
that does this": first run the catalogue command here, where no web page is in context —
`node "${CLAUDE_PLUGIN_ROOT}/tools/catalog.mjs" <kind> "<two or three words>"` (`kind`: `skills`,
`mcp`, `plugins`, `extras` or `all`; at most eight lines per source; with `skills`,
`--owner <publisher>` when the person names one) — then delegate to
`atlas-research` with those lines and the absolute path of `search/catalog.md` beside this
file (`${CLAUDE_PLUGIN_ROOT}/skills/atlas-search/search/catalog.md`), the file that holds the
sources and the checks. The agent reads pages and runs nothing. It finds; the install command
comes back as text, for the person to run.

**A question about what people say goes to the same subagent too.** Opinions, experiences, complaints, whether others hit the same problem, or a social network or forum named in the request, in any language: first run `node "${CLAUDE_PLUGIN_ROOT}/tools/social.mjs" "<two or three words>"` here, then delegate to `atlas-research` with those lines and the absolute path of `search/social.md` beside this file (`${CLAUDE_PLUGIN_ROOT}/skills/atlas-search/search/social.md`). The answer always ends by saying what was read, what was seen only as a snippet and what was not looked at.

**This command means the answer, unless the request asks for sources.** "Give me sources", "where
can I read about this", "find me some videos", in any language: then it means the places to read —
videos, discussions, articles, grouped by kind, one line each — and no answer. Same subagent, its
other shape; the words in the request pick it, so nothing is guessed and nothing is asked.

**A report is the fourth shape, and only when asked for in those words.** "A report on", "research
this in depth", "compare these properly", "deep research", in any language. Then this skill
coordinates and reads no page: it splits the question into subtopics, starts one `atlas-research`
per subtopic in the same turn, saves what each returns under `research_notes/<name>/`, and has one
more `atlas-research` call write the report, saved under `reports/<name>.md`. The split, the shape
of the notes and of the report, and the one-round limit are in `search/report.md` beside this
file (`${CLAUDE_PLUGIN_ROOT}/skills/atlas-search/search/report.md`): read it whole first, and pass
its absolute path to every call. A report is as many sessions as it has researchers, plus one;
a question that could be answered in a few lines is not a report, whatever its size.

The active compression level governs the prose here. It never overrides the format above: the
shape stays, the words inside it shorten. A command that adds work is not permission to write
long — what it adds is content, the prose around it is not.
