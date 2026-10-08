---
name: atlas-memory
description: >
  The project's durable memory: writes facts and decisions worth keeping, finds the right
  one when it matters, and — the point — flags a note as suspect when the code it describes
  has changed. Notes are markdown files in the existing vault, written by hand when the work
  decides, never captured automatically. Use for "atlas memory", "remember this", "what did
  we decide about X", "is the memory still true", "check the memory", "tidy the memory", "mark X as superseded" — in
  any language.
---

Memory that does not lie. A note lives longer than the thing it describes; this makes it say
so when it has gone stale, instead of repeating a fact that stopped being true.

## What this is

The memory is the markdown vault the project already keeps (one file per fact, frontmatter,
`[[wikilinks]]`, an index). This does not replace it or add a database. It adds three things
the vault cannot do on its own: write a note well, find it again, and know when it has
rotted because the code moved under it.

## What to read

Everything below lives in the `memory/` folder beside this file.

1. `memory/method.md`, always: what a note is, the file format, where the code links live, the
   rules that hold in every mode.
2. By the words of the request:
   "remember", "save this", "note that", "write it down" → `write.md`
   "what did we decide", "do we have anything on", "recall", "search the memory" → `recall.md`
   "is it still true", "check the memory", "stale", "verify the notes" → `check.md`
   "tidy", "merge duplicates", "clean up the memory", "fix the index" → `tidy.md`
   "label", "mark as superseded", "canonical", "don't use X any more", "this one is wrong",
   "which version is the reference" → `labels.md`
   Nothing named, "atlas memory": say what is there (notes by type from the index, and the
   line `memcheck status "<vault>"` prints for those linked to code) and ask which of the
   five.

## Capture is manual, on purpose

Nothing is written to memory automatically. A note is created when the work decides a fact
is worth keeping — a decision made, a correction given, a constraint stated. This keeps the
memory small and every note true, which is what makes `check` meaningful. The signals that
mark a fact worth a note are in `write.md`.

## With the other skills

Finding where a thing is in the code: `atlas-finder`. Everything that needs a hash or a
comparison is done by `tools/memcheck.mjs`, never by hand. It finds a definition by parsing
the file, or by the shape of the line when no grammar is installed for the language, and
follows it when it moves to another file or changes name, and watches what that code
depends on in the same repository. Its limits are stated in `check.md`. Before a change to
code that memory may describe, `memcheck impact` says which notes it would touch.

## Form

The active compression level governs what is said back. It never overrides the note format
in `method.md` or the report in `check.md`. A note is written for later readers, including a
fresh session with no context: whole sentences, uncompressed, whatever the level.
