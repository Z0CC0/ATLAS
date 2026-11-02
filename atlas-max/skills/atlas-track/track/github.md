# GitHub issues — with the `gh` command

`gh auth status` first. Not logged in: say so and stop; `gh auth login` is the user's to run.

## Read

`gh issue view 42 --comments` for one issue with its thread.
`gh issue view 42 --json title,body,state,labels,assignees,closedByPullRequestsReferences`
when fields are needed rather than text.
`gh issue list --search "reset email in:title,body" --state all --limit 10` to search; the
same search before opening a new issue, to find the one that already exists.
`gh pr list --search "42 in:body"` and the issue's timeline for the work already attached.

Another repository: `--repo owner/name` on every command; never rely on the current folder
when the user named a different project.

## Write — each one after a yes

`gh issue comment 42 --body-file <file>`: the body from a file in the scratch directory, so
quotes and newlines survive the shell.
`gh issue edit 42 --add-label bug --remove-label needs-triage`: only labels the repository
already has (`gh label list`); a new label is a separate question.
`gh issue edit 42 --add-assignee @me`.
`gh issue close 42 --reason completed` or `--reason "not planned"`, with a comment first
when the closer is not the author.
`gh issue create --title … --body-file <file>`: after the duplicate search, and using the
repository's issue template when `.github/ISSUE_TEMPLATE/` has one.

## Linking work

A pull request closes its issue through a line in its body: `Fixes #42`, one per issue. In
the title it does nothing. An issue in another repository: `Fixes owner/name#42`. Work that
only touches the issue without finishing it: `Refs #42`.

## Limits worth knowing

The search API returns at most a thousand results and is rate limited: narrow the query
rather than paging through everything. Issues and pull requests share one number sequence:
`gh issue view` on a pull request number fails, use `gh pr view`.
