# Labels: code is never deleted, it is marked

The fear this answers: an old function stays in the repository, nobody calls it, and one day
it is found by a grep and used again, by the model first of all. Deleting it does not help:
a wrong deletion breaks a program weeks later, far from the cause, and the *why* it was
replaced goes with it. So the old code stays, and it carries a label that reaches whoever
finds it.

## The six labels

| label | meaning | effect |
|---|---|---|
| CANONICAL | the reference version across the projects; copy from here | offered first |
| PREFERRED | among equivalent variants, this one | offered before its sisters |
| SUPERSEDED | replaced by another; needs its successor | never shown without the successor on it |
| WRONG | tried, does not work; the reason is the value | never offered; the reason comes out when found |
| FRAGILE | works under conditions; read before touching | offered with the warning |
| EXPERIMENTAL | not yet proven in real use | offered only when asked for |

A SUPERSEDED without a successor is refused: a dead end is worse than no label. Every label
needs its reason: a verdict without a why is the first thing to be doubted later.

## Writing one

```
node "${CLAUDE_PLUGIN_ROOT}/tools/labels.mjs" set "<vault>" <symbol> SUPERSEDED --to <successor> --why "<reason>" [--file <path>] [--project <name>]
node "${CLAUDE_PLUGIN_ROOT}/tools/labels.mjs" set "<vault>" <symbol> CANONICAL --why "<reason>" --project <name>
node "${CLAUDE_PLUGIN_ROOT}/tools/labels.mjs" list "<vault>"
node "${CLAUDE_PLUGIN_ROOT}/tools/labels.mjs" unset "<vault>" <symbol>
```

Write a label when the work decides one: a function replaced by another, a variant chosen
among several, an approach that failed with a reason worth keeping. Say which label and why
in the answer. When a note in the vault tells the same story, link them: the note names the
symbol, the label names the note's fact in one line.

## How a label reaches a search

The table lives in `<vault>/.atlas/labels.json`. A hook on `Grep` and `Read` looks up every
result: when a labelled symbol appears in it, the label is attached as context, one line per
symbol, with the successor and the reason. Nothing is hidden and nothing is changed; the old
code is still readable, it just cannot be found bare. The hook finds the vault through the
nearest `.atlas.json` (`{"vault": "<path>"}`) at or above the working directory, then
`~/.claude/atlas.json`, then the Claude Code memory folder of that directory.

When a label shows up on a result, obey it: do not call a SUPERSEDED symbol, use its
successor; do not reuse a WRONG one; read a FRAGILE one before touching it. Say in the answer
that the label was there.

## Where this stops

Labels are about symbols by name: a name used by two unrelated things carries the label on
both, and the file in the label tells them apart. Removing dead code is a separate decision,
taken by the user, from `codegraph dead` with its three grades; a label never deletes
anything, and the tool refuses nothing except a label it cannot stand behind.
