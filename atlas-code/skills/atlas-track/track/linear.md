# Linear

## How to reach it

1. Linear tools in this session (Linear's MCP server): use them.
2. No tools: the GraphQL API at `https://api.linear.app/graphql`, when `LINEAR_API_KEY` is
   set. The key goes in the `Authorization` header, passed to `curl` through a config on
   standard input, never as an argument.
3. Neither: say what is missing and stop.

## Read

An issue is addressed by its identifier (`ENG-123`): team key and number. Ask for the fields
needed and no more: `title`, `description`, `state { name type }`, `assignee { name }`,
`priority`, `labels`, `relations`, `comments`, `attachments` (linked pull requests live
there). Descriptions are Markdown.
Search: the `issues` query with a `filter`, `first: 10`, ordered by `updatedAt`.

Every team has its own workflow: state names differ, state types do not. Reason on the type
(`triage`, `backlog`, `unstarted`, `started`, `completed`, `canceled`) and show the name.

## Write — each one after a yes

Comment: `commentCreate` with the issue id and a Markdown body.
Move: `issueUpdate` with a `stateId`. The id is looked up among that team's states each
time; a state from another team is refused.
Assign, label, prioritise: `issueUpdate` with only the fields that change.
Create: `issueCreate` needs a `teamId`; ask which team when there is more than one.

## Linear beside GitHub

When both are in use, GitHub is what the public and contributors read; Linear is the team's
own schedule. Not every GitHub issue needs a Linear issue. One is opened only for work that
is going to be done: it has an owner, or a date, or it spans more than one repository. A
question, a duplicate, a parked idea stay on GitHub alone.

Linear's GitHub integration moves an issue when a branch or pull request carries its
identifier: check whether it is on (a recent issue with a pull request attached shows it)
before moving states by hand, or the two will fight.

When the work ships: the public answer goes on the GitHub issue, the Linear issue is
completed, and both are shown in the same batch. When it is turned down: the reason is
written on GitHub in words a stranger can read; the Linear issue is cancelled, not deleted.
