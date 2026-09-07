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

Four dials, thirteen commands, ten subagents.

**It ships off.** A fresh install changes nothing until you type `atlas low` or `atlas high`.
After that the setting persists — across turns, across restarts, in every project — until you
change it or type `atlas off`, which persists too. It is one global setting, not a per-chat one.

**Uninstalling does not reset it**: the state lives in `~/.claude/.atlas-state`, outside the plugin.
`atlas off` before uninstalling, or delete that file.

## Dials

| dial | what it does | vs no plugin | worth knowing |
|---|---|---|---|
| `atlas low` | drops filler, pleasantries, hedging, articles, the copula. Fragments allowed. No tables | **-17% ... -38%** | the default |
| `atlas high` | half the words: facts stay, explanations go. Prepositions and connectives cut too | **-16% ... -38%** | a few points from `low`: 3 in English, none in Italian. It reads more telegraphically than it saves |
| `atlas ask` | asks before starting, until it knows what you actually want. One question at a time, options named where they can be named | +4 to +5 points | not a quiz: it is there so the work matches what you had in mind, not what the request happened to say. Applies to every request, not only the first |
| `atlas check` | works against invented facts: nothing from memory, its own work verified before it is called done, a second option looked for before recommending the first, a correction checked before it is accepted | +8 to +11 points, plus the lookups | the only dial that adds. Every setup with it on still lands under no plugin on a long session |
| `atlas silent` | hands over the work and stops: no preamble, no narration between steps, no summary at the end, no offer of what to do next. Questions only before starting; a failure is still reported, in one line | a few points less | the only dial that removes a whole turn's worth of text rather than words inside it. `/atlas-silent` does the same for one task; the dial holds until turned off |
| `atlas status` | prints which dials are on, nothing else | — | changes nothing. Says `atlas off` when none are |
| `atlas ask off` · `atlas check off` · `atlas silent off` | turns one dial off, leaves the rest | — | |
| `atlas off` | everything off | — | also "stop atlas" and "normal mode". Those are matched in English only; `atlas off` works in any language, and asking to stop in yours gets the command handed back. Only when it opens the message, never inside quotes |

**Every combination costs less than no plugin, at both session lengths.** The two figures are a short session — 40
turns, 500-token answers — and a long one at 295 turns: the fixed cost is paid once and then
spreads, so session length moves the number more than the dials do. `atlas-optimize` computes it
from your own sessions instead of these two profiles.

Never compressed at any level: code blocks, error strings, function and command names, file paths,
numbers and units, negations, proper names, qualifiers that change what is true. Security warnings
and irreversible-action confirmations are written in plain prose.

## Commands

Typed. Only the description is always loaded; the body costs nothing on sessions where you never
call it.

| command | what it does | body | worth knowing |
|---|---|---|---|
| `atlas <dial>` | sets the dials | 40 | `/atlas:atlas high` or `atlas high` alone as the whole message. The plain form works before the command menu has loaded |
| `atlas-help` | this card | 2.5k | |
| `atlas-optimize` | reads your own sessions, prints the whole setup table, and says what each setup costs as a percentage | 1.9k | also reports what your memory files would cost in English, measured. It advises, it never translates them |
| `atlas-search` | answers only from a live web search | 277 | **`atlas` build only.** It is the handle on the `atlas-research` subagent, so the pages it reads never land in your session — and without that subagent there is nothing behind it |
| `atlas-sources` | where to go and read about a topic, instead of an answer: videos, discussions, articles, grouped, one line each | 93 | **`atlas` build only**, same reason. Same subagent, other shape: typing one of the two is what picks it, so neither guesses and neither asks |
| `atlas-review` | what is wrong with the current diff, one problem per line: where, what breaks, the fix | 223 | four tiers, `breaks` first. `nothing found` is the whole answer when there is nothing |
| `atlas-commit` | commit message for what is staged | 109 | written in normal prose whatever the level: it leaves the conversation |
| `atlas-compress <file>` | shortens a markdown file, every fact kept | 142 | writes a backup first |
| `atlas-recap` | handover file for the conversation: decided, done, not done, tried and rejected | 855 | for starting a fresh chat without losing where you were |
| `atlas-skill` | builds a Claude Code skill from an idea | 969 | asks for everything it needs before writing |
| `atlas-init` | writes the terse-answer rule into other agents' config files | 205 | Cursor, Windsurf, Cline, Copilot |
| `atlas-organize` | tidies a local folder: selects files by content or criterion, copies, moves, groups, sets aside | 2.0k | four levels, from a plan that touches nothing upward. Nothing is ever deleted and every run has an undo |
| `atlas-silent` | does the work and hands over the result: no opinions, no narration, no report | 807 | questions only up front, only about the task. Three things still get said: destructive, blocked, done-but-wrong. Per request; `atlas silent` is the same mode as a dial, and that one stays on |

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
| `atlas-catalog` | searches the public catalogues: free APIs, free-tier services, MCP servers, Claude Code skills | those lists are 550,000 tokens; it reads them live and hands back three candidates |
| `atlas-data` | answers a question about a file too big to read | says how the number was obtained, and when the file was malformed |
| `atlas-history` | answers from git history, cites the commits | read-only: never checks out, never moves the working tree |
| `atlas-scribe` | writes a long file, returns a receipt instead of the text | refuses when you need to read the file back — there it saves nothing |

## Builds

| build | contains | fixed cost at `low` |
|---|---|---|
| `atlas` | everything on this card | 4,796 |
| `atlas-solo` | same rules, no subagents, and eleven commands rather than thirteen | 3,435 |
| `atlas-min` | compression only: one command, no `ask`, no `check`, no provenance marker | 1,991 |

`atlas` and `atlas-solo` have byte-identical rules, verified with `diff`: they write the same
answers. The difference is the subagents, and whether you want the work kept out of context.

`atlas-search` and `atlas-sources` go with them, because they are handles on `atlas-research` and
have nothing behind them without it. Nothing is lost: **the search discipline lives in `check`** —
nothing from memory, "I did not find it" never written as "it does not exist" — where it applies
to every answer instead of one command.

## The per-turn reminder

A short line is injected every turn so the level does not drift back to verbose: 42 tokens at
`low`, 47 at `high`, 49 with `ask`, 51 with `check`, 51 with `silent`. It names the seven rules that slip first — and
"answer first, only what was asked", the one whose failure costs more than the reminder does.

**On a long session this is the largest number on the card.** Over 295 turns it is 12,390 tokens,
more than twice the entire fixed cost. It scales with turns; everything above scales with nothing.

## Configuration

| what | where |
|---|---|
| state | `~/.claude/.atlas-state`, one line, `level:rigour:check:silent` |
| untouchable terms, one per line | `~/.claude/atlas-terms.txt`, ships empty |
| per-project default | `.atlas.json`, `{ "level": "low", "rigour": "ask", "check": "off", "silent": "off" }` |

---

Token figures are tiktoken approximations, not Claude's tokenizer — compare them to each other,
not to a bill. The costs above are current. **How much each level compresses was measured on 0.44.0**: 24 English and 24 Italian questions with fixed fact sheets, 2 rounds each, through the real hooks. Output against no plugin, median: `low` -51% English and -47% Italian, `high` -54% and -47%; details lost, median: `low` 4 and 1 of 263, `high` 4 and 4. Run-to-run noise 4.1 points. The full tables are in the README.