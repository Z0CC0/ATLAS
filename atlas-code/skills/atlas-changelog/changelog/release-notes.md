# Release notes

The changelog is for the record; the release notes are for the people who will install this
version. They answer three questions in this order: what can I do now that I could not, what
do I have to do to upgrade, what is still broken. Written from the changelog entry, never
from memory, and shorter than it.

## Shape

A title with the version and the date. A first paragraph of two or three sentences saying
what this release is about, in the reader's terms; a release that is only fixes says so. Then
three headings, each left out when empty:

**New and changed.** The lines of the changelog that a user would notice, rewritten for them:
what it does for them, where to find it, the one thing to know. Internals, refactors and
dependency bumps are not here even when they are in the changelog.

**Upgrading.** Every breaking change as an instruction: what was, what is, what to change,
in the order to do it. Data migrations with what they touch and how long they take when it
was measured. "No action needed" when that is true, so the reader does not have to wonder.

**Known issues.** What this release does not fix and the reader could hit, with the
workaround when there is one. An empty heading is dropped, not written as "none" unless
the project's notes always carry it.

## Rules

Every claim traceable to a line of the changelog or to a test or measurement in the repo.
Numbers only when measured in this release (speed, size, counts); "faster" alone is not a
note. No marketing adjectives; the feature's name and what it does. Names of people are
written only when the project's notes name contributors already. A screenshot is promised
only if the file is attached.

## Where

The project's own place: `RELEASE_NOTES.md`, a `docs/releases/<version>.md`, the body of the
forge release (handed to `atlas-ship`, which needs its own yes), or the top of the README's
"What's new" when that is the project's habit. The text is shown whole before it is written.
