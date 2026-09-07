# ATLAS

**Four dials for how a coding assistant talks to you, and ten subagents that keep the noisy work out of your conversation. A Claude Code plugin.**

Most of what an assistant writes is packaging: greetings, restatements, hedges, a summary of what it just said, an offer of what to do next. ATLAS removes the packaging and keeps every fact, and it does so on turn fifty as reliably as on turn one, because the rules are re-stated to the model on every message instead of once at the start.

It ships off. Nothing changes until you type `atlas low` or `atlas high`.

## What it does

**Compression** — `atlas low` drops filler, pleasantries, hedging, articles and the copula. `atlas high` halves the words: every fact stays, every explanation goes. Code, error strings, paths, numbers, negations and proper names are never touched at either level. Anything written for other people — commits, docs, pull requests, memory files — is written in ordinary prose whatever the dial says.

**Rigour** — `atlas ask` makes it clarify the goal before building: one question at a time, multiple choice where the options can be named, on every request and not only the first. Bounded tasks — a typo, a rename — are just done.

**Check** — `atlas check` works against invented facts: nothing from memory, primary sources first, its own work verified before it is called done, a second option looked for before recommending the first, a correction verified before it is accepted. "I did not find it" is never written as "it does not exist".

**Silent** — `atlas silent` hands over the result and stops: no narration between tool calls, no closing summary, no offer of what to do next. Three things are still said, one line each: an irreversible action before it happens, a task that cannot run as written, a result that is wrong.

All four persist across turns, restarts and projects until changed, and move independently: `atlas ask off` leaves the other three where they were.

**Ten subagents** do the expensive reading somewhere else and hand back only the answer: `atlas-finder` (where is X), `atlas-editor` (a bounded edit), `atlas-diff` (what is wrong with this diff), `atlas-runner` (run the tests, return the verdict), `atlas-browser` (does the page work, without a screenshot in your context), `atlas-research` (an answer with sources, or a reading list), `atlas-catalog` (is there a free API for this), `atlas-data` (a question about a file too big to read), `atlas-history` (why is this line here), `atlas-scribe` (write a long file, return a receipt).

**Thirteen commands**, among them `atlas-recap` (a handover file so a new chat can continue where this one stopped), `atlas-optimize` (reads your own transcripts and says which dials pay for themselves), `atlas-organize` (tidies a folder with a plan first and an undo after; nothing is ever deleted), `atlas-init` (writes the same answering rule into Cursor, Windsurf, Cline and Copilot config files).

## Commands

| command | what it does |
|---|---|
| `/atlas:atlas` | set the dials |
| `/atlas:atlas-help` | the reference card |
| `/atlas:atlas-recap` | write a handover file for the conversation |
| `/atlas:atlas-optimize` | read your own sessions and say which dials suit you |
| `/atlas:atlas-search` | answer only from a web search |
| `/atlas:atlas-sources` | where to read about a topic, instead of an answer |
| `/atlas:atlas-review` | review the current diff |
| `/atlas:atlas-commit` | commit message for the staged changes |
| `/atlas:atlas-compress` | shorten a markdown file |
| `/atlas:atlas-skill` | build a Claude Code skill |
| `/atlas:atlas-init` | write the rule into other agents' config files |
| `/atlas:atlas-organize` | tidy a local folder, with an undo |
| `/atlas:atlas-silent` | do it and hand over the result, nothing else |

## Install

```bash
/plugin marketplace add <this-repo>
/plugin install atlas
```

No dependencies, no build step, no telemetry.

## It ships off

A fresh install changes nothing. The first session prints one line saying it is there and how to
switch it on; after that it does nothing until you do.

```
atlas low      shorter answers
atlas high     half the words
atlas status   what is on
atlas off      back to nothing
```

**The setting is global and it persists** — across turns, across restarts, in every project, until
you change it. It is not a per-conversation mode: switch it on once and every new chat starts
there. `atlas off` persists the same way.

**Uninstalling does not reset it.** The dial state lives in `~/.claude/.atlas-state`, outside the
plugin, so removing and reinstalling brings back whatever was set before. Type `atlas off` before
uninstalling, or delete that file — it is one line and nothing else depends on it.

## Three builds

| build | what is in it | fixed cost per session at `low` |
|---|---|---|
| `atlas` | everything | 4,796 tokens |
| `atlas-solo` | same rules, no subagents | 3,435 tokens |
| `atlas-min` | compression only: two levels, one command | 1,991 tokens |

`atlas` and `atlas-solo` carry byte-identical rules. The difference is whether the subagents exist, and whether their work stays out of your context.

## Measured

Every number below is measured, not estimated, and the unfavourable ones are printed with the rest.

**Compression.** 24 English and 24 Italian questions, each carrying its own sheet of facts so that every setup answers with the same information and only the form can change. Each question was answered 2 times per setup in a fresh session through the real hooks; tokens are the API's own count of the visible answer, thinking excluded. "Details lost" is how many of the sheet's facts a reader can no longer learn from the answer, first by string match, then re-judged one by one by a model that is told nothing about what is being measured — the median across rounds, minus what the no-plugin answer already lost.

English:

| setup | output vs no plugin, median | worst … best | details lost |
|---|---|---|---|
| `low` | -51% | -51% … -51% | 4 of 263 |
| `high` | -54% | -54% … -54% | 4 of 255 |
| `low` + `ask` | -51% | -50% … -52% | 3 of 263 |
| `low` + `check` | -47% | -44% … -50% | 1 of 263 |
| `low` + `ask` + `check` | -43% | -40% … -46% | 2 of 263 |
| `high` + `ask` | -55% | -54% … -56% | 3 of 263 |
| `high` + `check` | -53% | -53% … -54% | 5 of 263 |
| `high` + `ask` + `check` | -53% | -53% … -53% | 1 of 263 |
| `atlas-min` at `low` | -51% | -50% … -52% | 1 of 263 |
| `atlas-min` at `high` | -55% | -54% … -55% | 3 of 255 |

Italian:

| setup | output vs no plugin, median | worst … best | details lost |
|---|---|---|---|
| `low` | -47% | -46% … -48% | 1 of 264 |
| `high` | -47% | -46% … -49% | 4 of 264 |
| `low` + `ask` | -44% | -41% … -46% | 1 of 264 |
| `low` + `check` | -41% | -41% … -41% | 1 of 264 |
| `low` + `ask` + `check` | -42% | -40% … -44% | 2 of 264 |
| `high` + `ask` | -48% | -48% … -49% | 5 of 264 |
| `high` + `check` | -50% | -50% … -50% | 4 of 264 |
| `high` + `ask` + `check` | -47% | -44% … -49% | 7 of 264 |
| `atlas-min` at `low` | -49% | -49% … -50% | 1 of 264 |
| `atlas-min` at `high` | -52% | -52% … -52% | 5 of 264 |

Run-to-run noise with no plugin and the rules frozen: 0.4 points in English, 4.1 in Italian. A gap smaller than that between two setups is not an effect.

**What a session costs against no plugin**, by build and setup: the fixed cost paid once, then per turn the reminder plus an answer shortened by that setup's own measured saving (mean of the two languages); a 500-token answer with no plugin; 40 turns and 295 turns, the average of the real transcripts this was tuned on. Negative is cheaper.

`atlas`

| setup | 40 turns | 295 turns |
|---|---|---|
| `low` | -17% | -38% |
| `high` | -16% | -38% |
| `low` + `ask` | -12% | -34% |
| `low` + `check` | -6% | -30% |
| `low` + `ask` + `check` | -1% | -27% |
| `high` + `ask` | -14% | -37% |
| `high` + `check` | -11% | -36% |
| `high` + `ask` + `check` | -6% | -33% |

`atlas-solo`

| setup | 40 turns | 295 turns |
|---|---|---|
| `low` | -24% | -39% |
| `high` | -23% | -39% |
| `low` + `ask` | -19% | -35% |
| `low` + `check` | -12% | -31% |
| `low` + `ask` + `check` | -8% | -28% |
| `high` + `ask` | -21% | -38% |
| `high` + `check` | -17% | -37% |
| `high` + `ask` + `check` | -13% | -34% |

`atlas-min`

| setup | 40 turns | 295 turns |
|---|---|---|
| `low` | -32% | -41% |
| `high` | -33% | -42% |

**Fixed cost per session**, `atlas` build: 2,165 tokens of rules at `low`, 2,357 at `high`, plus 2,631 of skill, command and subagent descriptions that are loaded whether or not they are used. The per-turn reminder is 42–47 tokens; over a long session it is the largest number of all.

| | tokens per session |
|---|---|
| rules injected at `low` (default) | 2,165 |
| rules injected at `high` | 2,357 |
| skill, command and subagent descriptions, always present | 2,631 |
| per-turn reminder | 42-47 |
| **total at the default** | **4,796** |

The `atlas-min` build cuts the descriptions to 153 and the rules to 1,838 by shipping only
the compression sections. `atlas-solo` keeps every rule and drops the ten subagents: 1,270 in
descriptions instead of 2,631. It also drops `atlas-search` and `atlas-sources`, which are
handles on a subagent it does not carry — the search discipline itself lives in the `check`
dial, where it covers every answer rather than one command.

**On a long session the per-turn reminder outweighs everything above it.** At 42 tokens a
turn, over a 295-turn session — the average measured on real transcripts — that is 12,390
tokens, more than twice the rest put together.

Token counts for the fixed costs are tiktoken (`o200k_base`), an approximation of Claude's tokenizer; the compression figures come from the API's own counts. Compare them with each other, not with a bill.

## Advantages

- **It holds.** The rules are injected at session start and re-stated in a short line on every turn, so the style does not drift back after twenty messages. That line names the rules that slip first, not only the state.
- **Nothing is lost.** Compression removes packaging, never facts. Negations, qualifiers that change what is true, numbers, names, paths and error strings survive at every level; a shorter answer missing one of them has failed.
- **Every rule is binary.** A rule that needs a judgment call every time it applies loses to habit by turn fifty. What ships is only the kind a model can follow as a yes or no: one word when one word answers, first line answers the question, no list markers, at most two bold spans, no tables unless asked.
- **Four dials, no combined modes.** `high` + `ask` + `check` is three two-word commands, and each can be turned off alone.
- **The subagents pay for themselves immediately.** One screenshot is about 9,800 tokens, a test log is hundreds of lines, a catalogue is 550,000 tokens. None of it enters your conversation.
- **Everything is local.** No account, no gateway, no telemetry. The hooks read two files and write one. Three subagents reach the network because fetching is their job, and only when you delegate to them.
- **It ships off, and switching it off sticks.** No behaviour changes until you ask, and `atlas off` survives a restart.

## Disadvantages

- **It is a style constraint on a language model, not a filter.** The model follows it most of the time, not all of the time. On long sessions it occasionally slips — an article here, a list marker there — and the per-turn reminder exists because of that, not instead of it.
- **`low` and `high` are closer than their names suggest.** Measured: `low` 51% and `high` 54% less output in English, 47% and 47% in Italian. `high` is the harder rule set and reads more telegraphically; the token gap is a few points.
- **Short sessions pay less.** The fixed cost is paid before the first answer, so on the `atlas` build a 40-turn session saves 1–17% where a 295-turn one saves 27–38%. A session of a handful of turns with short answers may not pay at all; `atlas-optimize` computes this from your own transcripts.
- **The per-turn reminder scales with turns.** Over 295 turns it costs more than the whole session-start injection. It is as short as it can be while still naming rules.
- **`check` adds tokens by design.** Verifying means looking things up. It is the one dial that costs more than it saves in tokens; it is paid for by the compression running underneath it.
- **`ask` cannot know what you have not said.** It reduces wrong assumptions; it does not remove them.
- **English commands, English hook phrases.** Requests in any language are recognised by the model, but the phrases the hook matches by itself ("stop atlas", "normal mode") are English. `atlas off` is a name and works everywhere.
- **The state is global.** One setting for every project and every chat, stored outside the plugin, so uninstalling does not reset it.
- **`atlas-browser` needs the desktop app's Browser pane.** From the plain CLI it has nothing to drive and says so.
- **The compression figure is 2 rounds on 48 questions with fixed fact sheets, one model.** It measures form with the information held constant; answers that have to find their own facts vary more.
- It does not compress your input, your files, or tool output. It shortens **output**
- Commands are English words. Requests in any language are recognised; the phrases the hook matches on its own ("stop atlas", "normal mode") are English only, and `atlas off` works everywhere
- `ask` cannot know what you have not said. It reduces wrong assumptions; it does not remove them


## Recommended companions

ATLAS works on its own. It works better with these three connected — none is required, and no
rule ever says an answer is unavailable because one is missing.

| server | what ATLAS does with it | install |
|---|---|---|
| **Context7** | `atlas-research` and `check` ask it first for library APIs: one call for the right version, where a search takes four and may land on a page about another one | `claude mcp add --transport http --scope user context7 https://mcp.context7.com/mcp` |
| **Chrome DevTools MCP** | the two things `atlas-browser` cannot do — pages behind a login, and performance traces. It hands those back rather than reporting what an anonymous visitor sees | `claude mcp add --scope user chrome-devtools -- npx -y chrome-devtools-mcp@latest` |
| **Composio** | one gateway to Gmail, Notion, Slack, GitHub and the rest, so the subagents reach real data instead of only the web | `claude mcp add --transport http --scope user composio https://connect.composio.dev/mcp` then `claude mcp login composio` |

`--scope user` matters: without it the server exists only in the project you ran the command in.
Restart Claude Code afterwards — MCP servers are read at startup.

**Order, for the browser**: `atlas-browser` first, the external one only for what it hands back.
The subagent keeps screenshots out of your conversation; driving Chrome yourself does not.

**Composio holds OAuth tokens for the accounts you connect.** Connect only what you use.

## What leaves your machine

**Nothing you did not ask for.** The rules, the dials and the hooks are entirely local: they read
two files and write one, and nothing about your sessions is ever sent anywhere.

Three subagents do reach the network, because fetching is their job, and only when you delegate to
them: `atlas-research` searches and opens pages, `atlas-catalog` fetches the public catalogues,
`atlas-browser` drives a page you named. They send your query, nothing else. `atlas-solo` and
`atlas-min` ship none of them and make no network calls at all.

| file | purpose |
|---|---|
| `~/.claude/.atlas-state` | the four dials, e.g. `high:ask:on:off` |
| `~/.claude/atlas-terms.txt` | your untouchable terms, one per line. Ships empty |
| `<project>/.atlas.json` | optional per-project default |

## Untouchable terms

One term per line in `~/.claude/atlas-terms.txt`. Never compressed, never translated, never
abbreviated. Ships empty on purpose — a published plugin should not carry anyone's project names.

```
# lines starting with # are ignored
PelicanDB
retry_budget
```

## Turning it off

`atlas off`, or "stop atlas". The state file is written as off and stays that way across
restarts. Removing the plugin does not touch it: delete `~/.claude/.atlas-state` by hand if you
want no trace left.

## Tests

```bash
npm test
```

`tests/prompts.json` holds twenty-five behavioural prompts, written before the rules they test.
Those need a model to run; `npm test` covers what a machine can judge on its own.

## Licence

MIT.
