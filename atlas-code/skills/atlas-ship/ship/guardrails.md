# Guardrails for an operation that cannot be undone

Before any step that deletes, overwrites, publishes or changes what runs for other people,
three things are written down and shown, and the step waits for the yes. Not because the
model is careless, but because the person deciding needs the same three facts every time,
in the same place, to decide in ten seconds.

## The three facts

**Blast radius.** What exactly changes, how many of them, and who notices: "drops the
`sessions` table, 48,000 rows, every logged-in user is logged out"; "replaces the image
tag `latest`, the three services that pull it restart on their next deploy"; "deletes the
volume `pgdata`, the only copy of the dev database". Numbers from the system (a count
query, `kubectl get`, `docker volume inspect`, `terraform plan`), not estimated.

**The way back**, verified, not assumed. A backup that exists at a path with a size and a
date; a previous image tag that still exists in the registry; a `git revert` that would
apply cleanly; the terraform state backed up before apply. "Can be restored from backup"
without the backup's name is not a way back. An operation with no way back is said to have
none, in those words, and the yes is asked knowing that.

**The dry run**, when the tool has one: `terraform plan`, `kubectl apply --dry-run=server`,
`helm diff`, `rsync --dry-run`, `docker compose config`, a `SELECT COUNT(*)` with the same
`WHERE` as the `DELETE`, `--what-if`, `--check`. Its output is read before the real run,
and the real run is refused if the dry run shows something the plan did not say.

## Rules

One irreversible step per yes; a script that chains three gets three.
The exact command is shown, with its target (cluster, namespace, database, bucket, branch)
named by its real name, not "prod".
Credentials and tokens are never printed, never written to a file in the repository, never
passed in a command line that lands in the shell history when an environment variable or a
file outside the repository does the job.
A step on the wrong target is the most common disaster: the context (`kubectl config
current-context`, `aws sts get-caller-identity`, `gcloud config get project`, the database
URL's host) is printed before the step and checked against the one the plan named.
After the step: the one check that proves it did what was said (the count, the status, the
health endpoint), and the way back's instructions written where the next person will find
them (the runbook, the PR, the changelog).

## When something is already broken

Symptom, then evidence, then hypothesis, then diagnosis, then the fix, then the proof, then
what prevents it next time, in that order and written down as it goes. A fix applied before
the evidence is a guess with side effects; a fix without the proof is a hope. The rollback is
the first option considered, not the last: restoring the last known good state and then
diagnosing in peace beats diagnosing under load.
