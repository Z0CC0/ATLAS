# Compact — when, and what to save first

Compaction replaces the conversation with a summary. It happens by itself when the window
fills, at whatever point the work happens to be. Chosen at the right moment it loses
little; arriving mid-task it loses the things nobody wrote down.

## When

Compact at a boundary, where what was learned has already become something durable:

| moment | compact | why |
|---|---|---|
| exploration done, plan agreed | yes | the reading was bulky; the plan is what it produced |
| plan written, about to build | yes | room for code, the plan is on disk |
| a milestone committed | yes | the commit holds the result |
| a dead end abandoned | yes | its reasoning only misleads what comes next |
| switching to an unrelated task | yes, or a new conversation | none of it is needed |
| debugging finished, next feature | yes | traces and logs are noise now |
| in the middle of an implementation | no | names, paths and half-made decisions live only here |
| in the middle of a failing test loop | no | what has been tried is the state |
| build to tests, same code | only if the window is nearly full | the tests refer to what was just written |

Signs the window is under pressure: the harness reports it; answers begin to forget
decisions made earlier; files are being re-read that were read before. How full the window
is comes from what the harness shows (its context or usage display), not from a guess
here: when no figure is visible, say so and go by the signs.

## Before

Compaction keeps what is on disk and loses what is only in the conversation. So first,
put on disk whatever must survive:

1. **The plan and where it stands**: steps done, the step in progress, what is next. In a
   file, or in the task list when the session has one.
2. **Decisions and their reasons**, most of all the ones that rejected something: a
   summary keeps "we use X" and drops "we tried Y and it failed because".
3. **What the user asked for in their own words**, when it has conditions: constraints
   said in passing are the first thing a summary loses.
4. **Exact things**: file paths and line ranges in play, commands that work, error
   strings, names chosen, numbers measured.
5. **What is uncommitted**: say what is in the working tree and why, or commit it.

A handover file does all five: `atlas-recap` writes one. For a short task, a few lines in
the plan file are enough.

Then tell the user it is a good moment, in one line, with what was saved and where. The
command is theirs to run; a summary instruction can be passed with it, naming what to
keep.

## After

Do not trust the summary for exact things: re-read the plan file and the files being
edited before the next change. A path, a line number or an error message recalled from a
summary is checked against the disk first.

## What survives without help

Files, commits and branches. `CLAUDE.md` and memory files, which are loaded again. The
task list, when the harness has one.
What does not: the contents of files read earlier, tool output, reasoning, and anything
the user said once.

## Not this

Compacting to hide a mess: if the conversation went wrong, a new one with a clear brief is
better. Suggesting it every few turns: once, at a boundary.
