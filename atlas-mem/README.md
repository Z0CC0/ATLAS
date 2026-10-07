# atlas-mem

Everything in `atlas`, plus a memory that notices when it has become false. This page covers
what the build adds. Everything below the line is the README of `atlas` itself, and its
measurements are about `atlas`, not about this build.

## What it adds

One command, `atlas memory`, in four modes chosen by the words of the request:

| type this | and it |
|---|---|
| `atlas memory, remember that …` | writes one note for one fact, in the vault's own format, and links it to the code it describes when it describes code |
| `atlas memory, what did we decide about …` | finds the right note and returns it whole, saying whether the code it describes has changed since |
| `atlas memory, is it still true?` | checks every note linked to code against the code as it is now and reports: `firm`, or `suspect` with the reason |
| `atlas memory, tidy` | duplicates, orphans, a broken index; nothing deleted without a yes |

Nothing is written to memory automatically. A note is created when the work decides a fact
is worth keeping: a decision made, a correction given, a constraint stated. This keeps the
memory small and every note true, which is what makes the check meaningful.

## How a note knows it is stale

The memory is a folder of markdown notes, one fact per file, with a short index. That part
already exists in most setups and is not replaced. The build adds a tool, `tools/memcheck.mjs`,
and a sidecar file beside the notes, `<vault>/.atlas/links.json`, that the tool alone reads and
writes. For a note about code it records which repository, which file, which definition, a
fingerprint of those lines, the commit, and what that code directly depends on in the same
repository. At check time the tool parses the file again and decides:

| state | meaning | effect on the note |
|---|---|---|
| held | the lines are exactly what they were | firm |
| moved | the same code at other lines, or in another file | firm; `--write` records where |
| changed | the definition is there, its code is different | suspect |
| dep-changed | the code is intact, but a function it calls or a constant it reads changed | suspect |
| renamed | the same body under another name | suspect; the report says the new name |
| gone / missing | the symbol, or its file, is nowhere in the repository | suspect |

A `suspect` note is still returned when asked for, with the caveat; nothing decides for you
whether the fact survived the change. A note whose code is put back as it was returns to
`firm` at the next check by itself. The body of a note is never changed by a check.

Parsing uses tree-sitter grammars compiled to WebAssembly, shipped in `tools/wasm/` (22 MB,
MIT, from the `@vscode/tree-sitter-wasm` package): JavaScript, TypeScript, TSX, Python, Go,
Rust, Java, C#, C/C++, Ruby, PHP, Bash, PowerShell. Any other language falls back to a search
for a definition-shaped line, with the limits stated in the skill.

## The code graph

`tools/codegraph.mjs` is the second tool: the graph of the code across every project under
one folder. `node codegraph.mjs scan <root> --out graph.json` parses every source file once
and records files and imports, top-level symbols and calls inside each project, duplicates
(identical text, or the same shape with other names: a renamed copy) inside and across
projects, and uncalled symbols graded certain / probable / uncertain from the list of what a
static graph cannot see. `report`, `dups [--cross]`, `hubs [project]`, `dead [project]`
read the JSON back. Projects declared as a porting of one another (`--porting "A|B"`) keep
their duplicates marked and out of the counts. Measured on twelve projects: 665 files,
208,000 lines, 12,500 symbols in 20 seconds. It never changes a source file.

## Harvest: filling the memory from what already exists

`tools/harvest.mjs` is the third tool. `harvest extract <claude-projects> --out <dir>` reads
every past Claude Code session (one JSONL each; benchmark and scratch folders skipped, tiny
sessions skipped) and keeps, per session, the first request, the user's messages that read
like a decision, a rule or a correction, and the assistant's paragraphs that state one: a
few kilobytes per session instead of megabytes. `harvest docs <root> --out <dir>` collects
the projects' markdown documents. A model turns each extract into candidates (the prompt is
`tools/harvest-prompt.md`; the vault's existing notes are listed in it so they are not
restated); `harvest inbox write <vault> <candidates.json>` files them in
`<vault>/.atlas/inbox/`, skipping what the vault or the inbox already says in other words.
`inbox list`, `inbox accept <slug>` (the file becomes a note, one line goes into the index)
and `inbox reject <slug>` (removed, and its source hash remembered so it never comes back).
Nothing enters the vault without that yes. Measured on this machine: 39 real sessions and 67
documents extracted in under two seconds; the model pass at about 0.1 $ per source.

Three more things, all deterministic: `codegraph` records what a class extends or
implements (`inherits` edges) and answers `impact <graph> <project> <symbol> [--depth 2]`
with the blast radius, what calls or inherits from a symbol and then what calls those;
`memcheck check --write` records for every note which other notes touch the same code
(`related`: same symbol, a shared dependency, the same file), the link the code implies
without touching a wikilink; `harvest pairs <vault>` lists the notes that share enough words
to be read side by side, and `harvest verdicts write|list` keeps what a model or a person
decided about each pair (the same thing, a contradiction, neither). The prompt for that
judgement is `tools/pairs-prompt.md`.

## Two optional layers

`tools/embed.mjs`: search by meaning. `embed index <vault>` turns every note (name,
description, body, `<private>` spans removed) into a vector with a small multilingual model
that runs on this machine, re-embedding only what changed; `embed search <vault> "<query>"`
returns the nearest notes with a score; `embed status`. The model
(`Xenova/paraphrase-multilingual-MiniLM-L12-v2`, about 130 MB) is downloaded once into
`~/.atlas/models` (or `ATLAS_MODELS`); nothing leaves the machine. Measured: 70 notes
indexed in 5 seconds; a query in well under a second. Needs `@huggingface/transformers`.

`tools/lsp.mjs`: live references. `lsp refs <project-root> <file> <line> <symbol>` starts
`typescript-language-server` or `pyright-langserver` through this same Node, opens the file
and asks who references the definition: types and imports resolved, the code as it is now.
Measured: a JavaScript symbol in 0.5 s; a Python symbol in a 200-file project in 20 s, with
104 references where the static graph counted 53 callers. `lsp check` says which servers
this machine has. Needs `typescript-language-server` (with `typescript`) and/or `pyright`.

Both packages are looked for next to the tools, then in `ATLAS_NODE_MODULES`, then in the
global npm folder; `npm install @huggingface/transformers typescript-language-server
typescript pyright` in any of those places is enough. Without them, everything else works
and the tools say what is missing.

## What it costs

| | tokens |
|---|---|
| the description, loaded every session | 119 |
| the five files behind it, read when the command is used | 4,714 |

The tool is local and takes under a second on a vault of a dozen linked notes; its output is
a few lines. Loading all sixteen grammars takes about 90 ms.

## What was tried

The five tools have 91 tests (`node --test tests/memcheck.test.mjs tests/parse.test.mjs
tests/relocate.test.mjs tests/deps.test.mjs`). The command was run as a skill in two real
sessions on a copy of a vault: a check that found a stale note and put the question in one
line, and a write that produced a correct note with two code links taken from the parse. Both
cost between one and two dollars at the CLI's default model, most of it reading notes.

Not seen, by design or not yet: a change in a library the code uses; a method reached through
an object (`obj.method()`); a change two calls away; a symbol renamed and rewritten in the
same step (reads as `gone`). Whether the application that manages the vault ignores the
`.atlas` folder beside the notes was not verified against every such application.

## Limits

The vault is yours and stays in your format; the tool never edits a note. A note linked to
code that is not on this machine is reported as not checked, never as broken. Nothing leaves
the machine.

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

A fifth, `atlas-mem`, is `atlas` plus a memory: notes you write by hand, one fact per file, linked to the code they describe and flagged as suspect when that code changes. One more command (119 tokens of description) and a local tool with tree-sitter grammars for thirteen languages, 22 MB of WebAssembly, which is why it is its own build. Its README says how a note knows it is stale and what the check cannot see.

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
