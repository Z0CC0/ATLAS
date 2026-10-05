# Dependencies — what the project pulls in, and what is known broken

The code the project did not write is most of the code it ships. A known vulnerability in a
dependency is the cheapest way in, and the easiest to miss by reading the project's own files.

## Run the project's own audit

Each ecosystem has a command that checks the installed versions against a public advisory
database. Use the one the project's lock file points to; it reads what is locked, not what is
latest. Through `atlas-runner` when it exists, so the long output stays out of the
conversation; else to a file in the scratch directory, read back only the lines that name a
vulnerability.

| lock file | command | reads |
|---|---|---|
| `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` | `npm audit --omit=dev` (and once with dev); `pnpm audit`; `yarn npm audit` on Yarn 2+, `yarn audit` on Yarn 1 | the lock |
| `requirements.txt` | `pip-audit -r <file>` (or `pip-audit` in the active environment) | the pins |
| `uv.lock`, `poetry.lock`, or any manifest the above do not read | `osv-scanner scan source -r .` (older releases: `osv-scanner -r .`) | the lock |
| `Cargo.lock` | `cargo audit` | the lock |
| `go.sum` | `govulncheck ./...` | the modules actually reached |
| `composer.lock` | `composer audit` | the lock |
| `Gemfile.lock` | `bundle audit check --update` | the lock |
| `*.csproj`, `packages.lock.json` | `dotnet list package --vulnerable --include-transitive` | the graph |

No lock file, or the command not installed: say so in the scope line, and fall back to
`osv-scanner` (see the table for its syntax), which reads many lock and manifest formats, when
that is present. Nothing available: the
dependency pass is `not run`, not guessed. Never install a scanner without a yes.

## Read the result, do not just forward it

An advisory is not yet a finding. For each one that the tool reports:

- **Is the vulnerable path reached?** A hole in a function the project never calls is lower
  than one on its main path. `govulncheck` answers this itself; for the others, search the
  code for the package's used surface. Say which it is.
- **Is it reachable from outside?** A parser vulnerability on data a user can send is
  `critical` or `high`; the same on a build-time dev tool is `low`.
- **Is there a fixed version, and does it cross a major?** It changes the advice, not the
  tier: a fix within the same major is cheap, take it now; one that needs a major upgrade is
  named with that cost.

Tiers follow `method.md`, set by reachability, not by the advisory's own label alone.

## Beyond the advisory database

- **A direct dependency that is unmaintained**: last release years old, archived repository,
  a single maintainer. Not a vulnerability today, a `low` worth naming, especially for
  anything parsing untrusted input.
- **A dependency pulled from outside the registry**: a git URL, a tarball URL, a package
  installed from a path. Where it comes from and whether the source is pinned to a commit, not
  a moving branch.
- **Install scripts**: a dependency that runs a `postinstall`/`preinstall` script is code that
  ran on the machine already. Worth a line when one is unexpected on a leaf package.
- **Lock file integrity**: the lock exists and is committed; `npm ci` / `--frozen-lockfile`
  used in CI so the resolved versions are the audited ones.

## Report

Findings in the line format of `method.md`, the package and version in place of a file:

```
lodash@4.17.11  high  prototype pollution (CVE-…), reached via the merge in src/config.ts:40 on user-supplied JSON → arbitrary property set. Upgrade to 4.17.21, same major.
tar@4.4.1  medium  path traversal on archive extract; the project only extracts its own release tarballs, not user input. Upgrade when convenient.
left-pad@1.0.0  low  unmaintained since 2016, one maintainer; trivial to inline.
```

The scope line names the command run, the number of dependencies checked, and whether dev
dependencies were included.
