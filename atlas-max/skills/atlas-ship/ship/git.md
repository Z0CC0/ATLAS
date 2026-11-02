# Git — branches, history, tags, getting out of trouble

Plain prose in this file's output for anything that rewrites or discards: the command, what
it will change, and what will be gone afterwards.

## Follow the project

How this repository works is in its history, not in a preference: read `git log --oneline
--graph` on the main branch. Merge commits or a straight line; squashed pull requests or
not; commit message style; branch names; how releases are tagged. Do it that way. Suggest a
different model only when asked.

When asked which model: short-lived branches off one main branch, merged by pull request, is
enough for most teams. Long-lived release branches are for software with several supported
versions in the field, and cost a merge discipline someone has to keep.

## Shared history is not rewritten

A commit that someone else may have pulled stays as it is. On a branch that is only yours
and not yet reviewed: amend, squash, rebase freely. After others have it, or after review
began: new commits. Updating a branch from main: the project's habit, merge or rebase; a
rebase of a shared branch needs every other holder to know.
A force push is `--force-with-lease`, never bare `--force`, never to a protected branch,
and only after a yes that names the branch.

## Commits

One logical change each; it builds and passes on its own, so history can be bisected. The
message by `atlas-commit`. Unrelated changes found in the working tree are separate commits
or left unstaged; `git add -p` when a file holds two changes.

## Tags and releases

The project's scheme. A tag points at a commit that passed the pipeline. A pushed tag is
not moved: a wrong release gets a new version. The changelog entry is written from the
merged pull requests since the last tag, for readers who use the software: what changed for
them, what they must do.

## Getting out of trouble

Look before acting: `git status`, `git log`, `git reflog`. Almost nothing committed is lost;
the reflog holds where every branch pointed.
Undo the last commit, keep the work: `git reset --soft HEAD~1`.
Undo a commit already shared: `git revert`, which adds a commit, not `reset`.
A commit on the wrong branch: `git cherry-pick` it onto the right one, then remove it from
the wrong one if that branch is unshared.
A bad merge or rebase in progress: `--abort`. Finished: the branch's previous position is
in the reflog.
A deleted branch: its last commit is in the reflog; recreate the branch there.
A secret committed: rotate the secret first, that is the fix; rewriting history is the
cleanup and needs everyone to re-clone.

## Never without a yes

`reset --hard`, `clean -fd`, `checkout --` or `restore` over uncommitted work, `branch -D`,
`push --force-with-lease`, `rebase` of a shared branch, deleting a remote branch or a tag,
`filter-repo`. Each is shown with what will be gone.
