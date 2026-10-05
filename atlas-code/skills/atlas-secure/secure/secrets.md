# Secrets — in the files, and in the history

A secret removed from the latest version but left in the git history is still public the
moment the repository is. This pass covers both, and it never prints a value: a finding says
which key, in which file, at which commit.

## The working tree

A scanner when one is installed, output to a file: `gitleaks dir .`, or
`trufflehog filesystem .`. Then, with or without it, by search, over every tracked text file
(hidden ones included; `.git/`, dependency folders, minified bundles and binaries excluded):

- provider key shapes: `AKIA`/`ASIA` + sixteen; `ghp_`, `gho_`, `ghs_`, `github_pat_`;
  `sk-`, `sk_live_`, `rk_live_`, `pk_live_`; `xox[bpar]-`; `AIza`; `SG.`; `glpat-`; `npm_`
- `-----BEGIN` followed by `PRIVATE KEY`
- three dot-joined base64 segments starting `eyJ` (a JWT)
- a URL with `user:password@`
- a webhook URL of a chat or automation service
- an assignment to a name containing `secret`, `token`, `passw`, `apikey`, `auth`,
  `credential` whose value is a literal of eight characters or more and is not a placeholder
- any thirty-two-plus-character base64 or hex string in a config or environment file: a
  `note`, for a human to judge

Where it is read: a secret in source is worse when it also sits in a client bundle or a
public-prefixed variable (`NEXT_PUBLIC_`, `VITE_`, `REACT_APP_`), in a log line, in an error
returned to the client, or in a URL query. That raises the tier.

## The history

The commit that removed a secret did not remove it from the history. Scan the whole history,
not the tree alone:

- `gitleaks git .` when it is installed (it walks every commit), to a file.
- else `git log -p -G'<pattern>'` for each shape above (`-G` takes a regular expression; `-S`
  takes a literal string and would miss them), or `git log -p` piped through the same
  patterns, over the full history. On a large repository, limit the first pass to the
  files that currently or ever held configuration.

Author names and emails in the history are listed once each in the scope, so the user knows
what is public about who committed; they are not a finding on their own.

## A found secret is treated as compromised

Taking it out of the tree, or out of the history, does not make it safe. If it ever reached a
remote, a build log, a shared machine or another person, it is live until rotated. Every
confirmed secret is reported with that instruction: revoke it and issue a new one, now,
whatever is done to the file. Rewriting history (`git filter-repo`) is offered as a second
step, with the warning that commit hashes change and that anyone who already cloned keeps the
old copy — rotation is what actually closes it.

## Not a finding

A key that is plainly fake in a fixture or an example (`sk-xxxx`, `AKIAEXAMPLE`, `changeme`); a
public identifier that only looks secret (a publishable client id documented as public); the
project's own `.env.example` with empty or placeholder values. Each is passed over, and a
borderline one is listed as `note` with its position for the user to settle, never guessed
either way.

## Report

```
config/dev.ts:14         critical  Stripe live secret key, in source and tracked → full API access. Revoke now, move to the environment.
docs/setup.md:22         high      a real database URL with the password in it. Revoke, rotate, replace with a placeholder.
history a1b2c3d:.env     critical  .env with the SMTP password was committed in 2024 and removed later; still in the history. Rotate the password; rewriting history is secondary.
seeds/users.json:3       note      a 40-character token-shaped value. Real, or a fixture?
```
