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
| `results.mjs` | gathers the results into `results.opus.json` and the plugin's `figures.json` | no |
| `results.opus.json` | the summary of the 2026-11-03 run | no |
| `readme-graphics.mjs` | draws the charts in the READMEs from those files | no |
| `fixed-costs.<version>.json` | the billed and counted costs of each build at that version | no |
| `verdicts.*.json`, `planted.*.json` | every verdict and every sensitivity trial, so each one can be contested | no |
| `memory-bench.mjs` | the memory bench: an invented project, sixteen facts, five made false by a commit, asked in fresh sessions under each memory; `--probe` shows what the hooks would say for free, `--report` prints the table | yes, except `--probe` and `--report` |
| `memory-bench.results.json`, `memory-bench.rivals.json` | every answer of the 2026-11-04 memory run (the `atlas-base` row from 2026-11-08), with its verdict, tokens and cost | no |
| `memory-capture.mjs` | the capture bench: six turns of work on the same project with six things said in passing about the client, then a new session asked about each; `--mode asked` ends the conversation by asking to keep them | yes, except `--report` |
| `memory-capture.pilot.json` | every conversation and answer of the 2026-11-08 capture pilot. One thing is changed in it: Trail-Code wrote the name of the machine's user into its answers, and that name reads `[user]` here | no |
| `prune-live.mjs` | one real session: a file read twice, three short turns, `/compact` with the pruning hook on (or off, third argument `summary`), then three questions with no tools | yes |
| `profile-pilot.mjs` | three requests in plain words in a small repository, with the profile line of `atlas-code` and with it skipped: which tool is called first | yes |
| `profile-pilot.results.json` | the twelve conversations of 2026-11-15 on `claude-sonnet-5-5` | no |
| `researcher-model-pilot.mjs` | the rules of `atlas-research` on two models, two questions with a known answer | yes |
| `researcher-model-pilot.results.json` | the four answers of 2026-11-15 with their cost | no |

## What it measures

- The form of an answer with the information held constant: every setup gets the same question and the same notes.
- What a build adds to the first turn, and what a session costs against no plugin.
- Whether a memory finds a fact, and whether it gives a fact the code has since made false: no memory, a `CLAUDE.md`, Claude Code's own memory folder, `atlas-mem`, the last two among 300 other notes, and Trail-Code. The table is in the README of ATLAS-mem.

## How far to trust the judge

A note of another question was called present 0 times in 1,728 calls. A sentence of the answer itself was called absent 3 times in 1,666. With the sentences carrying a note deleted from 120 real answers, the judge still called that note present 13 times, some because the information was stated elsewhere too, and it called a note left in absent 0 times of 113. Only notes marked absent get the second reading, so a wrong "present" in the first reading stays.

## What it does not measure

- Whether code or documents written with `atlas-code` are any better. No bench covers that.
- The savings of any build other than `atlas` and `atlas-min`. The others are assumed to save what `atlas` saves.
- Capturing facts from a conversation, beyond the one-round pilot of `memory-capture.mjs`: six facts, four setups, one conversation each per mode. Enough to see whether a memory keeps nothing, not enough to rank them.
- claude-mem: its observer needs a login of its own, which an isolated run cannot give it.
- The three pilots of 2026-11-15 are small on purpose. Pruning: one session each way on `claude-haiku-5-5` (three facts kept against none, 25,384 tokens written to the cache against 5,957). The profile line: 6 of 6 against 0 of 6, one repository, one model. The researcher on a cheaper model: 4 answers, $0.59 on Sonnet against $0.50 on Opus, each model with one answer the other got better, so no cheaper model was set. Each says which way to go, none is a rate.
- Other models. Sonnet 5 compressed more under every plugin, and the billed first turn changes with the model.

## Run it

You need the Claude Code CLI on the PATH and logged in, and `node`. `fixed-costs.mjs` also needs Python with `tiktoken`.

```bash
node generate.mjs --cases cases/opus.en.json --rounds 2 --dry-run
node judge-notes.mjs --cases cases/opus.en.json --dry-run
node judge-notes.mjs --cases cases/opus.en.json
node judge-notes.mjs --cases cases/opus.en.json --second
node judge-notes.mjs --cases cases/opus.en.json --report
node fixed-costs.mjs
node session-table.mjs
node memory-bench.mjs --plugin <folder of the atlas-mem build> --dry-run
node memory-bench.mjs --only trail --rivals <folder> --file memory-bench.rivals.json
node memory-bench.mjs --only atlas-base --base-plugin <folder of the atlas build>
node memory-bench.mjs --report
node memory-capture.mjs --plugin <folder of the atlas-mem build> --rivals <folder> --rounds 1 --dry-run
node memory-capture.mjs --report
node prune-live.mjs <folder of the atlas build> switch
node prune-live.mjs <folder of the atlas build> switch summary
node profile-pilot.mjs <folder of the atlas-code build> results.json 1
node researcher-model-pilot.mjs <file with the body of agents/atlas-research.md> results.json
```

Every run resumes where it stopped with `--missing`, and stops by itself after three failures in a row. The whole bench, 1,728 answers and their judging, reported about $140 of usage and took about two hours. Each answer runs in an empty folder with only the plugin under test loaded, so nothing else you have installed is in the measure. caveman's level is one file for the whole machine, so its rows run one level at a time. A newer caveman is measured with `CAVEMAN_DIR=<folder> node generate.mjs --only caveman4-full`.

## A trap this bench fell into

`--settings '{"enabledPlugins":{}}'` does not switch plugins off: settings merge, so the installed plugins stay on, hooks included. The result looks valid. A plugin reloaded through `--plugin-dir` then injects its rules twice, and the first-turn figures come out wrong by a factor of two. `fixed-costs.mjs` and `judge-notes.mjs` use `--setting-sources project` from an empty folder. A login that has expired also answers with valid JSON and zero tokens, so `fixed-costs.mjs` stops on it. The bare call that `--billed` subtracts from every build is one call, and once it came back 535 tokens heavier than usual, so every build looked 500 tokens cheaper and `atlas-min` off came out negative: a negative build is the sign to run it again, not a number.

Two more, from the memory bench. Claude Code reads a project's memory folder by itself, with `--setting-sources project` too: a setup that puts notes there and adds a plugin measures both, so the folder alone is a setup of its own (`builtin`), and it is the fair baseline. And claude-mem 15.9.0, installed with a temporary home and temporary `LOCALAPPDATA`, still added three folders to the Windows user `Path`, through its installer and through a session-start hook. The bench now runs a copy of its hooks without that one, but anyone repeating this should check the `Path` before and after.
