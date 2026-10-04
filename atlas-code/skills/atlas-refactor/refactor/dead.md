# Dead code — finding it and taking it out

## Find

Use the detector the project already has configured; else the usual one for the toolchain,
run without installing anything into the project:

| toolchain | unused code | unused dependencies |
|---|---|---|
| JavaScript, TypeScript | `npx knip` | the same run |
| Python | `vulture <package>`; `ruff check --select F401,F811,F841` | `deptry .` |
| Go | `deadcode ./...`; `staticcheck -checks U1000 ./...` | `go mod tidy` shown as a diff |
| Rust | the compiler's `dead_code` warnings | `cargo machete` |
| Java, Kotlin | the IDE inspection export, or the build's unused warnings | the build tool's dependency analysis |
| C# | analyzers `IDE0051`, `IDE0052`, `CS0169` | `dotnet list package` against usages |

No tool available: for each exported name in scope, search the whole repository for it. Slow,
and it only proves anything when the search covers every place code can live: source, tests,
scripts, templates, config, docs with runnable examples.

A detector's output is a list of suspects. It goes to a file; only the sorted result comes
back here.

## Sort — three classes

`safe`: private to its file or module, no references anywhere, not reachable by name.
Unused imports, unused locals, private functions, files nothing imports.
`check`: has a way to be reached that a detector cannot see. Look for each before calling
it dead:
- loaded by a name built at run time: dynamic `import()`, `require(variable)`, `importlib`,
  reflection, `getattr`, dependency injection by string, plugin registries
- found by convention: route and page files, test fixtures, migrations, serialisers, admin
  classes, signal handlers, CLI commands, anything a framework discovers by location or
  decorator
- named in something that is not code: config, YAML, templates, HTML, SQL, CI files,
  `package.json` scripts, a Dockerfile
- exported from a published package: the users are outside this repository
- behind a feature flag or a platform check that is off here and on somewhere else
`leave`: entry points, public API, configuration, type declarations for outside consumers,
anything whose removal cannot be tested here.

A dependency is dead only when nothing imports it and nothing invokes it: check scripts,
config files that load plugins by package name, peer requirements, and type-only packages.

## Show, then take out

The list, by class, with the evidence in a few words each, and the total lines. The user
approves the `safe` class as a whole and the `check` items one by one. `leave` is never
proposed.

Then the loop from `method.md`, one item per run: a file, a function, a dependency. Start
with what has nothing depending on it. After removing a function, look at what it alone was
keeping alive: its helpers, its imports, its tests. A test for removed code goes with it,
and is counted apart in the report, so the lower test count is explained.

Not done: commenting code out instead of removing it; leaving a stub "for compatibility"
nobody asked for; removing a thing because it looks old.
