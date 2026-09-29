# ATLAS

**Four dials for how a coding assistant talks to you, and seven subagents that keep the noisy work out of your conversation. A Claude Code plugin.**

Most of what an assistant writes is packaging: greetings, restatements, hedges, a summary of what it just said, an offer of what to do next. ATLAS removes the packaging and keeps every fact, and it does so on turn fifty as reliably as on turn one, because the rules are re-stated to the model on every message instead of once at the start.

It ships off. Nothing changes until you type `atlas low` or `atlas high`.

## What is in this repository

| folder | what it is |
|---|---|
| `atlas/` | the full plugin: four dials, eight commands, seven subagents |
| `atlas-solo/` | the same rules and commands without the subagents |
| `atlas-min/` | compression only: two levels, one command |
| `atlas-test/` | the bench that produced every number below, with the questions, every answer it generated and every verdict — so you can rerun it |
| `.claude-plugin/marketplace.json` | lets Claude Code install any of the three straight from this repository |

## What it does

**Compression** — `atlas low` drops filler, pleasantries, hedging, articles and the copula. `atlas high` halves the words: every fact stays, every explanation goes. Code, error strings, paths, numbers, negations and proper names are never touched at either level. Anything written for other people — commits, docs, pull requests, memory files — is written in ordinary prose whatever the dial says.

**Rigour** — `atlas ask` makes it clarify the goal before building: one question at a time, multiple choice where the options can be named, on every request and not only the first. Bounded tasks — a typo, a rename — are just done.

**Check** — `atlas check` works against invented facts: nothing from memory, primary sources first, its own work verified before it is called done, a second option looked for before recommending the first, a correction verified before it is accepted. "I did not find it" is never written as "it does not exist".

**Silent** — `atlas silent` hands over the result and stops: no narration between tool calls, no closing summary, no offer of what to do next. Three things are still said, one line each: an irreversible action before it happens, a task that cannot run as written, a result that is wrong.

All four persist across turns, restarts and projects until changed, and move independently: `atlas ask off` leaves the other three where they were.

**Seven subagents** do the expensive reading somewhere else and hand back only the answer: `atlas-finder` (where is X), `atlas-editor` (a bounded edit), `atlas-diff` (what is wrong with this diff), `atlas-runner` (run the tests, return the verdict), `atlas-browser` (does the page work, without a screenshot in your context), `atlas-research` (an answer with sources, or a reading list), `atlas-catalog` (is there a free API for this).

**Eight commands**: the dials, the reference card, `atlas-search` (an answer from a live search, or with "give me sources" a reading list), `atlas-review` and `atlas-commit`, `atlas-recap` (a handover file so a new chat can continue where this one stopped), `atlas-organize` (tidies a folder with a plan first and an undo after; nothing is ever deleted), `atlas-silent`.

## Commands

| command | what it does |
|---|---|
| `/atlas:atlas` | set the dials |
| `/atlas:atlas-help` | the reference card |
| `/atlas:atlas-recap` | write a handover file for the conversation |
| `/atlas:atlas-search` | answer only from a web search; with "give me sources", where to read instead |
| `/atlas:atlas-review` | review the current diff |
| `/atlas:atlas-commit` | commit message for the staged changes |
| `/atlas:atlas-organize` | tidy a local folder, with an undo |
| `/atlas:atlas-silent` | do it and hand over the result, nothing else |

## Install

From Claude Code, as a marketplace:

```
/plugin marketplace add Z0CC0/ATLAS
/plugin install atlas@atlas
```

`atlas-solo@atlas` or `atlas-min@atlas` for the other two builds. From the Claude desktop app: zip one of the three folders and upload it as a plugin. Either way `node` must be on the PATH — the hooks are JavaScript. No dependencies, no build step, no telemetry.

Then, in any chat: `atlas low` or `atlas high`. `atlas help` prints the full reference card.

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
| `atlas` | everything | 3,249 tokens |
| `atlas-solo` | same rules, no subagents | 2,238 tokens |
| `atlas-min` | compression only: two levels, one command | 1,235 tokens |

`atlas` and `atlas-solo` carry byte-identical rules. The difference is whether the subagents exist, and whether their work stays out of your context.

## Measured

Every number below is measured, not estimated, and the unfavourable ones are printed with the rest. All of it comes from the bench in `atlas-test/`, described in the next section, so it can be rerun. The compression tables were measured on 2026-09-26 with `claude-opus-5-5`, the CLI's default model, on the 0.1.3 rules. An earlier run on 2026-09-08 with `claude-sonnet-5` and the 0.1.0 rules is kept in `atlas-test/` (`cases/compression.*`) as history: Sonnet compressed more under every plugin, `atlas high` about 54% in English where Opus gives 46%, so figures from the two days are not comparable with each other. That older run also has a flaw found on 2026-09-26: Claude Code keeps only about 10 KB of a hook's output and hands the model a 2 KB preview of anything longer, silently. The 0.1.0 rules were over that size in every state but `low`, so the Sonnet rows for `high`, `ask` and `check` measured the first two kilobytes of the rules, not the rules. Since 0.1.4 the rules are injected in parts under the limit; the `check` rows below were generated after that fix and the billed input of every row is in the data, which is how the flaw was caught.

**Compression.** 24 English and 24 Italian questions, each carrying its own sheet of facts so that every setup answers with the same information and only the form can change. Each question was answered 2 times per setup in a fresh session through the real hooks; tokens are the API's own count of the visible answer, thinking excluded. "Details lost" is how many of the sheet's facts a reader can no longer learn from the answer: first by string match, then every flagged one re-judged by a model that is told nothing about what is being measured — the median across rounds, minus what the no-plugin answer already lost. The caveman rows are caveman 2.7.0 (commit 2fd153c, installed on this machine on 2026-09-26), measured the same way, on the same questions, on the same day.

The `i-have-adhd` row is a different kind of thing and is here because it is the most-starred formatting skill for Claude Code: it shapes answers for a reader with ADHD — lead with the next action, numbered steps, restate the state, end with a next action — and does not try to save tokens. It ships as a skill with no hook, so its SKILL.md was appended to the system prompt for those calls, the "always on" version of it. The copy used, its MIT licence and the commit are in `atlas-test/third-party/i-have-adhd/`. Read its row as "what this form costs", not as a loss. The row this README carried from 0.1.1 to 0.1.3 (−5% English, +1% Italian) was wrong: the bench split the skill's frontmatter on LF, the file is CRLF, and the system prompt it appended was empty, so those calls measured no plugin at all. Found on 2026-09-26 from the billed input, fixed in `generate.mjs`, and the row below is the first real measurement.

English:

| setup | output vs no plugin, median | worst … best round | details lost |
|---|---|---|---|
| `atlas low` | -37% | -37% … -37% | 1 of 263 |
| `atlas high` | -46% | -45% … -47% | 0 of 263 |
| `low` + `ask` | -36% | -33% … -38% | 1 of 263 |
| `low` + `check` | -38% | -38% … -38% | 0 of 263 |
| `low` + `ask` + `check` | -39% | -38% … -40% | 0 of 263 |
| `high` + `ask` | -46% | -46% … -46% | 0 of 263 |
| `high` + `check` | -47% | -47% … -48% | 1 of 263 |
| `high` + `ask` + `check` | -46% | -45% … -46% | 0 of 263 |
| `atlas-min` at `low` | -40% | -39% … -41% | 0 of 263 |
| `atlas-min` at `high` | -47% | -47% … -48% | 0 of 263 |
| caveman `lite` | -11% | -11% … -12% | 0 of 263 |
| caveman `full` | -22% | -22% … -22% | 0 of 263 |
| caveman `ultra` | -28% | -26% … -31% | 0 of 263 |
| i-have-adhd | +2% | +4% … +1% | 1 of 263 |

Italian:

| setup | output vs no plugin, median | worst … best round | details lost |
|---|---|---|---|
| `atlas low` | -37% | -35% … -38% | 0 of 264 |
| `atlas high` | -43% | -43% … -44% | 1 of 264 |
| `low` + `ask` | -38% | -38% … -38% | 0 of 264 |
| `low` + `check` | -34% | -34% … -34% | 0 of 264 |
| `low` + `ask` + `check` | -35% | -35% … -36% | 0 of 264 |
| `high` + `ask` | -43% | -43% … -44% | 1 of 264 |
| `high` + `check` | -42% | -42% … -42% | 1 of 264 |
| `high` + `ask` + `check` | -41% | -41% … -42% | 0 of 264 |
| `atlas-min` at `low` | -39% | -38% … -39% | 1 of 264 |
| `atlas-min` at `high` | -44% | -44% … -44% | 1 of 264 |
| caveman `lite` | -10% | -9% … -11% | 1 of 264 |
| caveman `full` | -21% | -20% … -23% | 0 of 264 |
| caveman `ultra` | -26% | -25% … -26% | 0 of 264 |
| i-have-adhd | +2% | +3% … +1% | 0 of 264 |

Run-to-run noise with no plugin and the rules frozen: 0.4 points in English, 0.6 in Italian. A gap smaller than that between two setups is not an effect.

**What the first turn costs**, as the API bills it. Each setup's one-turn call minus the no-plugin call of the same question, median over the 48 questions, plus the plugin's descriptions, which are loaded in every call whether or not the plugin is on and so cannot be separated by the bench: those are tiktoken counts of the frontmatter of every command, skill and subagent the plugin ships. `atlas-solo` was not run separately; its rules are byte-identical to `atlas`, only the descriptions differ.

| setup | descriptions, always loaded | injected on the first turn, as billed | first turn, total |
|---|---|---|---|
| `atlas` at `low` | 1,840 | 2,207 | 4,047 |
| `atlas` at `high` | 1,840 | 2,304 | 4,144 |
| `atlas-solo` at `low` | 829 | 2,207 | 3,036 |
| `atlas-min` at `low` | 153 | 1,650 | 1,803 |
| `atlas-min` at `high` | 153 | 1,832 | 1,986 |
| caveman `lite` | 1,281 | 2,027 | 3,308 |
| caveman `full` | 1,281 | 2,086 | 3,367 |
| caveman `ultra` | 1,281 | 2,126 | 3,407 |
| i-have-adhd (its rules in the system prompt, no descriptions) | 0 | 2,501 | 2,501 |

**What a session costs against no plugin**, by build and setup: the first turn from the table above, then per turn the reminder (27–32 tokens for atlas, 50–66 for caveman, tiktoken) plus an answer shortened by that setup's own measured saving (mean of the two languages); a 500-token answer with no plugin; 40 turns and 295 turns, the average of the real transcripts this was tuned on. Negative is cheaper.

`atlas`

| setup | 40 turns | 295 turns |
|---|---|---|
| `low` | -11% | -29% |
| `high` | -18% | -35% |
| `low` + `ask` | -8% | -26% |
| `low` + `check` | -3% | -25% |
| `low` + `ask` + `check` | 0% | -24% |
| `high` + `ask` | -13% | -33% |
| `high` + `check` | -9% | -33% |
| `high` + `ask` + `check` | -3% | -29% |

`atlas-solo`

| setup | 40 turns | 295 turns |
|---|---|---|
| `low` | -16% | -29% |
| `high` | -23% | -36% |
| `low` + `ask` | -13% | -27% |
| `low` + `check` | -8% | -26% |
| `low` + `ask` + `check` | -5% | -25% |
| `high` + `ask` | -19% | -34% |
| `high` + `check` | -14% | -33% |
| `high` + `ask` + `check` | -8% | -30% |

`atlas-min`

| setup | 40 turns | 295 turns |
|---|---|---|
| `low` | -25% | -33% |
| `high` | -29% | -38% |

caveman, for comparison

| setup | 40 turns | 295 turns |
|---|---|---|
| caveman `lite` | +16% | +2% |
| caveman `full` | +7% | -7% |
| caveman `ultra` | +3% | -12% |

**Read the two measurements together.** Per answer, against caveman `ultra`, `atlas high` compresses 18 points more in English (46% against 28%) and 18 points more in Italian (43% against 26%). Per session, the first turn of the full `atlas` build costs 4,047 tokens at `low` against 3,367 for caveman `full`: 1,840 against 1,281 of descriptions, paid in every chat whether or not they are used, and 2,207 against 2,086 of injected rules. `atlas-min` carries the same compression rules and 153 tokens of descriptions: its best setup is 32 points cheaper than caveman at 40 turns and 26 points cheaper than caveman at 295 turns; the full build is 21 points cheaper than caveman at 40 turns and 24 points cheaper than caveman at 295 turns. If tokens are the only thing you want, `atlas-min`; the full build buys the dials and the subagents, and this is what they cost.

**Fixed cost per session**, `atlas` build, tiktoken: 1,409 tokens of rules at `low`, 1,531 at `high`, plus 1,840 of skill, command and subagent descriptions that are loaded whether or not they are used. The per-turn reminder is 27–32 tokens; over a long session it is the largest number of all. `atlas-solo` carries 829 of descriptions, `atlas-min` 153 and 1,082 tokens of rules. The API bills the injected rules and reminder at about 1.54 times the tiktoken count, which is why the table of billed costs runs higher.

Token counts for the fixed costs are tiktoken (`o200k_base`), an approximation of Claude's tokenizer, except where a line says "billed"; the compression figures come from the API's own counts. Compare them with each other, not with a bill.

## Verify it yourself

Every figure above was produced by three scripts in `atlas-test/`, and the folder ships with everything they produced: the questions (`cases/opus.en.json`, `cases/opus.it.json`), all 1,440 generated answers with their token counts and billed input, and every judge verdict. Rerun them and you will either confirm the numbers or catch me out. Two older sets sit beside them and are history, not the current figure: `compression.*`, the same questions on 2026-09-08 with `claude-sonnet-5` and the 0.1.0 rules, and `sameday.*`, the same-day comparison that decided the 0.1.2 and 0.1.3 cuts.

**What the bench does, and why this way.**

`generate.mjs` asks the model the same question under each configuration, one fresh session per answer, through the real hooks of the installed plugin. Each question carries its own sheet of facts and the instruction to use all of them and nothing else, with every tool disabled, so the information is held constant by construction and only the form can change. An earlier version of this project measured hand-written answers; that measures the person, not the plugin, and it was wrong in both directions. The token count is the API's own `output_tokens` minus `thinking_tokens`, written beside every answer together with the input the call was billed for.

`judge.mjs` re-judges every detail the string check marked as missing, one detail per call, with no plugin active and a prompt that does not say what is being measured. Without it, "9h15" counts as losing "9 hours and 15 minutes" and the numbers punish whoever compresses more. Every verdict is saved next to the answer that produced it.

`measure.mjs` reads it all back and prints the table: median, worst and best round, details lost net of what the no-plugin answer already lost, and how often a configuration asked a question instead of answering.

**Run it.** You need the Claude Code CLI on the PATH and logged in (`claude`, then `/login`, once), the plugin installed, and `node`.

```bash
cd atlas-test
node generate.mjs --cases cases/opus.en.json --dry-run     # what it would do, spends nothing
node generate.mjs --cases cases/opus.en.json --rounds 2     # English cases, two rounds
node judge.mjs --cases cases/opus.en.json
node measure.mjs --cases cases/opus.en.json
node generate.mjs --cases cases/opus.it.json --rounds 2     # the Italian ones
```

`run-all.sh` does the whole thing. Count on several hours and about 1,400 calls plus the judge's: it is a subscription's worth of usage, not a quick check. Every step resumes where it stopped (`--missing`), and the scripts save and restore your own dial state, so an interrupted run leaves nothing changed.

Two knobs to know about. `generate.mjs` measures `atlas-min` by swapping the installed plugin's rules file for the minimal build's for those calls; it looks for the install where the desktop app puts it and takes `ATLAS_INSTALLED=<path to SKILL.md>` for any other layout. The `caveman-*` rows need that plugin installed and are skipped otherwise.

**Your own questions.** Copy `cases/opus.en.json`, keep the shape — `question`, `notes` (the fact sheet), `source`, and `facts` (each fact as a list of accepted wordings for the string check) — and pass the file with `--cases`. The judge takes it from there.

## Getting the most out of it

Everything below follows from the measurements above. None of it is required; each line says what it buys.

**Pick the level by the reader, not by the task.** `high` when you read the answer once and act on it. `low` when you re-read, paste it somewhere, or someone else reads it: the token gap between the two is a few points, the readability gap is not.

**Long sessions are where it pays.** The fixed cost is paid once per chat. Ten chats of five turns pay it ten times; one chat of fifty turns pays it once. Keep working in the same chat and use `atlas-recap` when it has to end, so the next one starts with the state instead of the story.

**Turn on `ask` for open-ended work, off for bounded work.** It earns its cost when the goal can move: a new feature, a refactor, a design. On a typo or a rename it is a question you did not need.

**Turn on `check` for facts, off for code you can run.** Versions, prices, APIs, how someone else's software behaves: on. A function you will test in the next minute: off, the test is the check.

**`silent` for batches.** A list of mechanical changes, a migration, anything where you will read the diff and not the prose.

**Delegate what is bigger than its answer.** A test log, a screenshot, a catalogue, a hundred-file search: send it to the subagent and pay for the verdict. Read directly what you will need to see anyway.

**Write the request with the constraint in it.** "In under 50 lines", "only the failing test", "one option, not a comparison": the model follows a stated bound better than any rule about brevity, and the bound costs you a few words.

**Every plugin you install costs its descriptions in every chat, on or off.** Count them once: this one is 1,840 tokens on the full build, 829 without the subagents, caveman 2.7.0 1,281, a large toolkit can be 30,000. Remove what you have not used in a month.

**`atlas-min` when tokens are the only thing you want.** Same compression rules, one command, no subagents, 153 tokens of descriptions: measured against caveman 2.7.0 on the same day, at `high` it compresses 19 points more per answer than caveman `ultra`, and over 295 turns its best setup is 26 points cheaper than caveman.

**Memory files in English.** They load at every start; the tokenizer reads English about a third cheaper than Italian and cheaper still than most other languages. Write `MEMORY.md` in English even if you talk to the model in your own.

**Put project names in `atlas-terms.txt`.** One per line: never compressed, never translated, never abbreviated.

**Pin a project's dials in `.atlas.json`** when the same repository always wants the same setup, and leave the global state for everything else.

**Connect Context7 if you ask about libraries.** One call for the right version's docs, where a search takes four; `check` and `atlas-research` use it first when it is there.

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
- **`low` and `high` are 9 and 7 points apart.** Measured: `low` 37% and `high` 46% less output in English, 37% and 43% in Italian. `high` is the harder rule set and reads more telegraphically: the saving is real, and so is the cost in readability.
- **Short sessions pay less.** The fixed cost is paid before the first answer, so on the `atlas` build a 40-turn session saves 0–18% where a 295-turn one saves 24–35%. A session of a handful of turns with short answers may not pay at all.
- **The per-turn reminder scales with turns.** Over 295 turns it costs more than the whole session-start injection. It is as short as it can be while still naming rules.
- **`check` adds tokens by design.** Verifying means looking things up. It is the one dial that costs more than it saves in tokens; it is paid for by the compression running underneath it.
- **`ask` cannot know what you have not said.** It reduces wrong assumptions; it does not remove them.
- **English commands, English hook phrases.** Requests in any language are recognised by the model, but the phrases the hook matches by itself ("stop atlas", "normal mode") are English. `atlas off` is a name and works everywhere.
- **The state is global.** One setting for every project and every chat, stored outside the plugin, so uninstalling does not reset it.
- **`atlas-browser` needs the desktop app's Browser pane.** From the plain CLI it has nothing to drive and says so.
- **The compression figure is 2 rounds on 48 questions with fixed fact sheets, one model (`claude-opus-5-5`, 2026-09-26).** It measures form with the information held constant; answers that have to find their own facts vary more, and another model compresses by another amount: Sonnet 5 gave larger savings under every plugin.
- **It shortens output only.** Your input, your files and what tools return are not touched: a hook cannot rewrite a tool's result.


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

## Licence

MIT.
