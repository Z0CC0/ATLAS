# A pull request

Needs `gh` (or `glab`) logged in. Not available: write the title and body, give the URL to
open by hand, stop.

## Before

On a branch that is not the base. Working tree clean, or the uncommitted changes named and
left out on purpose. Commits ahead of the base. No pull request already open for the branch
(`gh pr list --head <branch>`): if there is one, update it, do not open a second.
`atlas-verify` has run on this state; its verdict goes in the body. Not `READY`: say so and
ask whether to open as a draft.

## What goes in

Read the commits (`git log <base>..HEAD`) and the diff (`git diff <base>...HEAD --stat`),
and the project's template when it has one (`.github/pull_request_template.md` and its
variants): the template's sections are used as they are.

**Title**: what changes for whoever uses the code, in the project's style (conventional
prefix when the history uses one). Under seventy characters. Not the branch name.
**Body**, in whole sentences:
what changes and why, in two or three lines: the reason, not the list of files;
how it was checked: the commands run and what came back; what was not checked;
what a reviewer should look at first, and what is deliberately not in this PR;
anything that must happen around the merge: a migration, a flag, a config value, an order
of deploys;
the issue it closes, with the closing keyword the host understands.
No changelog of every commit. No screenshots promised and not attached.

## Size

A diff too large to review is split before it is opened: by layer, by step of the plan,
refactor apart from behaviour. Say where the cut would go and ask.

## Open

Show the title, the body, the base, draft or not. After a yes: push the branch with
upstream, create the PR. Return the URL, one line.

Never from here: merging, approving one's own PR, force-pushing over review comments,
re-requesting review, editing branch protection. After review comments arrive, changes are
new commits, not a rewritten history, unless the project squashes on merge and says so.
