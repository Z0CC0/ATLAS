# A deploy

Plain prose in this file's output, at any compression level: a deploy step that reads two
ways is an outage.

## Know the way back before going forward

Before anything else, write the rollback: the exact command or click that returns to the
previous version, how long it takes, and what it does not undo (a migration that dropped a
column, emails already sent, events already consumed). If the honest answer is "it cannot be
rolled back", that changes the plan: a flag to turn the feature off, a deploy in two steps,
a backup taken first.

## How it rolls out

Use what the platform already does; do not invent a strategy the infrastructure cannot run.
**Rolling**: instances replaced a few at a time. Old and new run together for a while, so
they must agree on the database and on each other's messages.
**Blue-green**: the new version beside the old, traffic switched at once, the old kept warm
for the switch back. Costs double capacity for the overlap; the database is still shared.
**Canary**: a small share of traffic to the new version, watched, widened in steps. Needs
metrics per version and a number that means "stop".
**Flag**: the code ships dark and is turned on later, for some users first. The deploy and
the release become two events; the second is the reversible one.

## Order when the data changes

Old code must survive the new schema, and new code the old, because both run during the
rollout. So: add before use, stop using before remove.
1. A migration that only adds (a column nullable or with a default, a table, an index built
   without locking writes).
2. Code that writes both shapes or tolerates both.
3. Backfill, in batches, resumable.
4. Code that reads the new shape only.
5. Later, in its own deploy, the removal of the old.
A single deploy that renames or drops what running code still uses is the commonest way to
take a site down.

## Checklist, shown before the yes

`atlas-verify` with its release angle: the verdict. The version or commit going out and the
one it replaces. Migrations in the range, and whether each is reversible. Configuration and
secrets the new version needs, present in the target environment. The health check that
decides the rollout succeeded. Who is watching, and what they watch for the first fifteen
minutes: error rate, latency, the business number that matters. The rollback, written.

## After

Check the health endpoint and the key flow on the live target, read-only, through
`atlas-test`'s site mode. Compare error rate and latency with before. Say `live`, or roll
back and say why. A deploy is not reported done because the command exited zero.

## Never without a yes

The deploy command, a migration against a real database, a rollback, scaling, a DNS or
routing change, turning a flag on for everyone.
