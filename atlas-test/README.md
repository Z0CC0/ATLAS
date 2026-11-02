# atlas-test

The bench behind the figures in the ATLAS README. It is not a plugin and you never need to install it. It is here so that every number can be rerun or contested.

## What is in it

| file | what it does | spends usage |
|---|---|---|
| `cases/` | the questions, each with its sheet of notes | no |
| `generated/` | every answer, with its token counts | no |
| `generate.mjs` | has the plugin write the answers, one fresh session per answer | yes, a lot |
| `judge-notes.mjs` | reads each answer against the notes it was given and says which a reader still learns; `--second` reads the absent ones again with the question, `--planted` tests the judge itself, `--report` prints the table | yes, except `--report` |
| `judge.mjs` | the older judge: a substring check, then a model on what the check marked absent | yes |
| `measure.mjs` | prints saving and details lost for the older judge | no |
| `fixed-costs.mjs` | counts each build's descriptions and rules, and with `--billed` measures the first turn | only with `--billed` |
| `session-table.mjs` | the session tables, by arithmetic over the two results files | no |
| `results.opus.json` | the summary of the 2026-09-26 run | no |
| `fixed-costs.<version>.json` | the billed and counted costs of each build at that version | no |
| `verdicts.*.json`, `planted.*.json` | every verdict and every sensitivity trial, so each one can be contested | no |

## What it measures

- The form of an answer with the information held constant: every setup gets the same question and the same notes.
- What a build adds to the first turn, and what a session costs against no plugin.

## How far to trust the judge

A note of another question was called present 0 times in 1,440 calls. A sentence of the answer itself was called absent 2 times in 1,391. With the sentences carrying a note deleted from 120 real answers, the judge still called that note present 11 times, some because the information was stated elsewhere too, and it called a note left in absent 0 times of 104. Only notes marked absent get the second reading, so a wrong "present" in the first reading stays. The full run reported about $19 of usage.

## What it does not measure

- Whether code or documents written with `atlas-code` are any better. No bench covers that.
- The savings of any build other than `atlas` and `atlas-min`. The others are assumed to save what `atlas` saves.
- The current rules. The answers come from an earlier revision of the rules on `claude-opus-5-5`, 2026-09-26. Rules at `low` count 1,408 tokens now and 1,409 then, but the wording was not compared line by line.
- Other models. Sonnet 5 compressed more under every plugin, and the billed first turn changes with the model.

## Run it

You need the Claude Code CLI on the PATH and logged in, and `node`. `fixed-costs.mjs` also needs Python with `tiktoken`.

```bash
node judge-notes.mjs --cases cases/opus.en.json --dry-run
node judge-notes.mjs --cases cases/opus.en.json
node judge-notes.mjs --cases cases/opus.en.json --second
node judge-notes.mjs --cases cases/opus.en.json --report
node fixed-costs.mjs
node session-table.mjs
```

Every judging run resumes where it stopped, and stops by itself after three failures in a row. Regenerating the answers takes hours and about a subscription's worth of usage. It also needs only the plugin under test installed, because two plugins measure the sum of their rules.

## A trap this bench fell into

`--settings '{"enabledPlugins":{}}'` does not switch plugins off: settings merge, so the installed plugins stay on, hooks included. The result looks valid. A plugin reloaded through `--plugin-dir` then injects its rules twice, and the first-turn figures come out wrong by a factor of two. `fixed-costs.mjs` and `judge-notes.mjs` use `--setting-sources project` from an empty folder. A login that has expired also answers with valid JSON and zero tokens, so `fixed-costs.mjs` stops on it.
