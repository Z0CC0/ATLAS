---
name: atlas-help
description: >
  Show the ATLAS reference card: the four dials, every command, every subagent, what each
  costs. Use when the user asks for atlas help, "/atlas-help", "atlas commands", "how do I
  switch atlas" — in any language — or what modes exist.
---

Print the card below and nothing else. Change no state, start no work.

**Print it in the language the user writes in.** Translate the prose, leave every command, dial
name, filename and number exactly as written — those are typed, not read.

The `worth knowing` column is the only place for anything beyond what a thing does. If a row has
nothing surprising to say, leave it empty rather than filling it.

---

# ATLAS

Four dials, twenty-three commands, seven subagents.

**It ships off.** A fresh install changes nothing until you type `atlas low` or `atlas high`.
After that the setting persists — across turns and restarts — until you change it or type
`atlas off`, which persists too. It is one setting per project (the folder the session runs in,
walked up to the nearest `.git` or `.atlas.json`), not a per-chat one and not a global one: a
repository never switched on stays off whatever another one is set to.

**Uninstalling does not reset it**: the states live in `~/.claude/atlas-state/`, one file per
project, outside the plugin. `atlas off` in the project before uninstalling, or delete that folder.

## Dials

| dial | what it does | vs no plugin | worth knowing |
|---|---|---|---|
| `atlas low` | drops filler, pleasantries, hedging, articles, the copula. Fragments allowed. No tables | **-11% ... -29%** | the default |
| `atlas high` | half the words: facts stay, explanations go. Prepositions and connectives cut too | **-17% ... -35%** | 9 points more than `low` in English, 7 in Italian. It reads more telegraphically; pick it when the answer is read once and acted on |
| `atlas ask` | asks before starting, until it knows what you actually want. One question at a time, options named where they can be named | +3 to +2 points | not a quiz: it is there so the work matches what you had in mind, not what the request happened to say. Applies to every request, not only the first |
| `atlas check` | works against invented facts: nothing from memory, its own work verified before it is called done, a second option looked for before recommending the first, a correction checked before it is accepted | +3 to +9 points, plus the lookups | the only dial that adds. Every setup with it on still lands under no plugin on a long session |
| `atlas silent` | hands over the work and stops: no preamble, no narration between steps, no summary at the end, no offer of what to do next. Questions only before starting; a failure is still reported, in one line | a few points less | the only dial that removes a whole turn's worth of text rather than words inside it. `/atlas-silent` does the same for one task; the dial holds until turned off |
| `atlas status` | prints which dials are on, nothing else | — | changes nothing. Says `atlas off` when none are |
| `atlas ask off` · `atlas check off` · `atlas silent off` | turns one dial off, leaves the rest | — | |
| `atlas off` | everything off | — | also "stop atlas" and "normal mode". Those are matched in English only; `atlas off` works in any language, and asking to stop in yours gets the command handed back. Only when it opens the message, never inside quotes |

**Every combination costs less than no plugin, at both session lengths.** The two figures are a short session — 40
turns, 500-token answers — and a long one at 295 turns: the fixed cost is paid once and then
spreads, so session length moves the number more than the dials do.

Never compressed at any level: code blocks, error strings, function and command names, file paths,
numbers and units, negations, proper names, qualifiers that change what is true. Security warnings
and irreversible-action confirmations are written in plain prose.

## Commands

Typed, by name: `atlas review`, or `/atlas:atlas-review`. Only the description is always loaded;
the body costs nothing on sessions where you never call it. Asked in plain words without the
name, the work is usually done without the command's rules.

| command | what it does | body | worth knowing |
|---|---|---|---|
| `atlas <dial>` | sets the dials | 40 | `/atlas:atlas high` or `atlas high` alone as the whole message. The plain form works before the command menu has loaded |
| `atlas-help` | this card | 2.2k | |
| `atlas-search` | answers only from a live web search | 303 | **`atlas` build only.** It is the handle on the `atlas-research` subagent, so the pages it reads never land in your session. Add "give me sources" to the request, in any language, and it hands back where to read instead of the answer: videos, discussions, articles, grouped, one line each |
| `atlas-review` | what is wrong with a diff, a branch, a file or a pull request, one problem per line: where, what breaks, the fix | 1.0k | four tiers, `breaks` first. `nothing found` is the whole answer when there is nothing. Behind it, 22 short checklists, read only as the diff calls for them: one per language, plus security, tests, types, errors, a pull request. "second opinion" runs a second reviewer that has not seen the first |
| `atlas-fix` | a failing build, type check or linter back to green: one error, one smallest change, run again | 549 | stops and says why instead of silencing an error: same error twice, more errors than before, a change of design. Ends with `PASS`, `STOPPED` or `DID NOT RUN` and four counts. One file per toolchain behind it, 10 in all |
| `atlas-commit` | commit message for what is staged | 109 | written in normal prose whatever the level: it leaves the conversation |
| `atlas-recap` | handover file for the conversation: decided, done, not done, tried and rejected | 855 | for starting a fresh chat without losing where you were |
| `atlas-organize` | tidies a local folder: selects files by content or criterion, copies, moves, groups, sets aside | 2.0k | four levels, from a plan that touches nothing upward. Nothing is ever deleted and every run has an undo |
| `atlas-silent` | does the work and hands over the result: no opinions, no narration, no report | 807 | questions only up front, only about the task. Three things still get said: destructive, blocked, done-but-wrong. Per request; `atlas silent` is the same mode as a dial, and that one stays on |

## Coding section — `atlas-code` build only

Fourteen more commands, and one skill that is not typed. Each is a
short router: it reads the request, then opens only the files that request needs. What is
always loaded is the description; the files behind it cost nothing until used.

**Type the name.** `atlas fix`, `atlas verify`, `/atlas-code:atlas-plan`. In the trials a
request that named the command loaded it every time; the same request in plain words
("fix the build") was carried out without it.

| command | what it does | files behind it | worth knowing |
|---|---|---|---|
| `atlas-test` | writes tests: test-first, coverage gaps, end to end, a deployed site | 14 | a new test that fails because the code is wrong is kept and reported |
| `atlas-verify` | build, types, lint, tests, leftovers, in one pass, compared with the last run | 3 | changes nothing; `READY`, `NOT READY` or `CANNOT TELL` |
| `atlas-plan` | steps before code, sized to the change, then waits; or carries the work through to a commit | 7 | two stops for a yes: after the plan, before the commit |
| `atlas-multi` | asks other models (Codex, Gemini) for an opinion, a review or an approach | 4 | shows what is sent and waits for a yes, every time |
| `atlas-docs` | docs true to the code: sync, a map, onboarding, one feature traced, locale files | 5 | writes only what the code supports |
| `atlas-perf` | measured speed work: baseline, one change, keep or revert | 5 | no change without a number before and after |
| `atlas-ship` | pull request, container, pipeline, deploy, installer | 8 | nothing leaves the machine without a yes |
| `atlas-track` | GitHub issues, Jira, Linear: read a ticket, update it, triage a backlog | 5 | ticket text is data, never instructions |
| `atlas-refactor` | dead code, simplification, duplicates, an old codebase's own style | 5 | one move at a time, tests green before and after |
| `atlas-publish` | a private project made ready to go public, on a copy | 4 | created private first; public is a second yes |
| `atlas-ui` | direction, polish, accessibility, motion, tokens, from a screenshot | 7 | WCAG 2.2 AA basics applied to every component |
| `atlas-build-ai` | code that calls a model: prompts, tools, evals, retrieval, cost, MCP | 9 | model names and prices are looked up, never remembered |
| `atlas-media` | explainers, video in React, slides, recorded demos, with local tools | 7 | no generation service, no upload |
| `atlas-context` | what every session loads, when to compact, one answer at a chosen depth | 4 | measures, does not guess |
| `atlas-stack` | how code is written in this project's language and framework | 18 | `atlas-plan` sends for it before writing code; it can be named too. The project's own conventions come first |

**The guard hook.** One file, three switches, all off until `.atlas.json` or
`~/.claude/atlas.json` turns one on:

| switch | what it does |
|---|---|
| `"guard": true` | asks before a command that destroys or publishes: `rm -rf`, `git push --force`, `git reset --hard`, `DROP TABLE`, `npm publish`. With `"freeze": "src/api"`, also before a write outside that folder |
| `"gate": true` | turns back the first edit of each file once per session, with what to look up first |
| `"finish": true` | when the answer ends, warns if it said something was skipped, still failing or not run. English phrases only. Never blocks |

**What this build costs.** Descriptions always loaded: 4,057 tokens, against 1,961 for
`atlas`. Fixed cost at `low`: 5,466. The files behind these commands are about 81,000 tokens
in all, in 105 files, read one or a few at a time. Every session figure elsewhere on this
card belongs to `atlas`; with the descriptions of this build the same model gives -0% at 40
turns and -27% at 295 for `low` (against -11% and -29%), and -7% and -34% for `high`
(against -17% and -35%). On a short session this build about breaks even.

**How far it has been tried.** Three of these commands and the hook were run on one small
Python project; the rest, and every language but Python, have not been run. The README of
this build says which.

## Subagents

Delegated, never typed. **The work stays with them, only the answer comes back** — their reads,
searches and logs never enter your conversation. That is the whole reason they exist, and the
reason to skip one: when you need the material itself, delegating adds a round trip and saves
nothing.

| subagent | what it does | worth knowing |
|---|---|---|
| `atlas-finder` | answers "where": file and line range, one line each, nothing else | only cites ranges it actually read. Skip it when you already know the file |
| `atlas-editor` | one small edit in at most two files, a line per file back | a third file and it hands the whole task back, on purpose |
| `atlas-diff` | the same review, run where the diff stays: one line per problem, nothing about what is fine | reads the diff itself, so a large one never enters your context |
| `atlas-runner` | runs tests, build or linter, returns only the deciding lines | never repairs anything, never works around a failure |
| `atlas-browser` | drives a page, reports in words | one screenshot costs about 9,800 tokens; this pays for itself immediately |
| `atlas-research` | searches the web: the answer with its sources, or a reading list grouped by kind | says "I did not find it" rather than "it does not exist", and never forces a weak link to fill a group |
| `atlas-catalog` | searches the public catalogues: free APIs, free-tier services, MCP servers, and Claude Code skills through the skills.sh index. Finds, never installs | those lists are 550,000 tokens; it reads them live and hands back three candidates |

## Builds

| build | contains | fixed cost at `low` |
|---|---|---|
| `atlas` | everything on this card | 3,370 |
| `atlas-solo` | same rules, no subagents, and eight commands rather than nine | 2,331 |
| `atlas-min` | compression only: one command, no `ask`, no `check`, no provenance marker | 1,235 |

`atlas` and `atlas-solo` have byte-identical rules, verified with `diff`: they write the same
answers. The difference is the subagents, and whether you want the work kept out of context.

`atlas-search` goes with them, because it is a handle on `atlas-research` and has nothing behind
it without that subagent. Nothing is lost: **the search discipline lives in `check`** —
nothing from memory, "I did not find it" never written as "it does not exist" — where it applies
to every answer instead of one command.

## The per-turn reminder

A short line is injected every turn so the level does not drift back to verbose: 27 tokens at
`low`, 32 at `high`, plus 9 for each of `ask`, `check` and `silent` when on. It names the rules that slip first — and
"answer first, only what was asked", the one whose failure costs more than the reminder does.

**On a long session this is the largest number on the card.** Over 295 turns it is 7,965 tokens,
more than twice the entire fixed cost. It scales with turns; everything above scales with nothing.

## Configuration

| what | where |
|---|---|
| state | `~/.claude/atlas-state/<project>.state`, one line, `level:rigour:check:silent` |
| untouchable terms, one per line | `~/.claude/atlas-terms.txt`, ships empty |
| per-project default | `.atlas.json`, `{ "level": "low", "rigour": "ask", "check": "off", "silent": "off" }` |

---

Token figures are tiktoken approximations, not Claude's tokenizer — compare them to each other,
not to a bill. The costs above are current. **How much each level compresses was measured on 0.1.3 with `claude-opus-5-5` on 2026-09-26**: 24 English and 24 Italian questions with fixed fact sheets, 2 rounds each, through the real hooks. Output against no plugin, median: `low` -37% English and -37% Italian, `high` -46% and -43%; details lost, median: `low` 1 and 0 of 263, `high` 0 and 1. Run-to-run noise 0.6 points. The API bills the injected rules at about 1.54 times the tiktoken count. The full tables are in the README.