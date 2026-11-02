# For someone new — onboarding, explain this repo, how does this project work

One document a new contributor reads in ten minutes and then knows where to start. Written
from the repository, with evidence, not from what projects like this usually look like.

## Look, in this order

1. **What it is.** The README's first lines, the manifest's name and description, the entry
   point. One sentence: what the software does and for whom. If the repository does not say,
   that is the first finding.
2. **What it is built with.** Languages, frameworks, the datastore, the test runner, the
   build tool: from the manifest and lockfile, with versions only where they matter.
3. **How it is laid out.** The tree two levels deep; what each top directory is for, from
   what is in it, not from its name.
4. **How a request, command or event travels.** Pick the most typical one and follow it from
   entry to storage and back, with positions.
5. **How the project does things.** Read three files of each kind and write the convention
   they share, with one example position each: naming, error handling, validation, data
   access, tests, logging, configuration. A convention with exceptions says so.
6. **How to run it.** Install, configure, start, test: the exact commands, from the scripts
   and CI, tried when that is safe (no deploys, no migrations against anything real). A
   command that fails is reported, not left in the guide as if it worked.
7. **Where to look for what.** "To add an endpoint", "to change the schema", "to add a
   background job": the files touched, in order, from how the last such change was made
   (`git log` is the source).

## Write

Sections in that order, each short. Positions on every claim about the code. A final section,
**Unknown**, lists what could not be determined: an environment variable with no visible
consumer, a directory nobody imports, a script that fails. An honest gap is worth more to a
newcomer than a confident guess.

No history of the project, no praise, no list of every file. A page and a half is right for
most repositories.

## Where

The project's existing guide when there is one: update it, by `sync.md`. None: propose
`docs/onboarding.md`, write after a yes. Never overwrite a `CLAUDE.md` or `AGENTS.md`; offer
the additions as a diff.
