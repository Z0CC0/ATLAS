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

Four dials, six commands, two subagents.

**It ships off.** A fresh install changes nothing until you type `atlas low` or `atlas high`.
After that the setting persists — across turns and restarts — until you change it or type
`atlas off`, which persists too. It is one setting per project (the folder the session runs in,
walked up to the nearest `.git` or `.atlas.json`), not a per-chat one and not a global one: a
repository never switched on stays off whatever another one is set to.

**Uninstalling does not reset it**: the states live in `~/.claude/atlas-state/`, one file per
project, outside the plugin. `atlas off` in the project before uninstalling, or delete that folder.

## Dials

| dial | what it does | vs no plugin, visible tokens | worth knowing |
|---|---|---|---|
| `atlas low` | drops filler, pleasantries, hedging, articles, the copula. Fragments allowed. No tables | **-11% ... -28%** | the default |
| `atlas high` | half the words: facts stay, explanations go. Prepositions and connectives cut too | **-17% ... -35%** | 9 points more than `low` in English, 7 in Italian. It reads more telegraphically; pick it when the answer is read once and acted on |
| `atlas ask` | asks before starting, until it knows what you actually want. One question at a time, options named where they can be named | +3 to +2 points | not a quiz: it is there so the work matches what you had in mind, not what the request happened to say. Applies to every request, not only the first |
| `atlas check` | works against invented facts: nothing from memory, its own work verified before it is called done, a second option looked for before recommending the first, a correction checked before it is accepted | +3 to +9 points, plus the lookups | the only dial that adds. Every setup with it on still lands under no plugin on a long session |
| `atlas silent` | hands over the work and stops: no preamble, no narration between steps, no summary at the end, no offer of what to do next. Questions only before starting; a failure is still reported, in one line | a few points less | the only dial that removes a whole turn's worth of text rather than words inside it. `/atlas-silent` does the same for one task; the dial holds until turned off |
| `atlas status` | prints which dials are on, nothing else | — | changes nothing. Says `atlas off` when none are |
| `atlas ask off` · `atlas check off` · `atlas silent off` | turns one dial off, leaves the rest | — | |
| `atlas off` | everything off | — | also "stop atlas" and "normal mode". Those are matched in English only; `atlas off` works in any language, and asking to stop in yours gets the command handed back. Only when it opens the message, never inside quotes |

**In visible tokens, every combination costs less than no plugin at 295 turns**; at 40 turns `low` + `ask` + `check` is +1%. Billed output, thinking included, is another matter: `low` +2% English and +5% Italian, `high` -25% and -18%. The two figures are a short session — 40
turns, 500-token answers — and a long one at 295 turns: the fixed cost is paid once and then
spreads, so session length moves the number more than the dials do.

Never compressed at any level: code blocks, error strings, function and command names, file paths,
numbers and units, negations, proper names, qualifiers that change what is true. Security warnings
and irreversible-action confirmations are written in plain prose.

## Commands

Typed, by name: `atlas recap`, or `/atlas:atlas-recap`. Only the description is always loaded;
the body costs nothing on sessions where you never call it (bodies: tiktoken cl100k). Asked in plain words without the
name, the work is usually done without the command's rules.

| command | what it does | body | worth knowing |
|---|---|---|---|
| `atlas <dial>` | sets the dials | 40 | `/atlas:atlas high` or `atlas high` alone as the whole message. The plain form works before the command menu has loaded |
| `atlas-help` | this card | 2.6k | |
| `atlas-search` | answers only from a live web search; asked what people say, also open forums and what search engines show of social networks, with what was not looked at | 624 | **Not in `atlas-min`.** It is the handle on the `atlas-research` subagent, so the pages it reads never land in your session. Add "give me sources" to the request, in any language, and it hands back where to read instead of the answer: videos, discussions, articles, grouped, one line each |
| `atlas-recap` | handover file for the conversation: decided, done, not done, tried and rejected | 952 | for starting a fresh chat without losing where you were |
| `atlas-organize` | tidies a local folder: selects files by content or criterion, copies, moves, groups, sets aside | 2.2k | four levels, from a plan that touches nothing upward. Nothing is ever deleted and every run has an undo |
| `atlas-silent` | does the work and hands over the result: no opinions, no narration, no report | 968 | questions only up front, only about the task. Three things still get said: destructive, blocked, done-but-wrong. Per request; `atlas silent` is the same mode as a dial, and that one stays on |

## Subagents

Delegated, never typed. **The work stays with them, only the answer comes back** — their reads,
searches and logs never enter your conversation. That is the whole reason they exist, and the
reason to skip one: when you need the material itself, delegating adds a round trip and saves
nothing.

| subagent | what it does | worth knowing |
|---|---|---|
| `atlas-browser` | drives a page, reports in words | one screenshot costs about 9,800 tokens; this pays for itself immediately |
| `atlas-research` | searches the web: the answer with its sources, or a reading list grouped by kind; in catalogue mode the public catalogues (free APIs, free tiers, MCP servers, skills, plugins, hooks), three candidates back, never installs | says "I did not find it" rather than "it does not exist", and never forces a weak link to fill a group; the catalogues are 550,000 tokens and never enter your context |

## Builds

| build | contains | fixed cost at `low` |
|---|---|---|
| `atlas` | the dials, six commands, the research and browser subagents | 2,232 |
| `atlas-min` | compression only: one command, no `ask`, no `check`, no provenance marker | 1,085 |
| `atlas-code` | `atlas` plus coding and documents: review, fix, plan, test, ship, spec, changelog and the rest | 5,752 |
| `atlas-mem` | `atlas` plus review, fix and commit, a memory and a reader of shipped programs | 3,101 |
| `atlas-video` | `atlas` plus video: written with a framework on this machine, or recorded from the screen | 2,462 |
| `atlas-max` | everything: `atlas-code`, `atlas-mem` and `atlas-video` together. Install it instead of those two, never beside them: two builds inject the rules twice | 6,275 |

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
not to a bill. The fixed costs above are counted by `atlas-test/fixed-costs.mjs`. **How much each level compresses was measured on an earlier revision of the rules with `claude-opus-5-5` on 2026-09-26**: 24 English and 24 Italian questions with fixed fact sheets, 2 rounds each, through the real hooks. Output against no plugin, median: `low` -37% English and -37% Italian, `high` -46% and -43%; details lost, median: `low` 1 and 0 of 263, `high` 0 and 1. Run-to-run noise 0.6 points. The API bills the injected rules at about 1.54 times the tiktoken count. The full tables are in the README.