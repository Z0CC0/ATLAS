---
name: atlas-artifact
description: >
  Reads what is inside a shipped artifact without running it: an installed Electron or Node
  application (its modules, what reaches the entry, the IPC channels in both directions, the
  preload bridge, the windows and their preferences, the hosts it talks to, the processes it
  starts, the bundles by their module tables, the fuses of its executable, what changed
  between two versions), a SQLite file (schema, counts, a sample), a source map (where a
  bundled line came from). Every fact with its file and line, a confidence, and what was not covered. Only for
  software the person owns or is allowed to inspect. Use for "atlas artifact", "what is in
  this app", "open this asar", "what does this installed program do", "read this database",
  "map this bundled line back" — in any language.
---

The code that runs is the archive, not the repository. This reads the archive.

## First, whose software

Before anything is opened: the artifact belongs to the person, or they say they are allowed
to look inside it. Not sure: ask, one line, and stop until the answer. A program that is
not theirs is read only with their word that they may, written in the report. Nothing here
bypasses a licence, a protection, a login or a check; nothing here is run; the archive is
read as bytes and left as it was.

## What to read

Everything below lives in the `artifact/` folder beside this file.

1. `artifact/method.md`, always: the tool, the record every answer carries, summary before
   detail, the register of what stayed unknown, the report.
2. By the target:
   an `.asar`, an installed Electron program, a folder with a `package.json` → `app.md`
   a `.db`, `.sqlite`, a file that starts with `SQLite format 3` → `data.md`
   a `.map`, "where does this line come from", a stack trace from a bundle → `data.md`
   "fuses", "is it hardened", "can it be run as node", the `.exe` of an Electron program →
   `app.md` (the fuses section)
   "what changed", "compare the versions", "the old one and the new one", two archives →
   `app.md` (two versions)
   a `.dll`, ELF, Mach-O, `.apk`, firmware, an `.exe` that is not Electron → not read yet:
   say so in one line, and what `detect` reported.

## Boundaries

Read, never changed: no file inside or beside the artifact is written, no process of it is
started, no network is used. A question that needs the program running ("what does it do
when I click") is answered from the code with that said, or is `atlas-browser`'s when the
program is a web app. Secrets found in an artifact are reported by name and place, never
by value.

## With the other skills

The source repository, when it is here too, is `atlas-memory`'s code graph; this reads what
shipped and the two are compared when they differ. A security question about what was
found goes to `atlas-secure` with the lines of this report as its starting list. A long
read runs through `atlas-runner` when it exists.

## Form

The active compression level governs the prose. It never overrides the record format in
`method.md`. Paths, channel names and hosts are quoted exactly.
