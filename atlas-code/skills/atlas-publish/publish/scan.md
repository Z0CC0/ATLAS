# Scan — is this safe for strangers to read

Read-only. The scan changes nothing; it reports. It is done by a reader that did not do the
stripping: a fresh subagent given the path and this file, where there is one; otherwise
here, from the list below and not from memory of what was cleaned.

Every text file in the tree is covered, hidden ones too. Skipped: the `.git` folder itself,
dependency folders, minified bundles, binaries (which are listed, see below).

## 1. Secrets — any confirmed hit fails the scan

A scanner when one is installed, with its output to a file: `gitleaks dir <path>`, or
`trufflehog filesystem <path>`. Then, with or without it, by search:

- provider key shapes: `AKIA` and `ASIA` followed by sixteen capitals and digits; `ghp_`,
  `gho_`, `ghs_`, `github_pat_`; `sk-`, `sk_live_`, `rk_live_`, `pk_live_`; `xoxb-`,
  `xoxp-`; `AIza`; `SG.`; `glpat-`; `npm_`
- `-----BEGIN` followed by `PRIVATE KEY`
- three base64 segments joined by dots starting `eyJ`
- a URL with `user:password@` in it
- webhook URLs of chat and automation services
- an assignment to a name containing `secret`, `token`, `passw`, `apikey`, `auth`,
  `credential` whose value is a literal of eight characters or more and not a placeholder
- any line of thirty-two or more characters from the base64 or hex alphabet in a config or
  environment file: `note`, for a human to judge

## 2. Personal data — fails

Email addresses that are not `example.com`, `noreply` or a project address the user
confirmed; phone numbers; home directory paths with a user name; real-looking names in
fixtures and seeds; author fields the user did not confirm.

## 3. Internal references — fails

Hostnames that do not resolve publicly or belong to a company domain; private address
ranges outside documentation; internal tracker keys and links; names of clients or of other
private repositories; `ssh user@host` lines.

## 4. Files that should not be there — fails

Any file from the first list in `strip.md`. Also: binaries and archives with no stated
source; anything over a few megabytes; `.git` folders nested inside the tree.

## 5. Rights — fails when a condition is unmet

Each dependency's licence against the chosen one. Source files with another party's
copyright header, and vendored code: the licence that came with them is present. Fonts,
images, datasets and models: where they came from and whether they may be redistributed;
unknown is a finding, not a pass.

## 6. Completeness — notes

Every variable the code reads from the environment is in `.env.example`, and nothing there
has a real value. No link in the README points at something private.

## 7. History — when it was kept

Sections 1 to 4 over every commit, not the working tree alone. Commit author names and
emails listed once each for the user to confirm.

## Report

```
secret    config/dev.ts:14  Stripe live key shape, assigned to a constant
personal  seeds/users.json:3  real-looking name and gmail address
internal  docs/deploy.md:22  hostname build01.corp.acme
note      .env.example:9  40-character value; placeholder or real?

NOT CLEAN  1 secret · 1 personal · 1 internal · 0 files · 0 rights · 1 note  (318 files read)
```

One line per finding: kind, position, what it is. Never the secret itself, not even
shortened. Verdict: `CLEAN` when sections 1 to 5 have nothing and every note has been
answered; `NOT CLEAN` otherwise; `CANNOT TELL` when part of the tree could not be read or a
tool failed, naming the part. A scan of patterns proves that known shapes are absent, not
that nothing is there: the verdict line always carries how many files were read.
