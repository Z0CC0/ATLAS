# Write — putting a fact into memory

## First, is it worth a note

Most things are not. A note is earned by a fact that is durable and applicable
(`method.md`). The signals that one has appeared, each worth stopping to write:

- **A correction.** The user corrected an approach, a name, a fact, a direction. What they
  corrected, to what, and the reason.
- **A decision, most of all one made against a recommendation.** The choice and why: the
  reason is what stops the next session from reopening it.
- **A constraint said in passing.** "It has to run on Mac too", "never touch that file",
  "they bill by the row". These are lost first and cost most.
- **A preference shown more than once.** How the user wants things done or said.
- **A pointer** the user would otherwise have to restate: a URL, a dashboard, a ticket.

Not a signal: a task completed, a fix that lives in the diff, a status, anything the git
history or the code already says. Asked to remember one of those: ask what was non-obvious
about it and save that, or decline in one line.

## Does it already exist

Before creating a file, look for a note that covers this (`recall.md`). Found: update it,
do not add a second one; duplicates are how a vault rots. A fact that contradicts an existing
note is not written over it: show the two together and let the user say which holds.

## Writing the file

The name is a short kebab-case slug, unique in the vault. The `description` is one line, good
enough to judge relevance without opening the file. The `type` is one of the four. The body
is one fact; for `feedback` and `project` notes, the `**Why:**` and `**How to apply:**`
lines; related notes linked with `[[slug]]`.

Then one line in `MEMORY.md`: `- [Title](slug.md) — hook`, the hook being why a later session
would open it.

## Linking the note to code

Only when the note is about one specific piece of code: a decision about one function, a
constraint on one module, how one part works. A general preference has nothing to link.

1. Name the definition the note is about: the file, and the name defined in it.
2. Link it. The note file must exist first.

```
node "${CLAUDE_PLUGIN_ROOT}/tools/memcheck.mjs" link "<vault>" <slug> "<repository root>" <file> <symbol>
```

`<file>` is relative to the repository root. The tool parses the file, takes the lines the
definition spans, the fingerprint and the commit itself, records what that code depends on
(the names it uses that are defined in this repository, so a change there is noticed too),
and prints what it recorded.

It asks for a range in two cases, and then the range goes before the symbol
(`… <file> <first>-<last> <symbol>`):
- the name is defined more than once in the file: it lists the ranges; give the one meant;
- the file cannot be parsed here (no parser installed, or no grammar for the language): open
  the file and take the range as it is now, never from memory, from the first line of the
  definition to its last.

`memcheck defs "<repository root>" <file>` lists every definition in a file with its lines.
If the tool refuses, the name or the range is wrong: fix that, never work around it.

3. A note that depends on two places gets two links, one command each.

A note whose code cannot be pinned to a definition and a range is left unlinked. An unlinked
note is honest; a link to the wrong lines raises false alarms for ever.

Linking again with the same file and symbol replaces the old link. That is also how a note is
confirmed after its code changed (`check.md`).

## Not done here

Capturing automatically. Writing a note nobody, in effect, asked to keep. Putting a secret
or private data in a note outside `<private>`. Recording finished work as if it were a
durable fact. Typing a fingerprint, a range or a trust value into any file.
