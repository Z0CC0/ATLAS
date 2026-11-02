# ATLAS

**Four dials for how a coding assistant talks to you, and two subagents that keep the noisy work out of your conversation. A Claude Code plugin.**

Most of what an assistant writes is packaging: greetings, restatements, hedges, a summary of what it just said, an offer of what to do next. ATLAS removes the packaging and keeps every fact, and it does so on turn fifty as reliably as on turn one, because the rules are re-stated to the model on every message instead of once at the start.

It ships off. Nothing changes until you type `atlas low` or `atlas high`.

## What is in this repository

| folder | what it is |
|---|---|
| `atlas/` | the default: four dials, six commands, two subagents |
| `atlas-min/` | compression only: two levels, one command |
| `atlas-code/` | `atlas` plus coding and documents: twenty-three more commands (review, fix, tests, verification, planning, shipping, a security audit, specs, changelogs, …), eight more subagents and an optional guard hook |
| `atlas-mem/` | `atlas` plus review, fix and commit, and a memory: notes written by hand, linked to code, flagged as suspect when that code changes, with local tools for a code graph, a harvest of past sessions, labels on code and a reader of built programs |
| `atlas-max/` | all of it in one install |
| `atlas-test/` | the bench that produced every number below, with the questions, every answer it generated and every verdict, so you can rerun it |
| `.claude-plugin/marketplace.json` | lets Claude Code install any of the five straight from this repository |

## What it does

**Compression** — `atlas low` drops filler, pleasantries, hedging, articles and the copula. `atlas high` halves the words: every fact stays, every explanation goes. Code, error strings, paths, numbers, negations and proper names are never touched at either level. Anything written for other people — commits, docs, pull requests, memory files — is written in ordinary prose whatever the dial says.

**Rigour** — `atlas ask` makes it clarify the goal before building: one question at a time, multiple choice where the options can be named, on every request and not only the first. Bounded tasks — a typo, a rename — are just done.

**Check** — `atlas check` works against invented facts: nothing from memory, primary sources first, its own work verified before it is called done, a second option looked for before recommending the first, a correction verified before it is accepted. "I did not find it" is never written as "it does not exist".

**Silent** — `atlas silent` hands over the result and stops: no narration between tool calls, no closing summary, no offer of what to do next. Three things are still said, one line each: an irreversible action before it happens, a task that cannot run as written, a result that is wrong.

All four persist across turns, restarts and projects until changed, and move independently: `atlas ask off` leaves the other three where they were.

**Two subagents** do the expensive reading somewhere else and hand back only the answer: `atlas-research` (an answer with sources, or a reading list; with "is there a free API for this", the public catalogues; with "what do people say", open forums and what search engines show of social networks) and `atlas-browser` (does the page work, without a screenshot in your context). `atlas-code`, `atlas-mem` and `atlas-max` add `atlas-finder` (where is X), `atlas-diff` (what is wrong with this diff) and `atlas-runner` (run the tests, return the verdict).

**Six commands**: the dials, the reference card, `atlas-search` (an answer from a live search, or with "give me sources" a reading list; asked what people say, it reads open forums too and ends by saying what it could not look at), `atlas-recap` (a handover file so a new chat can continue where this one stopped), `atlas-organize` (tidy a local folder, with an undo) and `atlas-silent`. `atlas-review`, `atlas-fix` and `atlas-commit` come with `atlas-code`, `atlas-mem` and `atlas-max`.

## Commands

| command | what it does |
|---|---|
| `/atlas:atlas` | set the dials |
| `/atlas:atlas-help` | the reference card |
| `/atlas:atlas-recap` | write a handover file for the conversation |
| `/atlas:atlas-search` | answer only from a web search; with "give me sources", where to read instead |
| `/atlas:atlas-organize` | tidy a local folder, with an undo |
| `/atlas:atlas-silent` | do it and hand over the result, nothing else |

## Install

From Claude Code, as a marketplace:

```
/plugin marketplace add Z0CC0/ATLAS
/plugin install atlas@atlas
```

`atlas-min@atlas`, `atlas-code@atlas`, `atlas-mem@atlas` or `atlas-max@atlas` for the other builds. Installed from the marketplace, a command carries the plugin's name: `/atlas:atlas high` in the `atlas` build, `/atlas-mem:atlas high` in `atlas-mem`, and so on; `atlas high` alone as the whole message works in every build. From the Claude desktop app: zip one of the five folders and upload it as a plugin. Either way `node` must be on the PATH — the hooks are JavaScript. No dependencies, no build step, no telemetry.

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

**The setting is per project and it persists** — across turns and restarts, until you change it.
It is not a per-conversation mode: switch it on once in a repository and every new chat opened
there starts that way. Another repository is another setting, off until you say otherwise, so
`atlas high` set for one piece of work never follows you into the next. `atlas off` persists the
same way. A project is the folder the session runs in, walked up to the nearest `.git` or
`.atlas.json`, so a chat opened in a subfolder shares the repository's dials.

**Uninstalling does not reset it.** The dial states live in `~/.claude/atlas-state/`, one small
file per project, outside the plugin, so removing and reinstalling brings back whatever was set
before. Type `atlas off` in a project before uninstalling, or delete that folder — nothing else
depends on it. Nothing is ever written inside your repositories.

## Five builds

Choose by what you do, not by size. Every build except `atlas-min` has all the dials. Install one: two ATLAS builds side by side inject the rules and the reminder twice. Tokens are what the API billed for one turn on `claude-opus-5-5` at 0.1.0, minus the same turn with no plugin (`atlas-test/fixed-costs.mjs`, results in `atlas-test/fixed-costs.0.1.0.json`). The no-plugin turn itself moved by about 140 tokens between runs, so a smaller difference is noise.

| build | what it is | commands | subagents | installed, switched off | first turn at `low` | first turn at `high` | 40 turns at `low` | 295 turns at `low` |
|---|---|---|---|---|---|---|---|---|
| `atlas` | the rules, the dials, search and the browser | 6 | 2 | 1,247 | 3,357 | 3,537 | -15% | -29% |
| `atlas-min` | compression only | 1 | 0 | about 0 | 1,538 | 1,723 | -26% | -33% |
| `atlas-code` | `atlas` plus coding and documents | 29 | 10 | 6,391 | 8,898 | 9,113 | +13% | -25% |
| `atlas-mem` | `atlas` plus review, fix, a memory and a program reader | 11 | 5 | 2,571 | 4,694 | 4,874 | -8% | -28% |
| `atlas-max` | all of it | 31 | 10 | 6,826 | 9,332 | 9,548 | +15% | -25% |

The last two columns are the session cost against no plugin, negative is cheaper, computed by `atlas-test/session-table.mjs`. Only `atlas` and `atlas-min` had their output measured; the other builds are assumed to save what `atlas` saves, which is not measured. `atlas-code` and `atlas-max` also carry 278 tokens of rules on how code is written.

### `atlas`

Commands: `atlas <dial>`, `atlas-help`, `atlas-search`, `atlas-recap`, `atlas-organize`, `atlas-silent`. Subagents: `atlas-research`, `atlas-browser`. The default if you do not write code every day.

Advantages:

- It holds the rules for anyone, coding or not, for the least that still has every dial.
- 3,357 tokens on the first turn at `low`: -15% at 40 turns against no plugin.

Disadvantages:

- No review, no build fixing, no commit message: those are in `atlas-code`, `atlas-mem` and `atlas-max`.
- No subagent that reads code for you, so a broad code search lands in your conversation.

### `atlas-min`

Commands: `atlas low`, `atlas high`, `atlas status`, `atlas off`.

Advantages:

- The cheapest: nothing measurable when off, 1,538 on the first turn at `low`.
- The compression was measured on this build too, and it saves as much as `atlas`.

Disadvantages:

- No `ask`, `check` or `silent`, no subagents, no search, no recap. One command.
- Nothing here protects you from a wrong answer: it only makes the answer shorter.

### `atlas-code`

Commands, on top of those of `atlas`: `atlas review`, `atlas fix`, `atlas commit`, `atlas test`, `atlas verify`, `atlas plan`, `atlas multi`, `atlas docs`, `atlas perf`, `atlas ship`, `atlas track`, `atlas refactor`, `atlas publish`, `atlas ui`, `atlas build-ai`, `atlas media`, `atlas context`, `atlas secure`, `atlas spec`, `atlas changelog`, `atlas brief`, `atlas explain`, plus `atlas-stack`, which `atlas plan` reads and you do not type. Subagents, on top of the two: `atlas-finder`, `atlas-diff`, `atlas-runner`, `atlas-tester`, `atlas-fixer`, `atlas-auditor`, `atlas-documenter`, `atlas-profiler`.

Advantages:

- Twenty-three more skills for the whole cycle: plan, test, verify, review, fix, ship, audit, and the documents around them.
- Eight more subagents, so code searches, logs and the heavy modes stay outside your conversation.
- A guard hook, off until you switch it on, that asks before a destructive command.
- Each skill is a router: about 125,700 tokens of files behind them, read one or a few at a time.

Disadvantages:

- 6,391 tokens in every chat, even switched off.
- Below about 57 turns it costs more than no plugin: +13% at 40 turns at `low`, +7% at `high`. It pays over long sessions, or when the commands are used.
- The guard hook runs on every shell command and file edit even with its switches off, about 40 ms each.
- Only `review`, `fix` and `secure` were run headless on real projects. The rest was tried in sessions, not measured. No bench measures the quality of the documents.

### `atlas-mem`

Commands, on top of those of `atlas`: `atlas review`, `atlas fix`, `atlas commit`, `atlas memory` (remember, find, is it still true, tidy, label) and `atlas artifact`. Subagents, on top of the two: `atlas-finder`, `atlas-diff`, `atlas-runner`. Local tools: the stale-note check, a code graph, a harvest, search by meaning, live references, labels, a reader of built programs.

Advantages:

- A note that describes code is flagged as suspect when that code changes, instead of staying true by assumption.
- A code graph across projects, labels that follow a symbol into every grep and read, and a harvest of past sessions into an inbox only you accept from.
- `atlas-artifact` reads a shipped program, a binary or a database without running it.
- Review, fix and commit come with it, so you do not need `atlas-code` beside it.

Disadvantages:

- 1,324 more tokens than `atlas` in every chat, and a 23 MB download, of which 22 MB are grammars.
- Three more hooks. `atlas-signals` can ask for a note up to three times a session, one turn each; `"signals": false` in your user `atlas.json` switches it off.
- Notes are written by hand. A memory you do not feed stays empty.
- Search by meaning and live references need npm packages and a 130 MB model. Everything else works without them.
- `harvest` calls a model when you run it, and that spends your usage.
- A vault named by a project counts only if your user `atlas.json` confirms it: add it to `vaults`.

### `atlas-max`

Every command and subagent above: thirty-one commands, ten subagents, the guard hook, the memory and its tools.

Advantages:

- Everything in one install, and the only way to have coding and the memory together: two builds side by side inject the rules twice.
- No extra files to manage beyond what the two builds already ship.

Disadvantages:

- The dearest: 6,826 tokens in every chat, even switched off. Below about 60 turns it costs more than no plugin: +15% at 40 turns at `low`.
- Every hook of both builds, and the 24 MB download.
- If you do not use both halves, `atlas-code` or `atlas-mem` costs less for the same result.

### `atlas-test` (in this repository, not a plugin)

The bench that produced the figures on this page: the questions, all 1,440 answers, every verdict and the scripts. See `atlas-test/README.md`. It lets you check every number here, and it is 22 MB you never need to install. A full rerun takes hours and about a subscription's worth of usage. It measures the form of answers, not whether code written with `atlas-code` is better.

## Measured

Every number below is measured, not estimated, and the unfavourable ones are printed with the rest. All of it comes from the bench in `atlas-test/`, described in the next section, so it can be rerun. The compression tables were measured on 2026-09-26 with `claude-opus-5-5`, the CLI's default model, on an earlier revision of these rules. An earlier run on 2026-09-08 with `claude-sonnet-5` and an older revision of the rules is kept in `atlas-test/` (`cases/compression.*`) as history: Sonnet compressed more under every plugin, `atlas high` about 54% in English where Opus gives 46%, so figures from the two days are not comparable with each other. That older run also has a flaw found on 2026-09-26: Claude Code keeps only about 10 KB of a hook's output and hands the model a 2 KB preview of anything longer, silently. Those rules were over that size in every state but `low`, so the Sonnet rows for `high`, `ask` and `check` measured the first two kilobytes of the rules, not the rules. The rules are now injected in parts under the limit; the `check` rows below were generated after that fix and the billed input of every row is in the data, which is how the flaw was caught.

**Compression.** 24 English and 24 Italian questions, each carrying its own sheet of facts so that every setup answers with the same information and only the form can change. Each question was answered 2 times per setup in a fresh session through the real hooks; tokens are the API's own count of the visible answer, thinking excluded. "Details lost" is how many of the sheet's notes a reader can no longer learn from the answer, the median across rounds, minus what the no-plugin answer already lost. Every answer was read against its whole sheet by `claude-sonnet-5-5`, with no plugin and no configuration name in sight; each note marked absent was then read again with the question beside the answer, because `14:20.` does answer "what time is it in London?". That second reading turned 75 of the 80 absent notes into present. The no-plugin answers lose 1 note in English and 2 in Italian. Controls: a note from another question was called present 0 times in 1,440 calls, and a sentence copied from the answer was called absent 2 times in 1,391. Then a sensitivity test, 60 answers per language with the sentences carrying one note deleted: the judge still called that note present 11 times of 120, some because the information was stated elsewhere too, and called a note left in absent 0 times of 104. So a real loss can slip past it, and these zeros mean "very few", not "none". The older judge in the same folder uses a substring check, re-judged only where it found nothing. That check also "finds" 3.1% to 3.4% of the facts of other questions, so its zeros prove little, though this reading reaches about the same result. The caveman rows are caveman 2.7.0 (commit 2fd153c, installed on this machine on 2026-09-26), measured the same way, on the same questions, on the same day.

The `i-have-adhd` row is a different kind of thing and is here because it is the most-starred formatting skill for Claude Code: it shapes answers for a reader with ADHD — lead with the next action, numbered steps, restate the state, end with a next action — and does not try to save tokens. It ships as a skill with no hook, so its SKILL.md was appended to the system prompt for those calls, the "always on" version of it. The copy used, its MIT licence and the commit are in `atlas-test/third-party/i-have-adhd/`. Read its row as "what this form costs", not as a loss.

English:

| setup | output vs no plugin, median | worst … best round | details lost |
|---|---|---|---|
| `atlas low` | -37% | -37% … -37% | 0 of 176 |
| `atlas high` | -46% | -45% … -47% | 0 of 176 |
| `low` + `ask` | -36% | -33% … -38% | 0 of 176 |
| `low` + `check` | -38% | -38% … -38% | 0 of 176 |
| `low` + `ask` + `check` | -39% | -38% … -40% | 0 of 176 |
| `high` + `ask` | -46% | -46% … -46% | 0.5 of 176 |
| `high` + `check` | -47% | -47% … -48% | 0 of 176 |
| `high` + `ask` + `check` | -46% | -45% … -46% | 0 of 176 |
| `atlas-min` at `low` | -40% | -39% … -41% | 0 of 176 |
| `atlas-min` at `high` | -47% | -47% … -48% | 0 of 176 |
| caveman `lite` | -11% | -11% … -12% | 0 of 176 |
| caveman `full` | -22% | -22% … -22% | 0 of 176 |
| caveman `ultra` | -28% | -26% … -31% | 0 of 176 |
| i-have-adhd | +2% | +4% … +1% | 0 of 176 |

Italian:

| setup | output vs no plugin, median | worst … best round | details lost |
|---|---|---|---|
| `atlas low` | -37% | -35% … -38% | 0 of 176 |
| `atlas high` | -43% | -43% … -44% | 0 of 176 |
| `low` + `ask` | -38% | -38% … -38% | 0 of 176 |
| `low` + `check` | -34% | -34% … -34% | 0 of 176 |
| `low` + `ask` + `check` | -35% | -35% … -36% | 0 of 176 |
| `high` + `ask` | -43% | -43% … -44% | 0 of 176 |
| `high` + `check` | -42% | -42% … -42% | 0 of 176 |
| `high` + `ask` + `check` | -41% | -41% … -42% | 0 of 176 |
| `atlas-min` at `low` | -39% | -38% … -39% | 0 of 176 |
| `atlas-min` at `high` | -44% | -44% … -44% | 0 of 176 |
| caveman `lite` | -10% | -9% … -11% | 0 of 176 |
| caveman `full` | -21% | -20% … -23% | 0 of 176 |
| caveman `ultra` | -26% | -25% … -26% | 0 of 176 |
| i-have-adhd | +2% | +3% … +1% | 0 of 176 |

Run-to-run noise with no plugin and the rules frozen: 0.4 points in English, 0.6 in Italian. A gap smaller than that between two setups is not an effect.

**Billed output is a different number.** The tables above count the visible answer; the API bills thinking tokens as output too, and under the dials the model thinks more while it writes less. Summed over the same 48 answers per setup (`atlas-test/generated/opus.*`, where `output_tokens` includes thinking and `thinking_tokens` is the part not shown), billed output against no plugin, English and Italian: `atlas low` +2.0% and +4.7%, `atlas high` -24.6% and -18.3%, `low` + `check` +10.1% and +23.6%, `low` + `ask` + `check` +15.6% and +21.7%, `atlas-min` at `low` -8.0% and -1.3%, at `high` -24.6% and -20.4%, caveman `full` -13.9% and -10.0%, caveman `ultra` -19.4% and -13.5%. So `low` saves reading, not the bill; `high` saves both. The session tables below use the visible saving: read them as reading cost, not as the bill.

**What the first turn costs**, as the API bills it: one turn with the build on minus the same turn with no plugin, on `claude-opus-5-5` at 0.1.0. The turn with the build installed and off shows the descriptions as billed, which the old bench could not separate. The caveman and i-have-adhd rows were not re-measured: they come from the 2026-09-26 run, with caveman's descriptions counted by tiktoken, so they understate those rows against the others.

| setup | installed, switched off | added by the rules and the reminder | first turn, total |
|---|---|---|---|
| `atlas` at `low` | 1,247 | 2,110 | 3,357 |
| `atlas` at `high` | 1,247 | 2,290 | 3,537 |
| `atlas-min` at `low` | about 0 | 1,538 | 1,538 |
| `atlas-min` at `high` | about 0 | 1,723 | 1,723 |
| `atlas-code` at `low` | 6,391 | 2,507 | 8,898 |
| `atlas-mem` at `low` | 2,571 | 2,123 | 4,694 |
| `atlas-max` at `low` | 6,826 | 2,506 | 9,332 |
| caveman `lite`, 2026-09-26 | 1,281 by tiktoken | 2,027 | 3,308 |
| caveman `full`, 2026-09-26 | 1,281 by tiktoken | 2,086 | 3,367 |
| caveman `ultra`, 2026-09-26 | 1,281 by tiktoken | 2,126 | 3,407 |
| i-have-adhd, 2026-09-26 | 0 | 2,501 | 2,501 |

**What a session costs against no plugin, in visible tokens** (thinking excluded, see "Billed output" above; savings from the 2026-09-26 run above), by build and setup: the first turn from the table above, then per turn the reminder (27–32 tokens for atlas, 50–66 for caveman, tiktoken; `atlas-test/session-table.mjs`) plus an answer shortened by that setup's own measured saving (mean of the two languages); a 500-token answer with no plugin; 40 turns and 295 turns, the average of the real transcripts this was tuned on. Negative is cheaper.

`atlas`

| setup | 40 turns | 295 turns |
|---|---|---|
| `low` | -15% | -29% |
| `high` | -21% | -36% |
| `low` + `ask` | -11% | -27% |
| `low` + `check` | -6% | -26% |
| `low` + `ask` + `check` | -3% | -24% |
| `high` + `ask` | -16% | -33% |
| `high` + `check` | -12% | -33% |
| `high` + `ask` + `check` | -6% | -29% |

`atlas-min`

| setup | 40 turns | 295 turns |
|---|---|---|
| `low` | -26% | -33% |
| `high` | -31% | -38% |

`atlas-code`

| setup | 40 turns | 295 turns |
|---|---|---|
| `low` | +13% | -25% |
| `high` | +7% | -32% |

`atlas-mem`

| setup | 40 turns | 295 turns |
|---|---|---|
| `low` | -8% | -28% |
| `high` | -14% | -35% |

`atlas-max`

| setup | 40 turns | 295 turns |
|---|---|---|
| `low` | +15% | -25% |
| `high` | +10% | -32% |

caveman, for comparison

| setup | 40 turns | 295 turns |
|---|---|---|
| caveman `lite` | +16% | +2% |
| caveman `full` | +7% | -7% |
| caveman `ultra` | +3% | -12% |

**Read the two measurements together.** Per answer, against caveman `ultra`, `atlas high` compresses 18 points more in English (46% against 28%) and 18 points more in Italian (43% against 26%). Per session, the first turn of `atlas` costs 3,357 tokens at `low` against 3,367 for caveman `full` on 2026-09-26, whose descriptions were counted, not billed. At `high` over 40 and 295 turns, `atlas` is -21% and -36%, `atlas-min` -31% and -38%, caveman `ultra` +3% and -12%. If tokens are the only thing you want, `atlas-min`; `atlas` buys the dials and search, and this is what they cost.

**Fixed cost per session**, `atlas` build, counted at 0.1.0 by `atlas-test/fixed-costs.mjs` with tiktoken `o200k_base`, an approximation of Claude's tokenizer:

| | tokens per session |
|---|---|
| rules injected at `low` (default) | 1,408 |
| rules injected at `high` | 1,530 |
| skill, command and subagent names and descriptions, always present | 824 |
| per-turn reminder | 27-32 |
| **total at the default** | **2,232** |

`atlas-min` carries 34 of descriptions and 1,051 of rules, `atlas-code` 4,217 and 1,686, `atlas-mem` 1,691 and 1,410, `atlas-max` 4,511 and 1,686. The script counts the name and the description of each item.

**What the API bills is higher.** The first turn of `atlas` at `low` is 3,357 tokens: 1,247 when installed and off, which is the descriptions as billed, and 2,110 for the rules and the reminder. That is 1.51 and 1.47 times the counted figures. The bill depends on the model, and a cheaper model can bill less for the same build. Why was not investigated.

Token counts for the fixed costs are tiktoken (`o200k_base`), an approximation of Claude's tokenizer, except where a line says "billed"; the compression figures come from the API's own counts. Compare them with each other, not with a bill.

## Verify it yourself

Every figure above was produced by three scripts in `atlas-test/`, and the folder ships with everything they produced: the questions (`cases/opus.en.json`, `cases/opus.it.json`), all 1,440 generated answers with their token counts and billed input, and every judge verdict. Rerun them and you will either confirm the numbers or catch me out. Two older sets sit beside them and are history, not the current figure: `compression.*`, the same questions on 2026-09-08 with `claude-sonnet-5` and an older revision of the rules, and `sameday.*`, the same-day comparison that decided the cuts to the reminder and the rules.

**What the bench does, and why this way.**

`generate.mjs` asks the model the same question under each configuration, one fresh session per answer, through the real hooks of the installed plugin. Each question carries its own sheet of facts and the instruction to use all of them and nothing else, with every tool disabled, so the information is held constant by construction and only the form can change. An earlier version of this project measured hand-written answers; that measures the person, not the plugin, and it was wrong in both directions. The token count is the API's own `output_tokens` minus `thinking_tokens`, written beside every answer together with the input the call was billed for.

`judge-notes.mjs` reads every answer against the whole sheet of notes, one call per answer with no plugin loaded, and reads again with the question beside it whatever it marked absent. `--planted` tests the judge itself by deleting a note from real answers. `judge.mjs` is the older judge, kept to reproduce the older figures: it re-judges only what a substring check marked missing, so what that check wrongly marks present is never looked at.

`fixed-costs.mjs` counts what each build loads and, with `--billed`, measures the first turn. `session-table.mjs` does the session arithmetic over the results.

`measure.mjs` reads it all back and prints the saving: median, worst and best round, and how often a configuration asked a question instead of answering. `judge-notes.mjs --report` prints the details lost.

**Run it.** You need the Claude Code CLI on the PATH and logged in (`claude`, then `/login`, once), the plugin installed, and `node`.

```bash
cd atlas-test
node generate.mjs --cases cases/opus.en.json --dry-run     # what it would do, spends nothing
node generate.mjs --cases cases/opus.en.json --rounds 2     # English cases, two rounds
node judge-notes.mjs --cases cases/opus.en.json
node judge-notes.mjs --cases cases/opus.en.json --second
node judge-notes.mjs --cases cases/opus.en.json --report
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

**Every plugin you install costs its descriptions in every chat, on or off.** Count them once: this one bills 1,247 tokens on `atlas`, 6,391 on `atlas-code` and next to nothing on `atlas-min` (`claude-opus-5-5`, 0.1.0); caveman 2.7.0 was 1,281 by tiktoken on 2026-09-26, not re-measured; a large toolkit can be 30,000. Remove what you have not used in a month.

**`atlas-min` when tokens are the only thing you want.** Same compression rules, one command, no subagents, 34 tokens of descriptions: measured against caveman 2.7.0 on the same day, at `high` it compresses 19 points more per answer than caveman `ultra`, and over 295 turns its best setup is 26 points cheaper than caveman.

**Memory files in English.** They load at every start; the tokenizer reads English about a third cheaper than Italian and cheaper still than most other languages. Write `MEMORY.md` in English even if you talk to the model in your own.

**Put project names in `atlas-terms.txt`.** One per line: never compressed, never translated, never abbreviated.

**Pin a project's dials in `.atlas.json`** when the same repository always wants the same setup, and leave the per-project state for everything else.

**Connect Context7 if you ask about libraries.** One call for the right version's docs, where a search takes four; `check` and `atlas-research` use it first when it is there.

## Advantages

- **It holds.** The rules are injected at session start and re-stated in a short line on every turn, so the style does not drift back after twenty messages. That line names the rules that slip first, not only the state.
- **Next to nothing is lost.** Measured: at most one note of 176 in a round, on any setup. Compression removes packaging, not facts. Negations, qualifiers that change what is true, numbers, names, paths and error strings survive at every level; a shorter answer missing one of them has failed.
- **Every rule is binary.** A rule that needs a judgment call every time it applies loses to habit by turn fifty. What ships is only the kind a model can follow as a yes or no: one word when one word answers, first line answers the question, no list markers, at most two bold spans, no tables unless asked.
- **Four dials, no combined modes.** `high` + `ask` + `check` is three two-word commands, and each can be turned off alone.
- **The subagents pay for themselves immediately.** One screenshot is about 9,800 tokens, a catalogue is 550,000 tokens. None of it enters your conversation.
- **Everything is local.** No account, no gateway, no telemetry. The hooks touch only the files listed under "What leaves your machine", all on this computer. Two subagents reach the network because fetching is their job, and only when you delegate to them.
- **It ships off, and switching it off sticks.** No behaviour changes until you ask, and `atlas off` survives a restart.

## Disadvantages

- **It cannot search everywhere.** Asked what people say, `atlas-search` reads Hacker News, Lemmy, Stack Overflow and GitHub, which answer with no account. Reddit, X, Bluesky, LinkedIn, Instagram, TikTok, Facebook, Threads and Mastodon show a stranger little or nothing, so it sees only what search engines show of them, and it says so in every answer. No login, no cookie, and no way round a refusal.
- **It is a style constraint on a language model, not a filter.** The model follows it most of the time, not all of the time. On long sessions it occasionally slips — an article here, a list marker there — and the per-turn reminder exists because of that, not instead of it.
- **`low` and `high` are 9 and 7 points apart.** Measured: `low` 37% and `high` 46% less output in English, 37% and 43% in Italian. `high` is the harder rule set and reads more telegraphically: the saving is real, and so is the cost in readability.
- **Short sessions pay less.** The fixed cost is paid before the first answer, so on the `atlas` build a 40-turn session goes from -3% to -21% depending on the dials, a 295-turn one from -24% to -36%. A session of a handful of turns with short answers may not pay at all.
- **The per-turn reminder scales with turns.** Over 295 turns it costs more than the whole first turn. It is as short as it can be while still naming rules.
- **`check` adds tokens by design.** Verifying means looking things up. It is the one dial that costs more than it saves in tokens; it is paid for by the compression running underneath it.
- **`ask` cannot know what you have not said.** It reduces wrong assumptions; it does not remove them.
- **English commands, English hook phrases.** Requests in any language are recognised by the model, but the phrases the hook matches by itself ("stop atlas", "normal mode") are English. `atlas off` is a name and works everywhere.
- **The state is per project, keyed by the folder a session runs in** (walked up to the nearest `.git` or `.atlas.json`). Two checkouts of the same repository are two settings; a folder with no `.git` is its own project. Stored outside the plugin, so uninstalling does not reset it.
- **`atlas-browser` needs the desktop app's Browser pane.** From the plain CLI it has nothing to drive and says so.

**The same rules as an output style, without the hook (2026-10-15).** Twelve of the English
questions, two rounds, `claude-fable-5-1` (119 of the 120 answers; one call ran on `claude-opus-5-5`), an earlier revision of the rules: injected by the session-start hook
and re-stated by the tracker (`atlas low` / `atlas high`), or written once into the system
prompt as a Claude Code output style made from the hook's own output (`style-low` /
`style-high`, `atlas-test/style-rules.mjs`). Saving against no plugin: hook 31.3% at `low`
and 38.4% at `high`; style 34.2% and 40.4%. Details lost, by the older substring judge: 0 of 132 in every row. Billed input
of the one-turn call: the same, 2,100-2,300 tokens over no plugin either way. The bands of the
two rounds do not overlap, so the two to three points are not noise, but the gap is small and
one-turn calls cannot show the one thing the hook pays for every turn: the 27-32 token reminder
is absent in the style. Not measured: sessions of many turns, Italian, other models, and
whether replacing Claude Code's own output-style text changes its coding behaviour. Rows in
`atlas-test/generated/style.en/`.

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
only the files in the table below and write only the state file, plus `~/.claude/atlas.json` when
you type a guard switch; `atlas-code` adds one small file per session in the system temp folder
while `gate` is on, `atlas-mem` the harvest file of the vault before a compaction. Nothing about
your sessions is ever sent anywhere.

Two subagents do reach the network, because fetching is their job, and only when you delegate to
them: `atlas-research` searches and opens pages and fetches the public catalogues,
`atlas-browser` drives a page you named. They send your query, nothing else. `atlas-min`
ships neither and makes no network calls at all.

| file | purpose |
|---|---|
| `~/.claude/atlas-state/<project>.state` | the four dials of one project, e.g. `high:ask:on:off` |
| `~/.claude/atlas-terms.txt` | your untouchable terms, one per line. Ships empty |
| `<project>/.atlas.json` | optional per-project default |
| `~/.claude/atlas.json` | optional default for every project, the guard switches of `atlas-code`, the vaults `atlas-mem` may use |
| `<temp>/atlas-gate-<session>.json` | `atlas-code` only, `gate` on: the files the gate already turned back in this session |
| `<vault>/.atlas/harvest/<session>.md` | `atlas-mem` only: written before a compaction, the lines of that session that read like a decision |

`~/.claude` is `$CLAUDE_CONFIG_DIR` when that is set, for every file above.

On a question about what people say, `atlas-search` runs `tools/social.mjs`, which sends your search words to `hn.algolia.com`, `lemmy.world`, `api.stackexchange.com` and `api.github.com`, and nothing else.

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
restarts, for the project you typed it in. Removing the plugin does not touch it: delete the
`~/.claude/atlas-state/` folder by hand if you want no trace left.

## Licence

MIT.
