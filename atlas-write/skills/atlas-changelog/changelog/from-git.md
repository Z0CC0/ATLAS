# Reading the history

The source is the history, read whole for the range, not the last ten commits. Commands
that only read: `git log --no-merges --format='%h %ad %s%n%b' --date=short <range>`, `git log
--merges` for the pull requests, `git diff --stat <range>` for what moved, `git tag --sort=
-creatordate` for the versions. Pull request titles and bodies, when the forge CLI is there and
already authenticated, add the why; never log in, never ask for a token.

## Grouping

One line per change the reader can notice, not one per commit. Ten commits that build one
feature are one line; one commit that fixes three bugs is three lines. Group under the
headings the format asks for (added, changed, fixed, removed, security, deprecated) by what
the change does for the reader, not by the directory it touched.

## What goes in

Behaviour that changed; a default that changed; something that can now be done; something
that can no longer be done; a bug the reader could have met, with the symptom in the words
they would use; a dependency change that changes what runs where; a security fix, named
plainly, without the exploit.

## What stays out

Refactors with no visible effect; formatting; test-only changes; CI changes that affect no
user; "update README" unless the README is the product; version bumps of the thing itself;
merge commits. A commit that says "fix" and nothing else: read the diff before deciding; the
line describes what the diff does, not what the message says.

## When the history is poor

Messages like "wip", "stuff", "fix": the diff is read and the line written from it, and the
entry says at the top that it was reconstructed from diffs for the range, so the reader
weighs it. Nothing is invented to fill a heading: a heading with nothing under it is left out.

## Breaking changes

Found by reading, not by the message: a removed public function, a renamed CLI flag, a
changed default, a schema or file format that old versions cannot read, a required field that
was optional. Each one is its own line, marked, with what the reader has to do (the old form,
the new form). One breaking change decides the version, whatever the rest of the entry says.
