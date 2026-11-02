# CLAUDE.md and AGENTS.md

The file the agent reads at the start of every session in this project. Its cost is paid on
every turn of every session; its value is the mistakes it prevents. So: what the agent would
get wrong without it, and nothing it would get right anyway.

## What goes in, in this order

1. **What this is**, in two sentences: the product, who uses it, the one thing that makes it
   unusual (runs offline, talks to hardware, ships to a store).
2. **How to run, build and test**, as commands, one line each, exactly as they work on this
   machine. The test command is the most used line in the file; it must be right.
3. **The rules that are not in the code**: things decided and not visible (the file that must
   not be edited, the folder that is generated, the API that is frozen, the branch to work
   on, the commit author to use). Each with its reason in half a line, because an agent
   that knows why applies the rule to the case the rule did not foresee.
4. **Where things are**, only for what a search would not find: the real entry point when
   there are three candidates, the config that decides behaviour, the data folder.
5. **What to do when done**: run which checks, update which file, never push, ask before
   what.
6. **Pointers**: the memory, the specs folder, the rules files, the docs that are kept
   current. One line each; the agent follows them when needed.

## What stays out

The folder tree (a `ls` gives it); the framework and language (the manifest gives them);
coding style the linter enforces; long examples; history and changelog; anything that
changes weekly (it goes stale and the agent trusts it); praise, tone, personality; secrets.

## Size

Under 150 lines for a project of any size, under 60 for a small one. Every line answers the
question "what did the agent do wrong, or would it, without this line?"; a line with no answer
is removed. A section that grows past a screen moves to a rules file scoped to the paths it
concerns, and the brief keeps one line pointing at it.

## When one exists

Edit, never rewrite: the lines that are there were paid for by mistakes. Remove what is now
enforced by a tool or no longer true (check each claim against the repo before removing).
Add at the right section. Keep the author's language and form. Show the diff, write after a
yes.

## AGENTS.md beside CLAUDE.md

Other agents read `AGENTS.md`. When the project has both, one includes the other, or they
say the same thing in the same words; two files with different rules are a bug. A new
project gets `AGENTS.md` with the content and a `CLAUDE.md` that points at it, unless the
project's habit is the reverse.
