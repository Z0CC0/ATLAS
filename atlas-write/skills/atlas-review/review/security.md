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
