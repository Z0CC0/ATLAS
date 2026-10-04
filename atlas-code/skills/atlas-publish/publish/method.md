# Method — read every time a project is prepared for the public

## Asked once, before anything is copied

Where it will live (owner and repository name), the licence, one sentence saying what the
project is, and whether the commit history must be kept. Offer a default for each from what
the project shows (`gh api user -q .login`, an existing LICENSE, the manifest's description)
and take the answers in one round.

The licence is the user's decision. Say only what bears on it: the licences of the
dependencies and of any code copied in, and whether one of them puts conditions on the
choice. Code that belongs to an employer or a client is theirs to release, not the user's:
ask when the project looks like work for someone.

## The copy

The original is never edited, renamed or pushed anywhere by this skill.

The copy goes beside it as `<name>-public`, or where the user says. It is made from what
git tracks (`git ls-files`), not from the folder: build output, dependencies, local
databases, editor state and ignored files stay behind by construction. Not a git
repository: copy the folder minus what the usual ignore rules for the toolchain exclude,
and list what was left out.

## Order

1. `strip.md`: take out and replace, in the copy.
2. `scan.md`: check the copy, by a reader that did not do step 1.
3. Anything found: back to step 1 for those items, then the whole scan again. At most three
   rounds; still not clean, stop and hand over the list.
4. `package.md`: what a stranger needs, then the run from a clean clone.
5. The gate.

## History

Default: a new history. `git init` in the copy and one first commit. The old history holds
every secret that was ever committed and removed, every internal name, every author email;
cleaning it commit by commit is slow and one miss undoes it.

History must be kept: then the scan covers every commit, not the working tree alone
(`gitleaks git`, or `git log -p` searched), and what it finds is rewritten with
`git filter-repo` on the copy. Say plainly that this is the riskier road and that commit
hashes change.

## A secret that was found

Taking it out of the copy does not make it safe. If it ever reached a remote, a log, a
shared machine or another person, it is treated as known: the user revokes it and issues a
new one, whatever happens to this project. One line per secret in the report, with where it
was, never its value.

## The gate

```
copy      ../invoicer-public  (142 files, new history, 1 commit)
scan      CLEAN  round 2 · 0 secrets · 0 personal · 0 internal · 2 notes
runs      clean clone: install ok · build ok · tests 88 passed
licence   MIT; dependencies: 61 permissive, 0 conflicting
rotate    STRIPE_SECRET_KEY (was in config/dev.ts), SMTP password (was in docker-compose.yml)
next      gh repo create ada-example/invoicer --private --source ../invoicer-public --push
```

The repository is created private first. The user looks at it on the host as a stranger
would see it, and the change to public is a second step, shown and approved separately.
A scan that is not `CLEAN`, or a clean clone that does not run: no `next` line is offered.

Nothing is published to a package registry here unless asked; a published version cannot
be reused or fully withdrawn.
