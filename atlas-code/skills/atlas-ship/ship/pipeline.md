# CI and CD — a workflow, a pipeline

Read the existing pipeline files and the scripts they call. The pipeline should run the same
commands a developer runs locally, by name: a check that exists only in CI is a check nobody
can reproduce.

## Stages, cheapest first

1. Install, from the lockfile, with a cache keyed on it.
2. Lint and format check; type check.
3. Tests; unit before integration before end to end.
4. Build the artifact once; later stages use that artifact, they do not rebuild.
5. Publish or deploy, only from the protected branch or a tag, only after the rest is green.
A failure stops what depends on it. Independent jobs run in parallel. What takes longest is
measured before it is optimised: `atlas-perf` with the pipeline as the operation.

## Fast without lying

Cache dependencies and build outputs with keys that change when their inputs do; a cache
that is never invalidated makes green builds that fail from clean.
Cancel superseded runs on the same branch.
Run only what the change touches when the repository is large and the tool can tell
reliably; run everything on the main branch regardless.
Flaky tests are fixed or quarantined with a reason and a date; automatic retries of the
whole suite hide them.

## Safe

Third-party actions and images pinned by commit SHA or digest, not by a moving tag.
The token's permissions set explicitly to the least the job needs; read-only by default.
Secrets only in the jobs that use them, never echoed, never available to workflows
triggered by pull requests from forks. A workflow that runs on `pull_request_target` or on
comments and checks out the contributor's code is treated as a security finding.
No secret, key or token written in the workflow file.
Deploy jobs behind an environment with required reviewers where the host offers it.
Dependencies and base images scanned when the project has a scanner; the result reported.

## Changing it

A pipeline change is tested on a branch, where it can fail without blocking others. Show the
diff of the workflow file and say what will run differently and when. Required checks,
branch protection and environments are settings on the host: they are proposed, with where
to click or the command, and changed only after a yes.

## Report

Per job: what it runs, its trigger, how long it takes now, what changed. A red pipeline is
diagnosed through `atlas-runner`: the first failing step and its deciding line, quoted.
