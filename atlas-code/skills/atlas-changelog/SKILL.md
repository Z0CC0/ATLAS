---
name: atlas-changelog
description: >
  Writes what changed, from the git history and the pull requests, never from memory: a
  changelog entry in the project's format, the release notes for the people who use the
  thing, and the version the changes call for. Use for "atlas changelog", "release notes
  for this version", "what changed since the last tag", "which version is this" — in any
  language.
---

A changelog is read by people deciding whether to upgrade and by people hunting the commit
that broke them. Both want facts with dates and versions, nothing else. Every line here is
traceable to a commit, a pull request or a diff; a change not in the history is not in the
changelog.

## What to read

Everything below lives in the `changelog/` folder beside this file. One file per task:

how to read the history and group what it says → `from-git.md`, always first
"changelog", "CHANGELOG.md", "add an entry", "which version" → `format.md`
"release notes", "announce", "what's new", "for the users" → `release-notes.md`

## The range

"Since the last tag" by default: `git describe --tags --abbrev=0` to the working tree. A
range named by the request (two tags, two dates, a branch) replaces it. No tags: since the
first commit of the current version in `package.json`, `pyproject.toml`, `Cargo.toml` or the
project's version file, else the whole history with a warning that the start is a guess.

## What needs a yes

Writing into `CHANGELOG.md` or the release notes file: the text is shown first, whole. Bumping
the version in a manifest: shown as the exact line change. Creating a tag or a release on a
forge: never here; that is `atlas-ship`, with its own yes.

## With the other skills

`atlas-commit` writes the messages this reads; a history of good messages makes this cheap.
`atlas-ship` tags and publishes after the entry exists. `atlas-publish` wants the entry
before a package goes out.

## Form

The entries are written for other people, in the language the existing changelog uses (or
the README's, when there is none), whole sentences, uncompressed; the active compression
level governs only the conversation around them.
