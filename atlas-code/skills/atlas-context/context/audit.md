# Audit — what a session loads before anyone types

Read-only. Nothing is disabled, moved or deleted by the audit; it ends with a list the
user picks from.

## What is always loaded

In every conversation, used or not:

- the `description` of every skill and every command, from every plugin and from
  `~/.claude/skills`, `.claude/skills`, `~/.claude/commands`, `.claude/commands`
- the `description` of every subagent (`agents/*.md` in the same places)
- the name, description and input schema of every tool of every connected MCP server,
  unless the client defers them
- `CLAUDE.md` files: the user's, the project's, and those of parent folders
- memory index files the harness loads
- whatever `SessionStart` hooks print, and on every turn what `UserPromptSubmit` hooks
  print

Bodies of skills and agents are not on this list: they are read when used.

## Measure

With a tokenizer when there is one (`python -c "import tiktoken"`): count each piece and
say which encoding. Without: characters divided by four, and every figure carries "about".
Either way these are counts of text; the provider bills somewhat more than a public
tokenizer counts, so the table says "tokenizer count", never "billed".

Scan the folders above; output to a file; back here only the table.
MCP tools cannot be read from disk: the tool list of the session is the source. Count the
tools per server; when their schemas are visible, measure them, otherwise write
`not measured` in place of a guess.

Hook output: run each `SessionStart` command once by hand with empty input and measure
what it prints, in bytes and tokens. One limit worth knowing: Claude Code keeps about 10 KB
of a single hook's output and replaces the rest with a short preview, without saying so
(seen on 2.1.283). A hook that prints more than that is not being read in full.

## The table

```
always loaded                       pieces   tokens   share
skill and command descriptions      41       2,480    31%
MCP tool schemas (3 servers)        38       3,100    39%   (github 22, browser 11, docs 5)
subagent descriptions               9        1,050    13%
CLAUDE.md (user + project)          2        820      10%
SessionStart hooks                  2        540      7%
total                                        7,990    tokenizer count, cl100k
per turn: UserPromptSubmit hooks             45
```

Then the ten heaviest single pieces, by name.

## What to look for

Ranked by tokens saved, each as one line with its saving:

- an MCP server with many tools of which the session uses few, or that wraps a command
  line already available (`gh`, `git`): the largest savings are usually here
- two skills or agents that do the same job, often the same thing installed from two
  plugins
- descriptions that run long: past about sixty words a description is explaining instead
  of triggering
- a plugin installed and never used: check the last weeks of transcripts for its skills'
  names before saying so, and say how far back was looked
- `CLAUDE.md` holding reference material that is needed once a week: it belongs in a file
  read on demand, linked from one line
- rules repeated in `CLAUDE.md` and in a skill
- a hook printing near or past the 10 KB limit

Per-turn cost matters more than it looks: forty-five tokens a turn over three hundred
turns outweighs a five-thousand-token file read once.

## Report

The table, the ranked list, and the total that would be saved if all of it were done.
What was not measured, by name. No change is made; each item the user picks is then done
one at a time, and a plugin or server is disabled, never uninstalled, unless asked.
