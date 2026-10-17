# Debt — the shortcuts taken on purpose, listed and judged

A shortcut is a limit accepted knowingly to keep the code small: a cache with no eviction
because the set is tiny, a parser that takes one date format because the feed has one, a
loop where an index would do at ten times the data. Taken on purpose, it is the right
move; forgotten, it is the bug nobody can explain two years later. So it is marked where
it lives, and this file is how the marks are read back.

## The mark

One line, in the code's own comment syntax, on the line it protects:

```
shortcut: <what it cannot do>, <when to replace it>
```

The first half is a fact about the code, the second a trigger that can be checked: a size,
a count, a feature, a date. "Improve later" is not a trigger. One mark per limit; a limit
with no trigger is not a shortcut, it is a bug, and goes to `atlas-fix`.

## The list

"atlas refactor debt", "what did we skip", "list the shortcuts", "technical debt": every
`shortcut:` mark in the project (`grep -rn "shortcut:" --include=*.<ext>`), one row each:

```
src/feed/parse.ts:41   one date format            fires when a second feed is added    not yet
src/cache.ts:12        no eviction, under 1k keys  fires above 1,000 keys               fired: 3,400 keys in prod config
```

Whether a trigger has fired is decided from the project, not guessed: the config, the data
sizes, the feature list as they are now. Fired rows first. For each fired row, the move
that would replace the shortcut, sized in the words of `method.md`, and nothing done to it
until the person picks. Nothing marked is removed, rewritten or "cleaned up" on the way.

## When a shortcut is taken here

Every shortcut this skill or `atlas-plan` takes while working is marked at once, in the
same change, and named in the report under `left`. A shortcut taken and not marked is the
one thing this file forbids.
