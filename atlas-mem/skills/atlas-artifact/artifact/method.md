# Method — read for every artifact

## The tool

`tools/artifact.mjs`, two folders up from this file (`<plugin>/tools/artifact.mjs`), run
with the absolute path of the artifact:

```
node <plugin>/tools/artifact.mjs detect <path>
node <plugin>/tools/artifact.mjs app    <app.asar | installed folder | source folder> [--all] [--detail full] [--page N --per 60]
node <plugin>/tools/artifact.mjs sqlite <file.db> [--table <name> --limit 20]
node <plugin>/tools/artifact.mjs map    <file.map> [--line L --col C]
node <plugin>/tools/artifact.mjs bin    <file.exe | .dll | .node | ELF | Mach-O> [--detail full]
node <plugin>/tools/artifact.mjs fuses  <app.exe | installed folder>
node <plugin>/tools/artifact.mjs compare <app A> <app B> [--all]
node <plugin>/tools/artifact.mjs observe <installed folder | exe> --yes [--seconds 12]
```

`detect` first when the kind of file is not obvious: it names the format and prints the
next command. Every command prints one JSON record; `--text` prints the same as a few
readable lines, which is what goes in the conversation. The JSON is read only for a
specific list (a channel, a module, a row), with `--page` so the conversation holds one
page and not the archive.

## The record

Every answer carries the same spine, and a line in the report quotes from it:

- `id`: derived from the record itself; the same bytes read the same way give the same id,
  so a fact can be cited later and checked.
- `subject`: name, path, format, size, sha256 of the file read. The hash is what makes
  "the app I looked at" a fact and not a memory.
- `confidence`: `observed` is read from the bytes (a channel name in a string literal);
  `derived` is computed from observed facts (a module reached from the entry; a handler
  registered through the app's own wrapper); `inferred` is a reading that could be wrong
  and says why.
- `coverage`: `complete`, `partial` or `unknown`, with the scope in words: what was read,
  what was counted and not read, how many bytes.
- `limitations`: what this way of reading cannot see. They are repeated in the report, not
  dropped because they are inconvenient.

A fact without a file and line (or an offset, or a table) is not reported as a fact.

## Summary before detail

The first call is always the summary. It answers most questions ("does it phone home",
"how is the renderer isolated", "what starts a process") in twenty lines. The full record
or a page of it is read only for the question that needs it, and only that page. The same
command is not run twice on the same subject: the id is the same, the answer is the same.

## What stayed unknown

Reading bytes leaves gaps: a channel built from a variable, a module too large to scan,
a URL assembled at run time, a wrapper the reader did not recognise. Each gap is a line in
the report under `unknown`, with where it was seen and what would settle it (running the
program under a debugger, reading the source, a second artifact). An unknown is never
promoted to a fact by repetition.

## Report

```
subject   Demo 1.2.3  demo.asar  180.5 MB  sha256 f9bb…12c9  (ev_dcee14d9a957…)
entry     electron/main.cjs; 11 of 14 modules reached from it
ipc       60 handlers (49 through the wrapper `handle`, derived), 76 senders; every renderer call handled
bridge    iaApi (electron/preload.cjs:3); window contextIsolation:true nodeIntegration:false
hosts     26: api.anthropic.com, claude.ai, chatgpt.com, …  (full list on request)
starts    cmd.exe, powershell, claude  (electron/claude-runner.cjs:32,145; claude-updater.cjs:29)
unknown   1 IPC channel from a variable (electron/ipc.cjs:166); node_modules not scanned
not       not run; nothing outside the archive read; renderer bundle minified, names are the bundler's
```

One line per kind of fact, the file and line for anything a person might go and look at,
the unknowns, and what was not done. The person's question is answered first, in one
sentence, before the lines.
