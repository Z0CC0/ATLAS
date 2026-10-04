# Jira

## How to reach it

1. Jira tools in this session (an Atlassian MCP server): use them. Their names differ by
   server; look at what is there rather than assuming.
2. No tools: the REST API, version 3, when `JIRA_URL`, `JIRA_EMAIL` and `JIRA_API_TOKEN` are
   set in the environment. Check that they are set without printing them.
3. Neither: say what is missing and stop. Setting up a server or a token is the user's.

Credentials never go on a command line, where the process list and the shell history keep
them. With `curl`, feed them as a config on standard input:

```bash
printf 'user = "%s:%s"\n' "$JIRA_EMAIL" "$JIRA_API_TOKEN" | curl -sS -K - \
  -H 'Accept: application/json' "$JIRA_URL/rest/api/3/issue/PROJ-123?fields=summary,status,assignee,description,issuelinks,comment"
```

## Read

One issue: `GET /rest/api/3/issue/<key>`, with `fields=` naming what is needed; the default
answer is very large and goes to a file, not into the conversation.
Comments beyond the first page: `GET /rest/api/3/issue/<key>/comment`.
Search: `POST /rest/api/3/search/jql` with `{"jql": "...", "maxResults": 10, "fields":
["summary","status"]}`. JQL that covers most questions:
`project = PROJ AND status = "In Progress" ORDER BY updated DESC`;
`assignee = currentUser() AND resolution = Unresolved`;
`text ~ "reset email" AND created >= -30d`.

Descriptions and comments come back as a document tree (ADF), not text: read the `text`
leaves in order. Acceptance criteria are often in a custom field: when the description has
none, look through the issue's fields for one whose name says so before writing `unsaid`.

## Write — each one after a yes

Comment: `POST /rest/api/3/issue/<key>/comment`. The body is ADF, not a string: a `doc`
holding `paragraph` nodes holding `text` nodes. A plain string is rejected.
Move: the target is a transition, not a status. `GET /rest/api/3/issue/<key>/transitions`
lists the moves allowed from where the ticket is, with their ids; then `POST` the id to the
same path. Ids differ between projects: never reuse one from another ticket. A target that
is not in the list cannot be reached in one step: say which moves are available.
Fields: `PUT /rest/api/3/issue/<key>` with only the fields that change.
Links: `POST /rest/api/3/issueLink`, with the link type names the instance defines.

## When it fails

`401`: the token or the email is wrong, or the token was revoked. `403`: the account cannot
see the project. `404` on a key that exists in the browser: usually the same as 403. `400`
on a comment: the body is not ADF. `400` on a transition: a required field of that move is
missing; the transitions call with `expand=transitions.fields` names it. Quote the error
message exactly; do not retry with a guess.
