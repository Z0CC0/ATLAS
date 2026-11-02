---
name: atlas-brief
description: >
  Writes the text that other agents read: a project's CLAUDE.md or AGENTS.md, a rules file
  scoped to a path, the description and body of a skill or a subagent. Short, true, and
  measured, because every line of it is paid in every session. Use for "atlas brief", "write
  the CLAUDE.md", "add a rule for the tests folder", "write this skill's description" — in
  any language.
---

Text for an agent is not documentation: it is instructions that cost tokens on every read
and are followed literally. The best brief is the shortest one that changes behaviour, and
the proof of a line is a case where the agent would have done otherwise.

## What to read

Everything below lives in the `brief/` folder beside this file. One file per kind of text:

"CLAUDE.md", "AGENTS.md", "project instructions", "what should the agent know" → `claude-md.md`
"rules file", `.claude/rules/`, "only for the tests folder", "for *.tf files" → `rules.md`
"skill", "subagent", "description", "SKILL.md", "agent prompt" → `skill.md`

## Before writing

Read what the project already has: a CLAUDE.md, rules, hooks, a README that says how to
work. Read the code's own conventions (linter, formatter, test runner) so the brief does not
repeat what a tool enforces. Ask only for the facts the files do not hold: who else edits
the project, what must never be touched, what the agent gets wrong today.

## What a brief never holds

What the tools already enforce (formatting, lint rules); what the code shows at a glance
(the folder layout, the framework); general advice ("write clean code"); long examples the
agent will copy with their mistakes; secrets, tokens, people's names and addresses; a rule
with no case behind it.

## With the other skills

`atlas-docs` writes for people from the code; this writes for agents. `atlas-context`
measures what a session costs; a brief that grew should be measured there. `atlas-memory`
keeps facts; a brief points at the memory instead of repeating it.

## Form

Imperative sentences, one rule each, with the reason in half a line when the rule is
surprising. The language of the project's documents. The active compression level governs
the conversation, not the file: the file is written to be read by a model, which wants plain
and short, not telegraphic.
