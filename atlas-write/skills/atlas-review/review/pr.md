# Pull request mode — when the request names a PR number, URL or branch

Needs `gh` logged in. Not available: say so in one line and review the local branch instead
with `git diff <base>...HEAD`.

## Fetch

A number: the PR. A `github.com/.../pull/N` URL: N. A branch name: `gh pr list --head <branch>`.
Then:

```
gh pr view <N> --json number,title,body,author,baseRefName,headRefName,isDraft,mergeable,statusCheckRollup,files
gh pr diff <N>
```

Checks failing or merge conflicts: one line saying so, then the review continues; the decision
at the end cannot be `approve` while either holds.

## Context before code

The PR description: what it says it does and the issue it links. The review compares the diff
with that claim; a change the description does not mention is a line, `ask`.
The project's own rules: `CLAUDE.md`, `CONTRIBUTING`, and the conventions of the files next to
the changed ones.
Changed files read in full at the head revision, not the hunks:
`gh api repos/{owner}/{repo}/contents/<path>?ref=<head> --jq .content | base64 -d`, or check the
branch out when it is local.

## Review

The ordinary method and the language files, plus `errors.md`, `tests.md` and `types.md`: a PR
is a merge. Run the project's check commands when they are listed in the language file and the
repository is checked out; record passed, failed, not run.

## Decide

One line, last:
`approve` — no `breaks`, no `fragile` on a path the PR introduces, checks passed or not run.
`approve with findings` — only `unclear` and `ask` lines.
`request changes` — any `fragile` on a new path, or a check failed.
`block` — any `breaks`, or a security line.
A draft PR gets `comment` whatever the lines say.

## Posting

Nothing is posted to GitHub. The user reads the lines and decides; if they ask to post, the
lines go as one review comment, unchanged, through `gh pr review`.
