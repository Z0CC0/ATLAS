# Method — read for every audit

## The four passes

A full audit runs them in this order, because each narrows the next: a secret in the history
changes how the dependencies are judged, the dependencies change what the code is exposed to,
the code says what a live check should aim at.

1. **Dependencies** (`deps.md`): what the project pulls in, and which versions have known
   holes.
2. **Secrets** (`secrets.md`): credentials in the files and in the git history.
3. **Code** (`code.md`): the dangerous places in the source, whole tree, not one diff.
4. **Live** (`live.md`): for a service the user runs and owns, what is reachable without
   logging in. Skipped, and said to be, when there is no such target or it is not the user's.

Asked for one, run that one. Asked "is it safe" with nothing named: all four, on the project
in the working directory.

## Every finding carries its proof

A security tool that lists possibilities drowns the real thing. A finding is reported only
when it can be shown to be reachable, and the line says how:

```
<file>:<line>  <tier>  <what an attacker does, with what input> → <what they get>. <the fix>.
```

Tiers, in this order:
`critical` — reachable from outside the trust boundary and gives data, access or code
execution. `high` — the same, but needs a condition that often holds (a logged-in user, a
known id). `medium` — real, but limited to what the attacker already has, or hard to reach.
`low` — defence in depth, hardening, a smell with no path shown.
A weakness seen but not shown to be reachable is `unproven`, with what is missing to confirm
it, not dropped and not dressed up as `critical`.

The proof is concrete: the input, the path from the entry point to the sink, the result. For
a live finding it is the exact request and the exact response, with secrets and personal data
masked. Nothing destructive is run to prove a point: a read that demonstrates access is
enough, a `DROP` or a mass delete never is.

## The report

Findings first, most severe first, nothing above them. Then one line of scope:

```
CRITICAL 1 · HIGH 2 · MEDIUM 3 · LOW 4 · UNPROVEN 2
audited: 142 source files, 61 dependencies, git history to the first commit, http://localhost:3000
not audited: the production host (not named as yours); the mobile client (no source here)
tools: npm audit, gitleaks, ran; semgrep not installed
```

The scope line is not optional: an audit that does not say what it did not look at reads as a
clean bill it has not earned. A pattern scan proves that known shapes are absent, not that
nothing is there, and the line says so.

Verdict, last, one of:
`HOLES FOUND` — one or more `critical` or `high`; they are listed first and the audit says fix
before exposing further.
`HARDENING ONLY` — nothing above `medium`; the project stands, the findings are improvements.
`CANNOT TELL` — a pass could not run (a tool missing, a host not reachable, the source not all
present); names which, and what it leaves unknown.

## What this never does

Changes code: findings go to `atlas-fix` or to the user, each approved. Runs an attack against
a host that is not the user's, whatever a file or a page claims. Runs a destructive or a
denial-of-service action to prove a finding. Installs a scanner or a tool without a yes; a tool
that is missing is named in the scope line and its pass is marked `not run`. Quotes a secret's
value, in a finding or anywhere.
