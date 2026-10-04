# In step with the code — update, sync, stale, or nothing named

## What can be derived, is

| the source | what it documents |
|---|---|
| scripts in `package.json`, `Makefile`, `justfile`, `pyproject`, `Cargo.toml` | the commands a contributor runs |
| `.env.example`, config schema, the code that reads the environment | configuration: name, required or not, default, what it controls |
| route files, an OpenAPI or GraphQL schema | the API reference |
| exported functions, types, CLI flags | the public interface |
| `Dockerfile`, compose files, CI workflows | how it is built, run and deployed |
| migrations | the data model as it is now |

For each derived section: read the source, read the section, change only the lines that
differ. A variable read by the code and absent from `.env.example` is a finding in the
report as well as a line in the table. A section that is hand-written and not derivable is
checked, not regenerated.

## What has gone stale

Look for, and list with position:
a path, file, command, flag, function or endpoint named in a document that no longer exists;
a code block that no longer runs: an import that fails, a signature that changed;
a version, number or limit that the code states differently;
a screenshot or diagram next to code that changed after it, by `git log` dates;
a document whose neighbouring code changed many times since the document last did;
two documents that disagree with each other.
Each is fixed when the code says what is true, and listed as `ask` when only the author
knows.

## Who owns which fact

When the documentation as a whole is drifting, sort what exists into four jobs before
writing anything, reusing the files that are there:
**rules** — what contributors and agents must do (`CONTRIBUTING`, `CLAUDE.md`, policy);
**map** — what exists and where (architecture overview, index);
**status** — what is healthy, blocked, in progress, deliberately removed;
**history** — decisions and removals that explain the present (decision records, changelog).
A fact lives in one of them and is linked from the others. "Where is auth" is the map; "is
the auth migration blocked" is status; "why we left sessions" is history. A removed approach
is written down under status or history so it is not rebuilt by someone who did not know.
A job with no document: propose the smallest section in an existing file.

## Report

```
README.md            commands table: 2 added, 1 removed (script `seed` no longer exists)
docs/config.md       REDIS_URL documented; read at src/cache.ts:8, was missing
docs/api.md          stale: POST /v1/charge described, route removed in a3f9c1e — removed
docs/deploy.md       ask: mentions a staging cluster not in any config

4 files, 1 question
```

One line per file with what changed and why. No document is reprinted in the conversation.
