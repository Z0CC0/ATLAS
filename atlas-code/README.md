# atlas-code

Everything in `atlas`, plus a coding section: sixteen more skills and an optional guard
hook. This page covers what the build adds. Everything below the line
is the README of `atlas` itself, and its measurements are about `atlas`, not about this
build.

## What it adds

| type this | and it |
|---|---|
| `atlas test` | writes tests: test-first, coverage gaps, end to end, or against a deployed site |
| `atlas verify` | build, types, lint, tests and leftovers in one pass, compared with the previous run |
| `atlas plan` | plans before code and waits for a yes; asked to build, carries the work through tests and review to a commit, with a second yes before committing |
| `atlas multi` | asks other models for an opinion, a review or an approach, after showing what will be sent |
| `atlas docs` | keeps docs true to the code: sync, a map, onboarding, one feature traced end to end, locale files |
| `atlas perf` | speed work by measurement: baseline, one change, keep or revert |
| `atlas ship` | pull request, container, pipeline, deploy, Windows installer; nothing leaves the machine without a yes |
| `atlas track` | GitHub issues, Jira, Linear: read a ticket, update it, triage a backlog |
| `atlas refactor` | dead code, simplification, duplicates, an old codebase's own style; behaviour unchanged |
| `atlas publish` | prepares a private project to go public, on a copy, with a scan by a reader that did not do the cleaning |
| `atlas ui` | direction, polish, accessibility to WCAG 2.2 AA, motion, design tokens, a screenshot into components |
| `atlas build-ai` | code that calls a model: prompts, agent tools, evals, retrieval, cost, MCP servers, scheduled collectors |
| `atlas media` | animated explainers, video written in React, HTML slides, recorded demos, with tools that run locally |
| `atlas context` | what every session loads, when to compact, one answer at a chosen depth, a side question mid-task |
| `atlas secure` | audits a whole project you own: dangerous code, vulnerable dependencies, secrets in files and git history, and what a local service exposes without login. Finds, never changes |

One more skill is not typed: `atlas-stack`, eighteen short files on how code is written in
a given language or framework. `atlas plan` reads the one for your project before writing
code.

Each skill is a short router with a folder of files beside it. Only its description is
loaded in every session; a file is read when the request calls for it.

## The guard hook

One hook file with three switches. All are off until you put one in `.atlas.json` at the
root of a project, or in `~/.claude/atlas.json` for every project:

```json
{ "guard": true, "gate": true, "finish": true }
```

- `guard` asks you before a command that destroys or publishes: a recursive forced delete,
  `git push --force`, `git reset --hard`, `git clean -f`, `DROP TABLE`, `kubectl delete`,
  `npm publish`, `--no-verify`. Add `"freeze": "src/api"` and it also asks before a write
  outside that folder.
- `gate` turns back the first edit of each file once per session, with what to look up
  first: who imports the file, which instruction the edit serves. The second attempt goes
  through.
- `finish` warns you when an answer ends by saying something was skipped, is still failing,
  or "should work". It reads English phrases only and never blocks.

The hook runs on every shell command and file edit, whether or not a switch is on: about
40 ms each time on the machine it was tested on.

## What it costs

| | `atlas` | `atlas-code` |
|---|---|---|
| descriptions, loaded in every session | 1,973 | 4,222 |
| rules injected at `low` | 1,409 | 1,409 |
| fixed cost at `low` | 3,382 | 5,631 |
| first turn as billed, at `low` | 4,180 | 6,429 |
| a 40-turn session at `low`, against no plugin | -10.5% | +0.7% |
| a 295-turn session at `low` | -28.5% | -27.0% |
| a 40-turn session at `high` | -17.0% | -5.8% |
| a 295-turn session at `high` | -35.4% | -33.8% |

The first three rows are tiktoken counts (`o200k_base`), made the same way as for the other
builds. The 110 files behind these skills are about 86,000 tokens in all and are read a few
at a time.

**The session rows are a model, not a separate measurement.** The bench measured what the
rules add to the first turn and how much each level shortens an answer; those are the same
in this build, because the rules are the same. The rows above put this build's descriptions
into the same formula the README below uses for the others (500-token answers). This build
loads 2,249 more tokens of descriptions in every session: on a short session at `low` that
turns the small saving into a small cost. It pays for itself on long sessions, or when the coding commands are
actually used.

`atlas review` and `atlas fix` ship in every build except `atlas-min`, so they are
described in the README below.

## How far it has been tried

On 2026-10-04, Claude Code 2.1.283, on one small Python project made for the purpose:

| tried | result |
|---|---|
| `atlas review` (in every build) | read its method and the Python and error checklists; six findings in the line format, tiers and `outside` included |
| `atlas fix` (in every build) | read its method and the Python file, ran the suite through `atlas-runner`, fixed two errors, ended with `PASS` and the four counts |
| `atlas verify` | the six-row table and `CANNOT TELL`, because the passing tests did not cover the new code |
| `atlas docs: trace …` | the trace block, every line with a position |
| the hook, all three switches | a hard reset stopped with its reason; the first edit turned back once; the closing warning shown |
| one real Codex call with the flags `atlas multi` uses | answered; the answer on standard output |
| WCAG 2.2 figures in `atlas ui` | twenty-four criteria checked against the published text |
| hook unit tests | 24 pass |

Two things the trials showed that you should know:

- **Type the name.** Asked in plain words ("fix the build", "plan this"), Claude did the
  work without loading the skill, three times out of three. Named, the skill loaded four
  times out of four.
- **No pointer commands.** A command and a skill with the same name are one entry to
  Claude Code, and the command wins: the skill's instructions are never loaded. Since 0.1.6
  every build ships skills only, apart from the dial command; each is typed as
  `/atlas-code:<name>` or by its plain name.

**Not run at all:** `atlas test`, `atlas plan` by name, `atlas refactor`, `atlas ship`,
`atlas track` (no Jira or Linear account was available), `atlas publish`, `atlas ui`,
`atlas build-ai`, `atlas media` (Manim, Remotion and Blender were not installed),
`atlas multi` as a skill, `atlas context`, `atlas secure`, the Gemini command line, and
every language file except Python. Treat those as written and reviewed, not as tested.

## Where it comes from

The coding section was written after reading
[everything-claude-code](https://github.com/affaan-m/everything-claude-code) by Affaan
Mustafa (MIT licence), at commit `ef648e0`. Which topics matter, and several methods (the
proof a review finding needs, eval-first work on model features, the staged check before
publishing a private project), are that project's. The text is ours: each file was
written from scratch in the form the rest of ATLAS uses, and checked for runs of eight
words shared with the original; what the check still finds are compiler error messages,
two shell commands and a list of file extensions, which have one spelling. Of its 293 skills, 146 were merged into the seventeen
coding skills (fifteen here, two in every build); one more, `atlas-secure`, was written fresh for this build. 142 of ECC's skills were left out, and 5 are kept aside for later work.

---

# ATLAS

**Four dials for how a coding assistant talks to you, and seven subagents that keep the noisy work out of your conversation. A Claude Code plugin.**

Most of what an assistant writes is packaging: greetings, restatements, hedges, a summary of what it just said, an offer of what to do next. ATLAS removes the packaging and keeps every fact, and it does so on turn fifty as reliably as on turn one, because the rules are re-stated to the model on every message instead of once at the start.

It ships off. Nothing changes until you type `atlas low` or `atlas high`.

## What it does

**Compression** — `atlas low` drops filler, pleasantries, hedging, articles and the copula. `atlas high` halves the words: every fact stays, every explanation goes. Code, error strings, paths, numbers, negations and proper names are never touched at either level. Anything written for other people — commits, docs, pull requests, memory files — is written in ordinary prose whatever the dial says.

**Rigour** — `atlas ask` makes it clarify the goal before building: one question at a time, multiple choice where the options can be named, on every request and not only the first. Bounded tasks — a typo, a rename — are just done.

**Check** — `atlas check` works against invented facts: nothing from memory, primary sources first, its own work verified before it is called done, a second option looked for before recommending the first, a correction verified before it is accepted. "I did not find it" is never written as "it does not exist".

**Silent** — `atlas silent` hands over the result and stops: no narration between tool calls, no closing summary, no offer of what to do next. Three things are still said, one line each: an irreversible action before it happens, a task that cannot run as written, a result that is wrong.

All four persist across turns, restarts and projects until changed, and move independently: `atlas ask off` leaves the other three where they were.

**Seven subagents** do the expensive reading somewhere else and hand back only the answer: `atlas-finder` (where is X), `atlas-editor` (a bounded edit), `atlas-diff` (what is wrong with this diff), `atlas-runner` (run the tests, return the verdict), `atlas-browser` (does the page work, without a screenshot in your context), `atlas-research` (an answer with sources, or a reading list), `atlas-catalog` (is there a free API for this).

**Nine commands**: the dials, the reference card, `atlas-search` (an answer from a live search, or with "give me sources" a reading list), `atlas-review` (what is wrong with a diff, with a checklist for the languages in it), `atlas-fix` (a failing build, type check or linter back to green, one error at a time), `atlas-commit`, `atlas-recap` (a handover file so a new chat can continue where this one stopped), `atlas-organize` (tidies a folder with a plan first and an undo after; nothing is ever deleted), `atlas-silent`.

## Commands

| command | what it does |
|---|---|
| `/atlas:atlas` | set the dials |
| `/atlas:atlas-help` | the reference card |
| `/atlas:atlas-recap` | write a handover file for the conversation |
| `/atlas:atlas-search` | answer only from a web search; with "give me sources", where to read instead |
| `/atlas:atlas-review` | review a diff, a branch, a file or a pull request, with a checklist for the languages in it |
| `/atlas:atlas-fix` | get a failing build, type check or linter back to green |
| `/atlas:atlas-commit` | commit message for the staged changes |
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

## Three builds

| build | what is in it | fixed cost per session at `low` |
|---|---|---|
| `atlas` | everything | 3,382 tokens |
| `atlas-solo` | same rules, no subagents | 2,331 tokens |
| `atlas-min` | compression only: two levels, one command | 1,235 tokens |

`atlas` and `atlas-solo` carry byte-identical rules. The difference is whether the subagents exist, and whether their work stays out of your context.

A fourth build, `atlas-code`, is `atlas` plus a coding section: tests, verification, planning, shipping and more, fourteen further commands and an optional guard hook. It loads about twice the descriptions, and most of it has not been run on real projects yet. Its own README says what it adds, what it costs and what was tried.

## Measured

Every number below is measured, not estimated, and the unfavourable ones are printed with the rest. The compression tables were measured on 2026-09-26 with `claude-opus-5-5`, the CLI's default model, on the 0.1.3 rules. An earlier run on 2026-09-08 with `claude-sonnet-5` and the 0.1.0 rules is kept in `atlas-test/` (`cases/compression.*`) as history: Sonnet compressed more under every plugin, `atlas high` about 54% in English where Opus gives 46%, so figures from the two days are not comparable with each other. That older run also has a flaw found on 2026-09-26: Claude Code keeps only about 10 KB of a hook's output and hands the model a 2 KB preview of anything longer, silently. The 0.1.0 rules were over that size in every state but `low`, so the Sonnet rows for `high`, `ask` and `check` measured the first two kilobytes of the rules, not the rules. Since 0.1.4 the rules are injected in parts under the limit; the `check` rows below were generated after that fix and the billed input of every row is in the data, which is how the flaw was caught.

**Compression.** 24 English and 24 Italian questions, each carrying its own sheet of facts so that every setup answers with the same information and only the form can change. Each question was answered 2 times per setup in a fresh session through the real hooks; tokens are the API's own count of the visible answer, thinking excluded. "Details lost" is how many of the sheet's facts a reader can no longer learn from the answer, first by string match, then re-judged one by one by a model that is told nothing about what is being measured — the median across rounds, minus what the no-plugin answer already lost.

English:

| setup | output vs no plugin, median | worst … best round | details lost |
|---|---|---|---|
| `low` | -37% | -37% … -37% | 1 of 263 |
| `high` | -46% | -45% … -47% | 0 of 263 |
| `low` + `ask` | -36% | -33% … -38% | 1 of 263 |
| `low` + `check` | -38% | -38% … -38% | 0 of 263 |
| `low` + `ask` + `check` | -39% | -38% … -40% | 0 of 263 |
| `high` + `ask` | -46% | -46% … -46% | 0 of 263 |
| `high` + `check` | -47% | -47% … -48% | 1 of 263 |
| `high` + `ask` + `check` | -46% | -45% … -46% | 0 of 263 |
| `atlas-min` at `low` | -40% | -39% … -41% | 0 of 263 |
| `atlas-min` at `high` | -47% | -47% … -48% | 0 of 263 |

Italian:

| setup | output vs no plugin, median | worst … best round | details lost |
|---|---|---|---|
| `low` | -37% | -35% … -38% | 0 of 264 |
| `high` | -43% | -43% … -44% | 1 of 264 |
| `low` + `ask` | -38% | -38% … -38% | 0 of 264 |
| `low` + `check` | -34% | -34% … -34% | 0 of 264 |
| `low` + `ask` + `check` | -35% | -35% … -36% | 0 of 264 |
| `high` + `ask` | -43% | -43% … -44% | 1 of 264 |
| `high` + `check` | -42% | -42% … -42% | 1 of 264 |
| `high` + `ask` + `check` | -41% | -41% … -42% | 0 of 264 |
| `atlas-min` at `low` | -39% | -38% … -39% | 1 of 264 |
| `atlas-min` at `high` | -44% | -44% … -44% | 1 of 264 |

Run-to-run noise with no plugin and the rules frozen: 0.4 points in English, 0.6 in Italian. A gap smaller than that between two setups is not an effect.

**What a session costs against no plugin**, by build and setup: the fixed cost paid once, then per turn the reminder plus an answer shortened by that setup's own measured saving (mean of the two languages); a 500-token answer with no plugin; 40 turns and 295 turns, the average of the real transcripts this was tuned on. Negative is cheaper.

`atlas`

| setup | 40 turns | 295 turns |
|---|---|---|
| `low` | -11% | -28% |
| `high` | -17% | -35% |
| `low` + `ask` | -7% | -26% |
| `low` + `check` | -2% | -25% |
| `low` + `ask` + `check` | +1% | -24% |
| `high` + `ask` | -13% | -33% |
| `high` + `check` | -8% | -32% |
| `high` + `ask` + `check` | -2% | -29% |

`atlas-solo`

| setup | 40 turns | 295 turns |
|---|---|---|
| `low` | -16% | -29% |
| `high` | -22% | -36% |
| `low` + `ask` | -12% | -27% |
| `low` + `check` | -7% | -26% |
| `low` + `ask` + `check` | -4% | -25% |
| `high` + `ask` | -18% | -34% |
| `high` + `check` | -13% | -33% |
| `high` + `ask` + `check` | -8% | -30% |

`atlas-min`

| setup | 40 turns | 295 turns |
|---|---|---|
| `low` | -25% | -33% |
| `high` | -29% | -38% |

**Fixed cost per session**, `atlas` build: 1,409 tokens of rules at `low`, 1,531 at `high`, plus 1,973 of skill, command and subagent descriptions that are loaded whether or not they are used. The per-turn reminder is 27–32 tokens; over a long session it is the largest number of all.

| | tokens per session |
|---|---|
| rules injected at `low` (default) | 1,409 |
| rules injected at `high` | 1,531 |
| skill, command and subagent descriptions, always present | 1,973 |
| per-turn reminder | 27-32 |
| **total at the default** | **3,382** |

Those are tiktoken counts. **What the API actually bills** was measured on the bench too: the input of a one-turn call with each setup on, minus the same call with no plugin, median over the 48 questions. The rules and the reminder at `low` come to 2,207 tokens billed against 1,436 counted, a ratio of 1.54; the session tables above use the billed figure for the injected text and tiktoken for the descriptions, which the bench cannot separate from the rest of the prompt.

The `atlas-min` build cuts the descriptions to 153 and the rules to 1,082 by shipping only
the compression sections. `atlas-solo` keeps every rule and drops the seven subagents: 922 in
descriptions instead of 1,973. It also drops `atlas-search`, which is a handle on a
subagent it does not carry — the search discipline itself lives in the `check` dial, where it
covers every answer rather than one command.

**On a long session the per-turn reminder outweighs everything above it.** At 27 tokens a
turn, over a 295-turn session — the average measured on real transcripts — that is 7,965
tokens, about twice the rest put together. It was 42 until 0.1.2: the shorter wording was
measured against the longer one on the same day and compressed identically. The rules were cut
from 2,165 to 1,409 tokens in 0.1.3 the same way: examples and reasons out, every rule kept; measured
on the same day, two rounds, the compact rules compress 1.6 points less in English and 1.7 in
Italian, within two points of the run-to-run noise, for a thousand tokens less in every chat.

**The rules arrive in parts since 0.1.4.** Claude Code keeps about 10 KB of one hook's output; above that it saves the text to a file and gives the model a 2 KB preview, with no warning to anyone. With `check` on the rules are 10-13 KB, so until 0.1.4 a session with that dial on ran on the first two kilobytes of them — no provenance marker, no second pass, no verification — while the reminder kept naming rules the model had never seen. The session-start hook is now registered three times and each call prints one slice, cut at section boundaries, the largest 7,298 bytes. Nothing in the rules changed. It was caught by the billed input in the bench data: the `check` rows cost less than `low` alone.

Token counts for the fixed costs are tiktoken (`o200k_base`), an approximation of Claude's tokenizer, except where a line says "billed"; the compression figures come from the API's own counts. Compare them with each other, not with a bill.

## Getting the most out of it

Everything below follows from the measurements above. None of it is required; each line says what it buys.

**Pick the level by the reader, not by the task.** `high` when you read the answer once and act on it. `low` when you re-read, paste it somewhere, or someone else reads it: the token gap between the two is a few points, the readability gap is not.

**Long sessions are where it pays.** The fixed cost is paid once per chat. Ten chats of five turns pay it ten times; one chat of fifty turns pays it once. Keep working in the same chat and use `atlas-recap` when it has to end, so the next one starts with the state instead of the story.

**Turn on `ask` for open-ended work, off for bounded work.** It earns its cost when the goal can move: a new feature, a refactor, a design. On a typo or a rename it is a question you did not need.

**Turn on `check` for facts, off for code you can run.** Versions, prices, APIs, how someone else's software behaves: on. A function you will test in the next minute: off, the test is the check.

**`silent` for batches.** A list of mechanical changes, a migration, anything where you will read the diff and not the prose.

**Delegate what is bigger than its answer.** A test log, a screenshot, a catalogue, a hundred-file search: send it to the subagent and pay for the verdict. Read directly what you will need to see anyway.

**Write the request with the constraint in it.** "In under 50 lines", "only the failing test", "one option, not a comparison": the model follows a stated bound better than any rule about brevity, and the bound costs you a few words.

**Every plugin you install costs its descriptions in every chat, on or off.** Count them once: this one is 1,973 tokens on the full build, 922 without the subagents, caveman 2.7.0 1,281, a large toolkit can be 30,000. Remove what you have not used in a month.

**`atlas-min` when tokens are the only thing you want.** Same compression rules, one command, no subagents, 153 tokens of descriptions: measured against caveman 2.7.0 on the same day, at `high` it compresses 19 points more per answer than caveman `ultra`, and over 295 turns its best setup is 26 points cheaper than caveman.

**Memory files in English.** They load at every start; the tokenizer reads English about a third cheaper than Italian and cheaper still than most other languages. Write `MEMORY.md` in English even if you talk to the model in your own.

**Put project names in `atlas-terms.txt`.** One per line: never compressed, never translated, never abbreviated.

**Pin a project's dials in `.atlas.json`** when the same repository always wants the same setup, and leave the per-project state for everything else.

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
- **Short sessions pay less.** The fixed cost is paid before the first answer, so on the `atlas` build a 40-turn session saves 0–17% where a 295-turn one saves 24–35%. A session of a handful of turns with short answers may not pay at all.
- **The per-turn reminder scales with turns.** Over 295 turns it costs more than the whole session-start injection. It is as short as it can be while still naming rules.
- **`check` adds tokens by design.** Verifying means looking things up. It is the one dial that costs more than it saves in tokens; it is paid for by the compression running underneath it.
- **`ask` cannot know what you have not said.** It reduces wrong assumptions; it does not remove them.
- **English commands, English hook phrases.** Requests in any language are recognised by the model, but the phrases the hook matches by itself ("stop atlas", "normal mode") are English. `atlas off` is a name and works everywhere.
- **The state is per project, keyed by the folder a session runs in** (walked up to the nearest `.git` or `.atlas.json`). Two checkouts of the same repository are two settings; a folder with no `.git` is its own project. It was one global setting until 0.1.4, and that setting followed you into every project. Stored outside the plugin, so uninstalling does not reset it.
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
| `~/.claude/atlas-state/<project>.state` | the four dials of one project, e.g. `high:ask:on:off` |
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
restarts, for the project you typed it in. Removing the plugin does not touch it: delete the
`~/.claude/atlas-state/` folder by hand if you want no trace left.

## Tests

```bash
npm test
```

`tests/prompts.json` holds twenty-five behavioural prompts, written before the rules they test.
Those need a model to run; `npm test` covers what a machine can judge on its own.

## Licence

MIT.
