# Containers — a Dockerfile, an image, a compose file

Read the project's existing files first and change them; a second Dockerfile beside the
first is rarely the answer.

## An image

**Small and layered for the cache.** A multi-stage build: one stage with the compilers and
dev dependencies, a final stage with only what runs. Dependency manifests copied and
installed before the source, so a code change does not reinstall everything. A
`.dockerignore` that keeps out `.git`, dependencies, build output, local env files, tests
when they are not needed in the image.
**Pinned.** The base image by version, or by digest where reproducibility matters; never
`latest`. Dependencies from the lockfile, with the install command that respects it.
**Not root.** A dedicated user, files owned by it, a read-only root filesystem when the
application allows. No package manager caches, no build tools, no shells that are not needed
in the final stage.
**No secrets in layers.** Nothing secret in `ARG`, `ENV` or a `COPY`: it stays in the image
history. Build-time secrets through the builder's secret mount; run-time secrets from the
environment or a secret store.
**Honest about health and shutdown.** A health check that tests what the service does, not
that the process exists. The process as PID 1 receives the stop signal and finishes
in-flight work: the exec form of `CMD`, no shell wrapper swallowing signals.
**One process, logs to standard output, configuration from the environment.**

## A compose file, for development

Services named for what they are; the application built from the Dockerfile's development
stage with the source mounted for reload; dependencies (database, cache, queue) at the same
major versions as production.
`depends_on` with health conditions, not sleep loops. Named volumes for data that should
survive a restart; none for data that should not.
Only the ports a developer needs published, bound to localhost. Service-to-service traffic
by service name on the compose network.
Defaults that work with no secret: a development password in the compose file is acceptable
and marked as such; a real one is never there. Overrides in a second file for what differs
per machine.
Limits on memory and CPU when one service can starve the rest.

## Check

Build it. Run it. The health check goes green; the container stops within the grace period
on a stop signal; the image size, before and after, when size was the point. An image
scanner when the project has one configured; its findings are reported, not auto-fixed by
changing base images.

## Never without a yes

Pushing an image to a registry; `docker system prune`, volume removal, or anything that
deletes data; changing the base image's major version.
