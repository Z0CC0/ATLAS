# Strip — what comes out of the copy, and what replaces it

Work in the copy only. Keep a log as you go: every file removed, every value replaced, with
its position. The report and the `.env.example` are built from that log.

## Files that do not travel

Environment files with real values (`.env` and every variant except an example); private
keys and certificates (`*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*`, keystores); cloud and
service account credentials; database files and dumps; logs; local assistant and editor
settings that hold paths, tokens or permissions; backups and exports; customer data,
however small the sample.

A removed file that the code needs in order to start is replaced by an example of the same
shape with made-up values, and the README says how to make the real one.

## Secrets in code and config

A hard-coded credential becomes a read from the environment, in the way the project already
reads configuration; where it reads none, the simplest way the language offers. The name
goes into `.env.example` with an empty or plainly fake value and a comment saying what it
is and where one is obtained.

Missing variable at start-up: the program says which one, and stops. A silent fallback to a
default credential is not written.

Look where credentials hide: connection strings with a password inside; URLs with a token
in the query; `Authorization` headers in tests and fixtures; recorded HTTP cassettes and
snapshots; notebooks with output cells; CI files; container and compose files; seed data;
comments; a "temporary" script at the root.

## Personal and internal

Names, personal email addresses, phone numbers, postal addresses, account ids: out, or
replaced by obvious inventions (`Ada Example`, `user@example.com`). Author metadata in
manifests is kept only if the user wants to be named.
Home directory paths and machine names become relative paths or placeholders.
Internal hostnames, private IP addresses, company and client names, ticket keys from a
private tracker, links to internal wikis and chats: replaced by neutral placeholders
(`api.example.com`, an address from the documentation range `192.0.2.0/24`, `ACME`), the same
placeholder for the same original everywhere, so the code still agrees with itself.
Comments that discuss colleagues, customers, incidents or pricing: out.

## Without breaking it

After each kind of replacement, the build and the tests in the copy. A test that needed a
real secret is made to read a fake one or to skip with a stated reason; it is not deleted.
Test data that was real is replaced by invented data of the same shape.

Not to be "cleaned": licence headers and notices of third-party code, attribution, the
names of open-source dependencies, public URLs of public services.

## Unsure

A long random-looking string that might be a secret or might be a hash, a fixture or a
public id: it is not guessed. It goes to the user as one line with its position, and stays
on the scan's list until answered.
