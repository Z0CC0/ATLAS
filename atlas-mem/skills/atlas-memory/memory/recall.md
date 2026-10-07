# Recall — finding the right note, not every note

The failure to avoid: dumping the whole vault into the answer, or pasting three lines of one
note without the rest and acting on half a fact. Recall is layered, and it returns a whole
note, never a fragment.

## The three layers

Work down them, and stop at the first that answers.

1. **The index.** `MEMORY.md` is already in context: one line per note, with its hook. For
   most questions the right note is named here, and nothing else needs to be read.
2. **The neighbourhood.** When the index points at a note, read that note, and the notes it
   links with `[[slug]]`. A fact rarely stands alone; the linked notes are the context that
   stops a half-answer. With the code graph present, "neighbourhood" also means the notes
   linked to the same code or to code that depends on it.
3. **The whole note.** Read the file in full before using its fact. Never answer from the
   `description` line or from a snippet: the body carries the `Why` and the `How to apply`
   that change what the fact means.

## Matching

By the words first: the query against each note's `name` and `description` (the index), then
against bodies only if the index came up short. Match on meaning, not just the exact word — a
question about "the database choice" should find a note whose description says "why Postgres
and not SQLite". No embeddings are used; this is reading the index and the descriptions,
which is enough at the vault's size and stays exact.

More than one note matches: read the few that do, and answer from them together, saying if
they agree. Nothing matches: say so plainly — "nothing in memory on that" — and do not
invent a fact to fill the gap.

## By meaning, when the words fail

When the index and the descriptions do not name it and the question is about a thing, not a
word ("the database choice", "how the user wants to be told about blockers"), ask the local
model:

```
node "${CLAUDE_PLUGIN_ROOT}/tools/embed.mjs" search "<vault>" "<the question>" --k 5
```

It returns the nearest notes with a score; above about 0.5 the match is usually right. Read
the notes whole, as always. It needs the `@huggingface/transformers` package; when the tool
says it is missing, say so and stay with the word search. Never write a note from a search
result.

## Trust travels with the fact

When the answer leans on a note that is about code, ask the tool before relying on it; it
is local and takes a moment:

```
node "${CLAUDE_PLUGIN_ROOT}/tools/memcheck.mjs" check "<vault>"
```

A note it lists as `suspect` is still returned, and the answer says so: "the memory says X,
but the code that note describes has changed since; check before relying on it." A fact
handed over as firm when it is not is worse than no fact. A note with no link to code is
given plainly: who the user is, a preference, a pointer cannot be checked against code, and
that is not a caveat worth repeating.

## What recall never does

Change a note (that is `write` or `tidy`). Paste a note's body into the index. Surface a
`<private>` span. Carry a fact outside the conversation. Report a remembered fact as current
without saying it came from memory, when the fact is the kind that goes out of date.
