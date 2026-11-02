# Check — has the code moved under the memory

The reason this skill exists. Two checks: notes against the code they are linked to, done by
the tool; and notes against each other, done by reading.

## Notes against code

```
node "${CLAUDE_PLUGIN_ROOT}/tools/memcheck.mjs" check "<vault>"            # look, change nothing
node "${CLAUDE_PLUGIN_ROOT}/tools/memcheck.mjs" check "<vault>" --write    # and record the result
```

`--repo "<root>"` limits it to the notes linked into one repository. Run it without `--write`
first when the user asked a question; with `--write` when they asked for the check to be
done. Print the report as the tool gives it.

What the tool decides for each link, and what each answer means:

| state | meaning | effect |
|---|---|---|
| held | the linked lines are exactly what they were | firm |
| moved | the same code, at other lines or in another file of the repository | firm; `--write` updates the lines and the file. Harmless, never an alarm |
| changed | the symbol is there, its code is different | suspect |
| dep-changed | the code is intact, but something it depends on (a function it calls, a constant it reads, in this repository) changed, was renamed or is gone | suspect; the report names the dependency |
| renamed | the same code under another name, in this file or another | suspect: the note names a symbol that no longer exists. The report says the new name |
| gone | the symbol is no longer in the file, nor anywhere else in the repository | suspect |
| missing | the file is no longer in the repository, and its code is nowhere else | suspect |
| unreachable | the repository is not on this machine | nothing changes; listed as not checked |

A note is suspect while any one of its links is. A note whose code is put back as it was
returns to firm at the next check, by itself. A note in the sidecar whose file no longer
exists is an `orphan`: `tidy.md` deals with it.

```
checked   12 notes with code links
firm      10 held; 2 had code that only moved
suspect   2
  session-retry-count  refreshSession in src/auth/session.ts changed since this note was written (at a17e257); it is defined at line 44 now
  fetch-rate-limit     backoff is no longer in src/fetch/client.py
```

## Resolving a suspect note

Suspect means "look", not "wrong". For each one, open the note and the code side by side and
put the question to the user in one line: the note says X, the code now does Y; is the note
still true?

- **Still true** (the code changed in a way the fact survives): link the note again, exactly
  as in `write.md`. That retakes the fingerprint over the right lines and the note is firm.
- **A dependency changed**: read the dependency the report names against the note. If the
  fact survives, link the note again: that re-records the dependencies as they are now.
- **Renamed**: if the fact holds under the new name, link the note again with the new symbol
  and `memcheck unlink "<vault>" <slug> <old symbol>`; if the note's text names the old
  symbol, the body is rewritten too (`write.md`).
- **No longer true**: the user gives the new fact; rewrite the note's body (`write.md`), then
  link it again.
- **The code is gone for good and the fact with it**: the note is removed through `tidy.md`.
- **The fact holds but no longer hangs on that code**: `memcheck unlink "<vault>" <slug>
  <symbol>`.

Nothing here is decided for the user, and a note's body is never changed by a check.

## What the check cannot see

A symbol is found again by parsing the file where a grammar is installed, by a line shaped
like a definition where none is; when it is not where the note left it, the other files of
the repository are searched for the same code, under the same name or another. Say these
limits when they matter, do not paper over them:
only **direct** dependencies defined in the **same repository** are followed, one level
deep: a library that changed, a method reached through an object (`obj.method()`), or a
change two calls away is not seen; a symbol that was renamed **and** whose body changed in
the same step reads as `gone`; in a language with no
grammar, a definition in an unusual shape may not be recognised, which also reads as `gone`;
files over 1 MB and generated folders (`node_modules`, `dist`, `build`, `vendor`, …) are
never searched. A `gone` on a symbol the user says still exists: search for where it went
and link the note again there.

## Who really uses it, now

The code graph and the links are static: a name used twice cannot be told apart, a method
reached through an object is not seen. When the question is "who calls this, really", ask the
language server:

```
node "${CLAUDE_PLUGIN_ROOT}/tools/lsp.mjs" refs "<repository root>" <file> <line> <symbol>
```

TypeScript/JavaScript and Python. The static count and the live one can differ; the live one
is right for the code as it is now. When no server is installed the tool says so.

## Before changing code: what the memory says about it

```
node "${CLAUDE_PLUGIN_ROOT}/tools/memcheck.mjs" impact "<vault>" "<repository root>" <file> [<symbol>]
```

Lists the notes linked to that file or symbol, and the notes whose code depends on it. Use
it when a change is about to touch code that memory may describe — before a refactor, in a
review — so the notes are read first instead of becoming suspect after.

## Notes against each other

Only when asked for it: "do the notes agree", "contradictions", "check the notes against each
other", or as part of `tidy.md`. Not on every check: the code check is one tool call, this
one reads every note in the vault, and a question about the code does not pay for that.

No tool for this; it is reading. Group the notes by subject from the index (the same project,
the same component, the same decision) and read each group's notes in full. Two notes
contradict when both cannot be true at once: "the worker is TypeScript" and "the worker was
ported to Python"; "never use X" and "X is the default".

Report each pair with both notes named and the two sentences quoted, and the dates when the
notes carry them. Do not pick the newer one, do not merge them, do not change either: the
user says which holds, then `write.md` or `tidy.md` applies it. Two notes that differ in
scope ("in the API" and "in the worker") do not contradict; say why they were passed.

```
contradiction  worker-language / worker-port
  "the worker is written in TypeScript"  vs  "the worker was rewritten in Python"
  Which one holds?
```

Nothing found: one line saying how many notes in how many groups were read.
