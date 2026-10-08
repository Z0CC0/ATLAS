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

Four dials, eight commands, no subagents.

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
| `atlas low` | drops filler, pleasantries, hedging, articles, the copula. Fragments allowed. No tables | **-11% ... -28%** | the default |
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
| `atlas-review` | what is wrong with a diff, a branch, a file or a pull request, one problem per line: where, what breaks, the fix | 1.0k | four tiers, `breaks` first. `nothing found` is the whole answer when there is nothing. Behind it, 22 short checklists, read only as the diff calls for them: one per language, plus security, tests, types, errors, a pull request. "second opinion" runs a second reviewer that has not seen the first |
| `atlas-fix` | a failing build, type check or linter back to green: one error, one smallest change, run again | 549 | stops and says why instead of silencing an error: same error twice, more errors than before, a change of design. Ends with `PASS`, `STOPPED` or `DID NOT RUN` and four counts. One file per toolchain behind it, 10 in all |
| `atlas-commit` | commit message for what is staged | 109 | written in normal prose whatever the level: it leaves the conversation |
| `atlas-recap` | handover file for the conversation: decided, done, not done, tried and rejected | 855 | for starting a fresh chat without losing where you were |
| `atlas-organize` | tidies a local folder: selects files by content or criterion, copies, moves, groups, sets aside | 2.0k | four levels, from a plan that touches nothing upward. Nothing is ever deleted and every run has an undo |
| `atlas-silent` | does the work and hands over the result: no opinions, no narration, no report | 807 | questions only up front, only about the task. Three things still get said: destructive, blocked, done-but-wrong. Per request; `atlas silent` is the same mode as a dial, and that one stays on |

## Subagents

None in this build. `atlas-solo` ships the same rules and commands without the seven
subagents of `atlas`; work that would go to one is done in the conversation.

## Builds

| build | contains | fixed cost at `low` |
|---|---|---|
| `atlas` | everything on this card | 3,382 |
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