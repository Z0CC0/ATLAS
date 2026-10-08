# ATLAS min

Compression only. Two levels, one command, no subagents, no other dials. The rules that go
beyond compression are removed from this package, not switched off.

It ships off. Nothing changes until you type `atlas low` or `atlas high`.

```
atlas low      shorter answers: filler, pleasantries, hedging, articles and the copula go
atlas high     half the words: every fact stays, every explanation goes
atlas status   what is on
atlas off      back to nothing
```

Code, error strings, paths, numbers, negations and proper names are never touched at either
level. Anything written for other people (commits, docs, pull requests, memory files) is
ordinary prose whatever the dial says. The setting is per project and persists across
restarts, in `~/.claude/atlas-state/`, outside the plugin.

## Install

```
/plugin marketplace add Z0CC0/ATLAS
/plugin install atlas-min@atlas
```

`node` must be on the PATH: the hooks are JavaScript. No dependencies, no build step, no
telemetry, no network.

## What it costs

153 tokens of descriptions in every session, 1,073 tokens of rules injected at `low`, a
reminder of 27 to 32 tokens per turn. Measured against no plugin on 48 questions
(`claude-opus-5-5`, 2026-09-26): `low` 40% less output in English and 39% in Italian,
`high` 47% and 44%, with 0 or 1 of 263 details lost. The full bench, with every answer it
generated, is in the `atlas-test/` folder of the repository.

## Licence

MIT.
