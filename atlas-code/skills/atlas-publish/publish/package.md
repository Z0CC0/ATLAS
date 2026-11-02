# Package — what a stranger needs

The reader has never seen this project, has none of the user's accounts and will give it
two minutes. Everything here is checked against the code, not written from memory.

## README

In this order, and nothing a section has no content for:

1. What it is, in one or two sentences, without adjectives. What it is not, when people
   would assume otherwise.
2. A way to see it work: the shortest path from clone to a visible result, as commands that
   were run in the clean clone below. Requirements with versions, read from the manifest
   and the lock file.
3. Configuration: every variable from `.env.example`, what it is for, which ones are needed
   to start and which are optional.
4. How to run the tests.
5. Layout: only what is not obvious from the folder names.
6. Status, honestly: what works, what is missing, whether it is maintained.
7. Licence, in one line, and credits for what was built on.

An existing README is edited, not replaced: its voice is the project's. Out go: badges for
services not set up, screenshots that show private data, a roadmap nobody will follow,
claims of performance with no measurement behind them.

## Other files

`LICENSE`: the full standard text of the chosen licence, with the year and the holder the
user gave. Never paraphrased.
`.env.example`: from the strip log; every name, a comment, no real value.
`.gitignore`: covers the real `.env`, keys, build output, local databases.
Third-party notices: when a dependency's or a copied file's licence requires them.
`CONTRIBUTING`, a code of conduct, issue templates, a security contact, a setup script, a
`CLAUDE.md`: only when asked. An empty promise of community is worse than none.
A setup script, when asked: checks for what it needs and says what is missing; does not
install system software or run with elevated rights; safe to run twice.

Manifest fields: name, description, licence, repository URL pointing at the new home;
`private: true` and internal registry settings removed only if the user means to publish
the package too.

## The clean clone — the proof

Clone the copy into a new folder in the scratch directory. With no environment of the
user's, no global tools the README does not list, and only `.env.example` copied to
`.env`: install, build, tests, and the README's quick start, exactly as written.

```
clean clone  install ok · build ok · tests 88 passed · quick start: server answers on :3000
```

What fails here would have failed for the first visitor. Usual causes: a file that was
ignored and never tracked; a dependency installed globally on the user's machine; a path
that existed only there; a step the user does from habit. Fix it in the copy, or write the
missing step into the README; then clone and run again from zero.

Something that cannot run without a real account (a payment key, a paid API): the README
says so at the top of the quick start, and the run records which step was skipped and why.
`ok` is written only for what ran.
