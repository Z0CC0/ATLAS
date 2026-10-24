# Security — when the request says security, auth, secrets or injection

Plain prose for every line here, whatever the compression level: a security finding that reads
two ways is not a finding. Every line is `breaks` unless the input cannot come from outside the
trust boundary, then `fragile` with the boundary named.

## Where input meets power

SQL, NoSQL, LDAP, shell, template, log, regex, XPath, `eval`: any string built from input and
handed to an interpreter. The fix is the parameterised form of that interpreter, named.
File paths from input: joined without resolving and checking the prefix; `..`, absolute paths,
symlinks. Archive extraction without path checks.
URLs from input fetched by the server (SSRF): no allowlist of hosts, redirects followed,
internal addresses reachable.
Deserialising input: pickle, `yaml.load`, Java `ObjectInputStream`, `BinaryFormatter`, type
names in JSON; no size or depth limit.
HTML from input rendered raw: `innerHTML`, `dangerouslySetInnerHTML`, `v-html`, `{!! !!}`,
`mark_safe`, `|safe`. `href`/`src` from input without a scheme check (`javascript:`, `data:`).

## Secrets

Keys, passwords, tokens, connection strings in source, in a public env prefix
(`NEXT_PUBLIC_`, `VITE_`, `REACT_APP_`), in a client bundle, in a log line, in an error message
sent to the client, in a URL query string, in `localStorage`. Each occurrence is a line, with
the exact position; the value itself is never quoted back.

## Who may do this

A state-changing endpoint, server action, route or handler added without the authorisation
check its neighbours have. Compare with the nearest existing one and name it.
Object access by id without checking the id belongs to the caller (IDOR).
CSRF protection removed or exempted without the reason written next to it.
Authentication endpoints without rate limiting; password reset or login that reveals which
accounts exist.
Session tokens readable by script; cookies without `HttpOnly`, `Secure`, `SameSite`.

## Crypto and transport

MD5 or SHA-1 for passwords or signatures; home-made encryption; `random` where
`secrets`/`crypto` is needed; TLS verification disabled; certificate pinning or ATS exceptions
added without a reason.

## Dependencies

A dependency added or upgraded: name, version, and whether the project's audit command
(`npm audit`, `pip-audit`, `cargo audit`, `govulncheck`) knows it. One line, `ask`, when the
command is not available.

## Not findings

Internal tools behind the perimeter when the diff says so; test fixtures with fake keys that
look fake; `Math.random` for jitter; `eval` in a plugin loader documented as one.
A missing best practice with no path from input to it. A guess about how the code is deployed.
A generic parser crash with no security effect. An effect only on the caller themselves
(self-impact). None of these is elevated to a security line; the first may be one `unclear`.

## Verdict

Each security line carries one of three verdicts after the tier, and the tier follows it:
- `confirmed` — the path is read end to end in source, from the entry where lower-trust input
  arrives to the sink, and the effect is shown: a bounded local check (a fixture, a function
  call, a parser input, a CLI run, a rendered policy — whatever the target's own interface is),
  or a trace precise enough that a reader can rerun it. Tier `breaks`. Severity never exceeds
  the effect that was shown.
- `needs_validation` — the source supports the claim but one fact outside the source decides
  it: a deployment setting, an identity, a route, a runtime flag. The line names that exact
  fact and the non-destructive way the owner can observe it. Tier `ask`. No severity. This is
  not a place to park a hunch: with no decisive missing fact the line is `rejected`.
- `rejected` — source, a visible control, a missing impact or an impossible prerequisite refutes
  it. Not printed as a finding; one line at the end, `N rejected on second look`, so the same
  claim is not raised again without new evidence.

Nothing deployed is contacted: no request to an endpoint, no external service, no shared
infrastructure, no production identity. Dynamic checks run only against a local copy with no
network; when that is not possible the line stays `needs_validation` and says which capability
was missing. On a second opinion, the second reviewer (`atlas-diff`) is given the candidate
lines without their verdicts and asked to refute each one from the source; a `confirmed` that
it cannot confirm drops to `needs_validation`. The fix on a `confirmed` line is the narrowest
source change that enforces the invariant, not one that moves the trust somewhere else. A clean
diff has zero confirmed lines; nothing is invented to fill the space.

(Verdict rules distilled from cloudflare/security-audit-skill, `VALIDATION-AND-REPORTING.md`,
MIT: three verdicts, verifier ≠ hunter, severity bounded by demonstrated impact, no live probing.)
