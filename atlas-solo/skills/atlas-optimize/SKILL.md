---
name: atlas-optimize
description: >
  Advise how to set ATLAS up. With no argument: read the user's own past sessions and say what
  fits how they actually work, including what to turn off. With a task described: recommend the
  dials for that task. Everything local, nothing sent anywhere.
  Use when the user says "atlas optimize", "/atlas-optimize", "how do I use this best",
  "how should I set it for a task" — or the same in any language — or describes something they
  are about to start.
---

Terse throughout, at any level. This command reports numbers and hands over a table; prose is not
the product here.

## Read the habits

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/optimize.mjs" --sessions 10
```

**One recommendation, the number that drove it, and what to switch off.** Nothing else. Advice
that only ever adds is a sales pitch.

If a dial is paid for and unused, say to turn it off. If the numbers say ATLAS is barely worth it
for this kind of work, say that.

**Never justify a number twice.** The script prints them; repeating them in prose is the failure
this command is most prone to.

## Print the whole setup table, always

Not three rows chosen for the user. **The whole table.** It is the point of this command: someone
should be able to read it once and know where they stand for anything they do next.

| about to do | setup | why |
|---|---|---|
| quick questions all day | `high` | short answers, the per-turn cost dominates |
| a long session that will wander | `high` + `ask` | `ask` fires on every request, which is where a wandering session goes wrong |
| research, facts, anything current | `high` + `check` | the one case `check` is built for. Without it the answer comes from memory |
| choosing between libraries or tools | `high` + `check` | `check` looks for a second option before recommending the first |
| learning a topic from scratch | `low` + `atlas-sources` | you want reading material, not a compressed answer. `atlas` build only |
| is this still maintained, what changed | `high` + `atlas-research` | `atlas` build only |
| explore code you do not know | `high` + `atlas-finder` | the searches stay out of the conversation |
| find where one thing lives | `high` + `atlas-finder` | skip it if you already know the file |
| why did this line change | `high` + `atlas-history` | `git log -p` is thousands of tokens for one line |
| review a diff or a PR | `high` + `atlas-diff` | |
| debug something that misbehaves | `high`, `check off`, `atlas-finder` | diagnosis rules are always on. `check` is about claims, not causes |
| a failing test suite | `high` + `atlas-runner` | the log never enters the conversation |
| does it still build | `high` + `atlas-runner` | |
| a performance problem | `high` + `check` | the cause is a claim, and a wrong one costs a day |
| a bounded edit, a rename, a typo | `high`, `ask off` | `ask` ignores bounded tasks, but leaving it on invites a pointless question |
| a refactor across several files | `low` + `ask` | `ask` settles the boundary before anything moves |
| a migration with a rollback | `low` + `ask` + `check` | the one place all three earn it |
| a security review | `low` + `check` | security prose is written plain at every level anyway |
| build a skill, a plugin, a command | `low` + `ask` + `atlas-skill` | `ask` settles the trigger words, the part that decides whether it ever fires |
| start a project from nothing | `low` + `ask` | `ask` is worth most where nothing is decided. Compression matters least |
| design an API or a schema | `low` + `ask` + `check` | |
| write documentation, a README, release notes | `low` | read by people who never saw the dials. Compressed prose in a document is a defect |
| a commit message | any + `atlas-commit` | written plain whatever the level: it leaves the conversation |
| a long generated file nobody reads back | any + `atlas-scribe` | a receipt comes back instead of the text |
| a question about a huge CSV or log | any + `atlas-data` | the file never enters the context |
| is there a free API or service for this | any + `atlas-catalog` | 550,000 tokens of catalogues, read elsewhere |
| does the page render, does the form work | any + `atlas-browser` | one screenshot costs about 9,800 tokens |
| tidy a folder, sort files | any + `atlas-organize` | |
| pairing on one file for hours | `low` | you re-read every answer; compression costs you reading time you do not save |
| someone else will read the output | `low` | |

Rows are starting points, not the option space. **The real space is four independent dials** —
level, `ask`, `check`, `silent` — and any row is one combination of them plus possibly a subagent.
`silent` changes what is said around the work, not the token count of the work itself, so the
percentage table below lists the eight combinations of the other three.

## What a setup costs, as a percentage

**Never report a dial's cost in raw tokens.** A number like "+841" reads as a bill with nothing to
compare it to. What the user wants to know is whether a setup costs more or less than plain
Claude — and the answer is almost always **less**, including with `check` on.

When session history exists, the script's own figures give the exact answer for this user. Without
it, use these, and state the profile they assume:

| setup | short session, 40 turns | long session, 295 turns |
|---|---|---|
| `low` | -17% | -38% |
| `high` | -16% | -38% |
| `low` + `ask` | -12% | -34% |
| `low` + `check` | -6% | -30% |
| `low` + `ask` + `check` | -1% | -27% |
| `high` + `ask` | -14% | -37% |
| `high` + `check` | -11% | -36% |
| `high` + `ask` + `check` | -6% | -33% |

**The reading that matters: every combination is cheaper than no plugin, at both lengths.** Each row rests on its own measurement: `ask` and `check` were run, not modelled.

**And the spread comes from session length, not from the dials.** The fixed cost is paid once and
spreads; on a short session it dominates, on a long one it disappears. If someone's sessions are
short, that is the finding, not which dial they picked.

These rest on the bench of 0.1.0: 48 questions with fixed fact sheets, 2 rounds, both languages.

## The memory language

```bash
node "${CLAUDE_PLUGIN_ROOT}/tools/memory.mjs"
```

Report **only folders where there is something to gain**, one line each. Folders already in
English are not mentioned.

Then one line of why, and one limit:

- the tokenizer learned on almost entirely English text, so English words survive whole and other
  languages split. It is the cheapest language measured
- `MEMORY.md` is loaded by the environment at every start, so the only way to spend less there is
  to write it in English — a translation alongside would arrive too late

**No examples in a third language.** A comparison with Japanese or Turkish is a fact about a
language the reader may not know, spent to prove a point they already accepted.

**Offer, do not do**: "tell me if you want me to rewrite them in English." Those files are theirs,
and in English they read them worse. The number says what the choice costs, not which to make.

**When only one folder is open**, the tool sees only what is under it. Close with one line: *if
you want to see where else there is something to gain, open a wider folder or the desktop and ask
me to check again.*

If the language is not one of those measured, **no number**. `tiktoken` got the sign wrong on
Turkish and missed Spanish by fifteen points: an invented number is worse than none.

## Close with what to do next

One line, imperative, with the command to type. "Turn check off: `atlas check off`."

Never end on a summary of what was just said.

The active compression level governs the prose here. It never overrides the format above: the
shape stays, the words inside it shorten. A command that adds work is not permission to write
long — what it adds is content, the prose around it is not.
