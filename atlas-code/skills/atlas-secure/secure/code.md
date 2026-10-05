# Code — the whole tree, read for the way in

`atlas-review`'s `security.md` holds the catalogue of dangerous places: input meeting an
interpreter, secrets, authorisation, crypto, deserialisation. That catalogue applies here
unchanged; read it. The difference is the scope and the method: not one diff, the whole
program, worked from the outside in, so that what is reported is reachable and not just
present.

## Map the entry points first

An attacker starts where their input enters. Find every door before judging any room:

- HTTP: routes, controllers, handlers, server actions, GraphQL resolvers, webhook receivers.
- Other transports: message-queue consumers, scheduled jobs that read external data, CLI
  arguments, files or uploads the program parses, environment it trusts.
- The trust boundary: which of these can be reached without authenticating, and which only
  after. A weakness behind a login is lower than the same one in front of it.

List them with positions (`atlas-finder` when it exists). This list is the spine of the audit:
every `critical`/`high` finding traces back to one of these doors.

## Follow the input to power

For each door, follow what the caller controls until it reaches something that can hurt: a
query, a shell, a file path, a template, a fetch the server makes, a deserialiser, raw HTML, a
redirect. That path, from door to sink, is the proof the finding needs. The sinks and their
fixes are in `security.md`; this file is about showing the path, not re-listing them.

Where the code uses a framework, know what the framework does for free and what it leaves open:
an ORM parameterises but its raw-query escape hatch does not; a template auto-escapes but its
raw filter does not; a framework adds security headers only when configured. A finding names
the escape hatch, not the framework.

## The checks that are about the whole program, not one line

These are where a whole-tree audit finds what a per-diff review cannot:

- **A missing check, not a wrong one.** One endpoint among twenty that changes state without
  the authorisation its siblings have; one object fetched by id with no owner check while the
  rest check. Found by comparing across the tree, not by reading one file.
- **The configuration the program runs with.** Debug mode on in production config; permissive
  CORS (`*` with credentials); cookies without `HttpOnly`/`Secure`/`SameSite`; TLS
  verification disabled anywhere; default or shared credentials in a config file; an admin
  interface bound to all interfaces; verbose errors returned to the client.
- **The security controls that should exist and do not.** Rate limiting on login and on
  expensive endpoints; a size limit on request bodies and uploads; a content security policy;
  validation at the edge rather than deep inside.
- **Dangerous patterns across the tree**: `eval`/`exec`/`new Function` on anything derived from
  input; a shell invoked with a string rather than an argument array; `pickle`/`yaml.load`/
  native deserialisers on external bytes; user input in a path handed to the filesystem; SSRF
  where the server fetches a URL the user gave.

## Scale

A large tree is not read line by line. Work from the entry points outward, follow the paths
that reach a sink, and sample the rest by the patterns above (a grep for each sink, output to a
file, the hits read in context). Say in the scope line how much was read closely and how much
was sampled: a sampled tree is `CANNOT TELL` on what the sample did not cover, not a clean
bill.

## Report

Findings in the line format of `method.md`, the path shown in the "what an attacker does"
part:

```
src/api/export.ts:34   critical  no auth on GET /api/export; an anonymous request returns every user's records → full data disclosure. Add the session + role check the sibling /api/report has (src/api/report.ts:20).
src/files.ts:88        high      filename from the query joined to the upload dir without resolving; `?name=../../.env` reads outside it → arbitrary file read. Resolve and check the prefix.
config/prod.yaml:3     medium    DEBUG: true in the production config → stack traces and config leak to clients. Set false; drive from the environment.
src/auth.ts:51         low       login has no rate limit → credential stuffing is cheap. Add a per-IP and per-account limit.
```
