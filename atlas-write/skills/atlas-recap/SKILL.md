---
name: atlas-recap
description: >
  Write a handover file for this conversation: what was decided and why, what is done, what is
  open, what was tried and rejected, how the user works. Use when the user asks for a recap,
  a summary of the work, a handover, "/atlas-recap" — in any language — or wants to
  carry this conversation into a new session.
---

Write `ATLAS RECAP - <chat name>.md` in the working directory, or to the path the user names.
The chat name is in the file name so two conversations on one desktop never share a recap file.

**Where the chat name comes from.** In the desktop app, call `mcp__ccd_session_mgmt__get_session`
with `"self"` (load it with ToolSearch first) and take the `title` field as it is, spaces and
case untouched: a chat titled `SITE REDESIGN` writes `ATLAS RECAP - SITE REDESIGN.md`. In the
terminal there is no tool that returns the title: use the subject of the conversation in two or
three words, written in capitals the same way. Never invent a title that looks like an app title
when it is a guess — say in the answer that the name was chosen, not read.

**Look before writing.** If that path already exists, read its first line. A recap of this same
conversation is replaced: the newer one supersedes it. Anything else — another chat that happens
to share the title — is left alone, and this one is written with a number appended,
`ATLAS RECAP - <chat name> 2.md`. Say which file was found and which was written.

This rule exists because it happened: a recap for one project overwrote the recap of another on
the same desktop, and the only copy left was inside a session transcript.

Two readers, and the file has to serve both: the person who was here and wants to know where
things stand, and a fresh session that has none of this context and must continue the work.

**Not a transcript.** No question-and-answer log, no chronology of turns. What goes in is the
state the conversation arrived at, and everything a new session would otherwise have to
rediscover or re-decide.

## Sections, in this order

**What this is.** One line: the project, and what the conversation was for.

**The goal.** What the user is trying to achieve, in their terms, including the part that is not
in any file yet.

**Decided.** Each decision with the reason behind it. A decision without its reason gets
re-litigated by the next session — the single most expensive thing this file prevents. Include
decisions the user made against a recommendation, marked as theirs.

**Done.** What exists and works, with paths. Say how it was verified, or that it was not.

**Not done.** What is open, blocked, or deliberately left out, and which. A task nobody chose to
skip and a task the user rejected are different entries.

**Tried and rejected.** Approaches that failed, with the failure. Without this a new session
walks into the same wall, and often more than once.

**Measured.** Numbers established during the work, with how they were obtained and how far they
can be trusted.

**How the user works.** Preferences and constraints they stated or showed: what they want asked
versus decided for them, how much detail they want, what must never be touched. This is the part
a new session cannot infer from the code.

**Where things are.** Paths, commands to run, what each one is for.

**Open questions.** Anything waiting on the user, phrased so they can answer without rereading.

## Rules

- **Written normally, never compressed.** This file leaves the conversation. The dials do not
  reach it, at any level.
- **Facts, not narration.** What the thing is, not the story of building it.
- **Names, paths, numbers and commands exact.** They will be typed by someone who cannot ask.
- **Say what is uncertain as uncertain.**
- Skip a section with nothing in it. Do not pad it.
- If the conversation is short or has produced nothing yet, say that in a line rather than
  inflating it into a document.

Then tell the user the path, and in one line what the file covers.
