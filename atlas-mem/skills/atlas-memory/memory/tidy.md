# Tidy — keeping the vault honest over time

A vault rots in three ways: two notes that say the same thing, a note that is simply wrong,
and an index that no longer matches the files. Tidy fixes those. Every change is listed
first and made only after a yes.

## Duplicates

Two notes that state the same fact are merged into one: the better-named one survives, the
other's unique detail is folded in, every `[[link]]` to the removed one is repointed. Then
the code links follow the note:

```
node "${CLAUDE_PLUGIN_ROOT}/tools/memcheck.mjs" rekey "<vault>" <removed-slug> <surviving-slug>
```

It moves the links across and keeps the worse of the two trust values: merging never makes a
suspect note look firm.

Two notes that look alike and state different facts stay two, linked to each other; merging
them would lose a distinction. Three notes drifting around one subject usually mean one note
and two links.

## Wrong notes

A note the user has confirmed is wrong or obsolete is deleted, its index line with it, the
`[[links]]` to it removed, and its code links dropped:

```
node "${CLAUDE_PLUGIN_ROOT}/tools/memcheck.mjs" unlink "<vault>" <slug>
```

A `suspect` note is not clutter and is not deleted here: it is a fact to be looked at
(`check.md`). Only a note the user called wrong goes.

## Orphans

`check` lists as `orphan` any note that has code links and no file: it was deleted or renamed
outside this skill. Renamed: `rekey` to the new name. Deleted: `unlink`. Ask which when it is
not obvious from the vault.

## The index

`MEMORY.md` is reconciled with the files: a note with no index line gets one; a line pointing
at a file that is gone is removed; a hook that no longer describes its note is rewritten. One
line per note, never a note's content.

## Links between notes

Every `[[slug]]` must point at a real note; a dangling one is repointed to the note that
absorbed its target, or removed. A note nothing links to is not wrong on its own.

## When

On request. Worth offering after a check that left several notes resolved, or when the index
has grown hard to scan. Never on a schedule, never automatically.

## The report

```
merged    2 → 1   (fetch-rate-limit absorbed fetch-503; 1 link repointed, code links moved)
removed   1        (old-widget-plan, confirmed obsolete; code links dropped)
orphans   1        (worker-notes → rekeyed to worker-language)
index     1 line added, 1 removed, 1 hook rewritten
links     1 dangling repointed
```

A `<private>` span moves with its note, intact, and never appears in the report.
