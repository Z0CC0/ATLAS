# Before a release — when the request says release, production, launch, deploy, go live

Green CI says the tests pass. This asks a different thing: what happens to real users and
real data when this is live. It is engineering triage from evidence in the repository, not a
compliance audit, and it says so if asked for one.

Run the ordinary chain in `method.md` first; a release audit on a red build is noise.

## Evidence, cheapest first

`git log` and `git diff --stat` from the last release tag or the base branch: what is
actually going out.
The deploy path: CI workflow, Dockerfile, deploy scripts, infrastructure files. Which
environment variables the code reads, and whether each is documented and checked at startup.
Routes, webhooks, background jobs, cron entries, migrations in the range.
Nothing is sent to an outside scanner or service unless the user names it and approves.

## Five lenses, each line with the file and the reason

**Who can do what.** A new route, action or job without the authorisation check its
neighbours have; an admin path reachable by a normal user; a secret in the bundle or a log;
CORS widened; a rate limit missing on login, signup, reset, or anything that costs money to
call.

**Data.** A migration that cannot be reversed, or that drops or rewrites while old code is
still running; no backup or backfill step named; a write path with no transaction; a unique
constraint relied on and not declared; time, money or encoding handled differently in two
places.

**Money and messages.** A webhook without signature verification or without idempotency (the
provider will send it twice); an amount computed on the client; a retry that can charge or
email twice; a test key or test mode flag reachable in production.

**Operations.** No health check; no error reporting on the new path; a new external call
without timeout; a job with no retry limit; a feature with no way to turn it off; no rollback
written down: "how do we undo this deploy" has an answer in the repository or it does not.

**The user's first minute.** The empty state, the error state and the loading state of what
is new; the main flow with no data, with a slow network, on a phone width; a broken link from
the entry page. Checked through `atlas-test`'s site mode when there is a URL, otherwise read
from the code and marked `not run`.

## Report

The chain's report first, then:

```
release  v2.3.0 ← v2.2.1   41 files, 3 migrations

who      1   src/routes/export.ts:12 no auth check; its siblings use requireUser
data     1   migrations/0042 drops users.legacy_id in the deploy that stops writing it
money    0
ops      2   no rollback note for 0042 · new call to billing API has no timeout
user     not run — no URL given

BLOCK  data: 0042 breaks the running version; who: export is public
```

Verdict: `SHIP`, `SHIP WITH FIXES` (nothing that harms users or data), `BLOCK` (a line under
who, data or money that does). The word is the user's to overrule; the lines are not softened
to make the word easier.
