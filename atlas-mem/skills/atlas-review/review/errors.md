# Errors that disappear — for diffs that touch error handling, and for every pre-merge review

A failure the program hides is worse than one it reports: the data is wrong and nobody knows.
Each item is a `breaks` when the hidden error changes a result the user sees, `fragile`
otherwise.

Empty handler: `catch {}`, `except: pass`, `rescue nil`, `_ = err`, `let _ = result`, `try?`
that drops a meaningful error. Name the error it would hide.

Fallback that lies: an error turned into `null`, `[]`, `0`, `""`, a default object, so the
caller proceeds as if it had data. Name what the caller does next with the fake value.

Error replaced by a worse one: rethrown without the cause (`throw new Error("failed")`,
`return err` without wrapping), the stack trace gone, the original message gone. The fix names
the wrapping form of the language.

Logged and forgotten: an error written to a log at the wrong level and execution continues as
if nothing happened. Logging is not handling.

Missing on the paths that fail in production: network call without timeout, file or database
work without the error branch, multi-step write without a transaction or rollback, retries
without a limit, a queue consumer that drops the message on exception.

Async errors nobody awaits: a promise or task started and not awaited or not caught; an
`async` callback inside `forEach`; a background task whose failure has no reader.

Partial success reported as success: a loop that fails on item 7 of 10 and returns the first 6
with no mention of the rest.

Generic catch at the top that converts every failure into one HTTP 500 or one toast, so the
caller cannot tell a bad input from a dead database. One line, `unclear`, unless the diff
introduced it, then `fragile`.
