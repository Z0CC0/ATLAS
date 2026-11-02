# Limits — what the code was allowed not to do, listed and judged

A limit is accepted on purpose to keep the code small: a cache with no eviction because
the set is tiny, a parser that takes one date format because the feed has one, a loop
where an index would do at ten times the data. Accepted knowingly, it is the right move;
forgotten, it is the bug nobody can explain two years later. So it is marked where it
lives, and this file is how the marks are read back.

## The mark

One line, in the code's own comment syntax, on the line it protects:

```
limit: <what it cannot do>, <when to replace it>
```

The first half is a fact about the code, the second a condition that can be checked: a
size, a count, a feature, a date. "Improve later" is not a condition. One mark per limit;
a limit with no condition is not a limit, it is a bug, and goes to `atlas-fix`.

## The list

"atlas refactor limits", "what did we leave out", "list the limits", "technical debt":
every `limit:` mark in the project (`grep -rn "limit:" --include=*.<ext>`), one row each:

```
src/feed/parse.ts:41   one date format            replace when a second feed is added   not yet
src/cache.ts:12        no eviction, under 1k keys  replace above 1,000 keys              due: 3,400 keys in prod config
```

Whether a condition is met is decided from the project, not guessed: the config, the data
sizes, the feature list as they are now. Rows that are due come first. For each, the move
that would lift the limit, sized in the words of `method.md`, and nothing done to it until
the person picks. Nothing marked is removed, rewritten or "cleaned up" on the way.

## When a limit is accepted here

Every limit this skill or `atlas-plan` accepts while working is marked at once, in the
same change, and named in the report under `left`. A limit accepted and not marked is the
one thing this file forbids.
