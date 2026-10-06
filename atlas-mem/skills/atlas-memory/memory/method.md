# Method — what a note is, and the rules that hold everywhere

## Where the vault is

The vault is the memory directory this session was given: its path is stated in the session's
own instructions, together with the index `MEMORY.md` that is loaded from it. Use that path
and no other. It differs by working folder, so it is never guessed and never taken from an
earlier conversation. No memory directory in this session: say so and stop; this skill does
not create one.

## A note

One markdown file per fact, plus `MEMORY.md` as the index: one line per note, loaded every
session, so each line has to earn its place. The content lives in the note files, read on
demand.

```markdown
---
name: <short-kebab-case-slug>
description: <one line, used to decide relevance on recall>
metadata:
  type: user | feedback | project | reference
---

<the fact. For feedback and project notes, follow with **Why:** and **How to apply:** lines.
Link related notes with [[their-slug]].>
```

That is the whole format, and it is the vault's own: this skill adds no field to it. The
application that keeps the vault rewrites frontmatter (it adds fields of its own), so
anything stored there by hand could be dropped without notice.

## What ties a note to code lives beside the vault, not in it

`<vault>/.atlas/links.json`, written and read only by the tool:

```
node "${CLAUDE_PLUGIN_ROOT}/tools/memcheck.mjs" <command> "<vault>" …
```

For each linked note it holds the repository, the file, the line range, the symbol, a
fingerprint of those lines, the commit, what that code depends on in the same repository
(each dependency with its own fingerprint), and the note's `trust`. **No fingerprint, line
range or trust value is ever written or edited by hand**: a hash cannot be computed in the head,
and an invented one makes every later check meaningless. The commands are in `write.md`,
`check.md` and `tidy.md`.

## Trust

Only a note linked to code has a trust value; it is read with `memcheck status` and `check`.

`firm` — its code is what it was when the note was linked, or last linked again.
`suspect` — the code it describes has changed, or is gone. The note is not deleted and not
corrected for the user: it is shown, and they fix the fact or say it still holds.
`unverified` — linked, but its repository could not be reached to check.

A note with no link has no trust value, and that is correct for most notes: who the user is,
a preference, a pointer cannot be checked against code.

This is the whole value of the skill: a fact that quietly became false looks exactly like a
true one. `suspect` makes the difference visible.

## The four types

`user` — who the user is: role, expertise, standing preferences.
`feedback` — how to work: corrections and confirmed approaches, with the reason. Record the
specifics (what, who, when, why, scope) and label an interpretation as the model's own.
`project` — ongoing work, goals, constraints not derivable from the code or the git history;
relative dates converted to absolute ones.
`reference` — pointers to things outside: URLs, dashboards, tickets, repositories.

## What belongs in memory

Only what is **durable** (applies across sessions, not to one task) and **applicable** (it
would change future behaviour). Not what the repository already records: code structure, past
fixes, git history, a `CLAUDE.md`. Not transient status. Unsure whether a fact is durable: it
is not.

One fact per note; a second fact is a second note, linked. A note short enough to be judged
true or false is what makes checking possible.

## Private

What the user marked private, or what is sensitive, is not written into a note. When a fact
must be kept and part of it is private, that part goes inside `<private>…</private>`: it
stays in the file and is never surfaced, quoted or carried elsewhere.

## Rules in every mode

- Write for a reader with no context, in whole sentences, whatever the compression level.
- Never invent a link, a date or a fact; what cannot be filled is left out.
- Checking reports; it never rewrites a note's fact. Writing and tidying change files, and
  each change is shown first.
- The index carries one line per note and never a note's content.
- The tool's output is quoted as it is. A count or a verdict is the tool's, not a guess.
