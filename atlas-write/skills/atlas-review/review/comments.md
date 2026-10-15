# Comments and docstrings — only when the request names them

A comment is reviewed against the code next to it, nothing else.

False: the comment says the function returns X, the code returns Y; the parameter it describes
was renamed or removed; the "temporary" workaround is three years old by `git blame`. Tier
`breaks` when a caller following the comment would misuse the function, `unclear` otherwise.

Stale reference: names a file, flag, ticket, URL or behaviour that no longer exists in the
repository. `unclear`.

Restates the code: `i++ // increment i`. One line for all of them, with the count, `unclear`.
Not written at all when the project's style is to comment every line.

Missing where it would change what a reader does: a non-obvious invariant, a side effect, a
unit (seconds or milliseconds, bytes or kilobytes), an ordering requirement, a reason for a
magic value, the `// SAFETY:` on an `unsafe` block. `fragile` when the missing fact leads to
a wrong call; `unclear` otherwise.

Debt markers: `TODO`, `FIXME`, `HACK`, `XXX` added by the diff. One line each, `ask`: "done
before merge, or tracked where?".

Not findings: missing docstrings on private or self-describing functions; comment length;
tone; language of the comment.
