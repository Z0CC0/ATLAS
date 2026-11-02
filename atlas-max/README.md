# atlas-max

Everything ATLAS ships, in one install: `atlas-code` and `atlas-mem` together. Thirty-one commands, ten subagents, the guard hook, the memory and the tools. Below are the pages of the two builds it joins, then the page of `atlas`.

Install it instead of them, never beside them. Two ATLAS builds in one Claude Code each inject the rules and the reminder, so you pay for them twice and every skill is listed twice.

It costs the most in every chat, on or off. Its figures are in the table under "Five builds".

---

# atlas-mem

Everything in `atlas`, plus `atlas review`, `atlas fix`, `atlas commit` and the subagents
`atlas-finder`, `atlas-diff` and `atlas-runner`, plus a memory that notices when it has become false. This page covers
what the build adds. Everything below the line is the README of `atlas` itself, and its
measurements are about `atlas`, not about this build.

## What it adds

One command, `atlas memory`, in five modes chosen by the words of the request:

| type this | and it |
|---|---|
| `atlas memory, remember that …` | writes one note for one fact, in the vault's own format, and links it to the code it describes when it describes code |
| `atlas memory, what did we decide about …` | finds the right note and returns it whole, saying whether the code it describes has changed since |
| `atlas memory, is it still true?` | checks every note linked to code against the code as it is now and reports: `firm`, or `suspect` with the reason |
| `atlas memory, tidy` | duplicates, orphans, a broken index; nothing deleted without a yes |
| `atlas memory, mark X as superseded by Y` | labels a symbol (CANONICAL, PREFERRED, SUPERSEDED with its successor, WRONG with its reason, FRAGILE, EXPERIMENTAL); a hook then puts the label on every grep or read that finds it |

Nothing is written to memory automatically. A note is created when the work decides a fact
is worth keeping: a decision made, a correction given, a constraint stated. This keeps the
memory small and every note true, which is what makes the check meaningful.

## How a note knows it is stale

The memory is a folder of markdown notes, one fact per file, with a short index. That part
already exists in most setups and is not replaced. The build adds a tool, `tools/memcheck.mjs`,
and a sidecar file beside the notes, `<vault>/.atlas/links.json`, that the tool alone reads and
writes. For a note about code it records which repository, which file, which definition, a
fingerprint of those lines, the commit, and what that code directly depends on in the same
repository. The fingerprint ignores line endings, trailing spaces, blank lines and lines that
hold only a comment in that file's language (`#` in Python, `//` in C and JavaScript, `--` in
SQL; `#define` in C stays code): a comment added inside a function is not a change (measured:
it made a note suspect for nothing). Older fingerprints keep their own recipe and `check --write`
remakes them while the code is intact. At check time the tool parses the file again and decides:

| state | meaning | effect on the note |
|---|---|---|
| held | the lines are exactly what they were | firm |
| moved | the same code at other lines, or in another file | firm; `--write` records where |
| changed | the definition is there, its code is different | suspect |
| dep-changed | the code is intact, but a function it calls or a constant it reads changed | suspect |
| renamed | the same body under another name | suspect; the report says the new name |
| gone / missing | the symbol, or its file, is nowhere in the repository | suspect |

A `suspect` note is still returned when asked for, with the caveat; nothing decides for you
whether the fact survived the change. A note whose code is put back as it was returns to
`firm` at the next check by itself. The body of a note is never changed by a check.

Parsing uses tree-sitter grammars compiled to WebAssembly, shipped in `tools/wasm/` (22 MB,
MIT, from the `@vscode/tree-sitter-wasm` package): JavaScript, TypeScript, TSX, Python, Go,
Rust, Java, C#, C/C++, Ruby, PHP, Bash, PowerShell. Any other language falls back to a search
for a definition-shaped line, with the limits stated in the skill.

## The code graph

`tools/codegraph.mjs` is the second tool: the graph of the code across every project under
one folder. `node codegraph.mjs scan <root> --out graph.json` parses every source file once
and records files and imports, top-level symbols and calls inside each project, duplicates
(identical text, or the same shape with other names: a renamed copy) inside and across
projects, and uncalled symbols graded certain / probable / uncertain from the list of what a
static graph cannot see. `report`, `dups [--cross]`, `hubs [project]`, `dead [project]`
read the JSON back. Projects declared as a porting of one another (`--porting "A|B"`) keep
their duplicates marked and out of the counts. Measured on twelve projects: 665 files,
208,000 lines, 12,500 symbols in 20 seconds. It never changes a source file.

## Labels: code is never deleted, it is marked

`tools/labels.mjs` keeps a small table of verdicts on symbols, `<vault>/.atlas/labels.json`:
CANONICAL (the reference version across projects), PREFERRED, SUPERSEDED (needs its
successor: a superseded symbol without one is refused), WRONG (with the reason, which is the
value), FRAGILE, EXPERIMENTAL. Every label needs its reason. `set`, `unset`, `list`,
`lookup`. The part that makes it work is the hook `hooks/atlas-labels.js`, on `PostToolUse`
for `Grep` and `Read`: when a result names a labelled symbol, the label is attached to the
result as context, one line per symbol, with the successor and the reason. Nothing is
hidden or changed; the old code just cannot be found bare. With no vault it is silent. The file is 4 KB; what a hook prints is kept under the 10 KB that Claude Code
hands the model whole.

A second hook, `hooks/atlas-precompact.js`, runs on `PreCompact`: before Claude Code
compacts a conversation, the lines of this session that read like a decision, a rule, a
preference or a correction are pulled out of the transcript, the same way `harvest extract`
reads past sessions, and written to `<vault>/.atlas/harvest/<session>.md`. Compaction keeps a
summary and drops the words; this keeps the words that matter. Nothing enters the vault: the
file is raw material, and `harvest run <vault>/.atlas/harvest <out> <vault>` turns it into
candidates for the inbox, each still needing a yes. A session that compacts twice replaces
its file. No vault, no transcript, or nothing decision-shaped beyond the first request: it
writes nothing. It never blocks the compaction (always exit 0, 10 s timeout). The same file
runs on `SessionStart` with the `compact` matcher, when the conversation resumes on its
summary: the lines kept for this session come back as additional context, under 6 KB, so a
rule stated before the compaction is still in front of the model after it. Compaction keeps
the gist; this keeps the rules.

A third hook, `hooks/atlas-signals.js`, runs on `Stop`, when an answer ends. It reads the
session transcript for one sign that a note is due: a check that failed and passed after an
edit, a correction followed by code work, a git undo with no commit after it, an option picked.
When it finds one it blocks the stop with a single question, which costs one more turn: write
one note through the usual gate, or say in one line that nothing is worth keeping. At most
three questions a session, each sign asked about once, the undo sign once a session; it writes
nothing itself. Silent with no vault, and while Claude Code is already answering a stop hook.
To switch it off: `"signals": false` in `~/.claude/atlas.json`.

### Where the vault is, and who may choose it

The three hooks and `tools/labels.mjs` find the vault with one rule, `hooks/atlas-vault.js`:

1. the nearest `.atlas.json` at or above the working directory with `"vault": "<path>"`, but
   only when `~/.claude/atlas.json` confirms that same path, as its `"vault"` or in its
   `"vaults"` list;
2. otherwise the `"vault"` of `~/.claude/atlas.json`;
3. otherwise the Claude Code memory folder of the working directory, when it exists.

The confirmation is there because a `.atlas.json` arrives with whatever repository was cloned:
taken as it was, a repository could decide where the pre-compaction hook writes the lines of
your sessions, inside itself ready to be committed, or in a shared folder. An unconfirmed one is
skipped as if absent; `node tools/labels.mjs vault` names it and says what to add.

```json
{ "vault": "C:/notes/vault", "vaults": ["C:/work/app/docs/memory"], "signals": false }
```

`~/.claude` is `$CLAUDE_CONFIG_DIR` when that is set: the hooks, the tools and the `atlas guard`
switch read and write the same file.

## Harvest: filling the memory from what already exists

`tools/harvest.mjs` is the third tool. `harvest extract <claude-projects> --out <dir>` reads
every past Claude Code session (one JSONL each; benchmark and scratch folders skipped, tiny
sessions skipped) and keeps, per session, the first request, the user's messages that read
like a decision, a rule or a correction, and the assistant's paragraphs that state one: a
few kilobytes per session instead of megabytes. `harvest docs <root> --out <dir>` collects
the projects' markdown documents. `harvest claude <conversations.json> <out-dir>` does the same for a claude.ai data export
(Settings → Privacy → Export data). `harvest run <extract-dir> <out-dir> <vault> [--write]` has a model turn each extract into
candidates (the prompt is `tools/harvest-prompt.md`; the vault's existing notes are listed in
it so they are not restated), and `harvest judge <vault>` has it say, for every pair of
notes that share enough words, whether they are the same thing, a contradiction, or neither
(`tools/pairs-prompt.md`). Both call Claude Code headless and lean: no MCP servers, no
skills, no plugins, our own system prompt, so a call carries about 7,000 tokens instead of
the 52,000 a bare `claude -p` loads from the session, and the prompt prefix is shared across
the run and cached. `--dry` says what would be sent and sends nothing; `judge --redo` asks
again about pairs already judged (after a change to the prompt). Measured: 9 pairs for $0.39,
three of them the same rule written twice; `harvest inbox write <vault> <candidates.json>` files them in
`<vault>/.atlas/inbox/`, skipping what the vault or the inbox already says in other words.
`inbox list`, `inbox accept <slug>` (the file becomes a note, one line goes into the index)
and `inbox reject <slug>` (removed, and its source hash remembered so it never comes back).
`harvest suggest <vault>` has a model read every candidate against the vault's index and
propose accept, merge (into which note) or reject, with the reason, into
`<vault>/.atlas/inbox-suggestions.json`; the inbox page and the app show the proposal beside
each candidate and can take all of them as decisions in one click. A proposal is not a
decision: nothing moves until the person says so. To review a large inbox away from any app, `tools/inbox-page.mjs <vault> <out.html>` writes
one HTML page with every candidate grouped by source, Accept / Reject buttons that work
offline, and a "Save decisions" button that downloads a JSON; `harvest inbox apply <vault>
<decisions.json>` then accepts and rejects for real. Nothing enters the vault without that yes. Measured on this machine: 39 real sessions and 67
documents extracted in under two seconds; the model pass at about 0.1 $ per source.

Three more things, all deterministic: `codegraph` records what a class extends or
implements (`inherits` edges) and answers `impact <graph> <project> <symbol> [--depth 2]`
with the blast radius, what calls or inherits from a symbol and then what calls those;
`memcheck check --write` records for every note which other notes touch the same code
(`related`: same symbol, a shared dependency, the same file), the link the code implies
without touching a wikilink; `harvest pairs <vault>` lists the notes that share enough words
to be read side by side, and `harvest verdicts write|list` keeps what a model or a person
decided about each pair (the same thing, a contradiction, neither). The prompt for that
judgement is `tools/pairs-prompt.md`.

## Two optional layers

`tools/embed.mjs`: search by meaning. `embed index <vault>` turns every note (name,
description, body, `<private>` spans removed) into a vector with a small multilingual model
that runs on this machine, re-embedding only what changed; `embed search <vault> "<query>"`
returns the nearest notes with a score; `embed status`. Each note has two vectors, the whole
note and its name with description alone, and the better of the two counts: a question is
short and about one thing, and against a long body the signal drowned (on 30 questions the
body alone put the right note first 11 times, the pair 21). `--words` adds the words: the
question's words (five letters or more, matched on their stem) are counted on each note, name
and description twice, and the two rankings are fused by reciprocal rank; on the same 30
questions the right note came first 26 times (21 by meaning alone, 23 by words alone), and
in the first three 27. The model
(`Xenova/paraphrase-multilingual-MiniLM-L12-v2`, about 130 MB) is downloaded once into
`~/.atlas/models` (or `ATLAS_MODELS`); nothing leaves the machine. Measured: 67 notes
indexed in 8 seconds; a query in well under a second. Needs `@huggingface/transformers`.

`tools/lsp.mjs`: live references. `lsp refs <project-root> <file> <line> <symbol>` starts
`typescript-language-server` or `pyright-langserver` through this same Node, opens the file
and asks who references the definition: types and imports resolved, the code as it is now.
Measured: a JavaScript symbol in 0.5 s; a Python symbol in a 200-file project in 20 s, with
104 references where the static graph counted 53 callers. `lsp check` says which servers
this machine has. Needs `typescript-language-server` (with `typescript`) and/or `pyright`.

Both packages are looked for next to the tools, then in `ATLAS_NODE_MODULES`, then in the
global npm folder; `npm install @huggingface/transformers typescript-language-server
typescript pyright` in any of those places is enough. Without them, everything else works
and the tools say what is missing.

## What it costs

| | `atlas` | `atlas-mem` |
|---|---|---|
| names and descriptions, counted, in every session | 824 | 1,691 |
| rules injected at `low`, counted | 1,408 | 1,410 |
| installed and switched off, as billed | 1,247 | 2,571 |
| first turn at `low`, as billed | 3,357 | 4,694 |
| first turn at `high`, as billed | 3,537 | 4,874 |
| a 40-turn session at `low`, against no plugin | -15% | -8% |
| a 295-turn session at `low` | -29% | -28% |
| a 40-turn session at `high` | -21% | -14% |
| a 295-turn session at `high` | -36% | -35% |

Billed on `claude-opus-5-5` at 0.1.0 (`atlas-test/fixed-costs.mjs`). The session rows assume this build saves per answer what `atlas` saved in the 2026-09-26 run; that was not measured on this build. The six files behind `atlas memory` are 6,820 tokens, read when the command is used. The stale-note check is local and takes under a second on a vault of a dozen linked notes; its output is a few lines. Loading all sixteen grammars takes about 90 ms.

## Advantages of this build

- A note that describes code is flagged as suspect when that code changes, instead of staying true by assumption.
- A code graph across projects, labels that follow a symbol into every grep and read, and a harvest of past sessions into an inbox only you accept from.
- `atlas-artifact` reads a shipped program, a binary or a database without running it.
- Review, fix and commit come with it, so you do not need `atlas-code` beside it.

## Disadvantages of this build

- 1,324 more tokens than `atlas` in every chat, and a 23 MB download, of which 22 MB are grammars.
- Three more hooks. `atlas-signals` can ask for a note up to three times a session, one turn each; `"signals": false` in your user `atlas.json` switches it off.
- Notes are written by hand. A memory you do not feed stays empty.
- Search by meaning and live references need npm packages and a 130 MB model. Everything else works without them.
- `harvest` calls a model when you run it, and that spends your usage.
- A vault named by a project counts only if your user `atlas.json` confirms it: add it to `vaults`.

## What was tried

The six tools have 100 tests (`node --test tests/*.test.mjs`; the live ones skip when their
package is missing).


Two benches on real material. Freshness: ten notes linked to ten
functions of a 57-file Python project (a copy); five bodies changed, one function renamed,
one deleted, one given a comment, one pushed down by lines added above it, one untouched. The
check said suspect for exactly the seven that deserved it and firm for the three that did not;
before the comment rule, the comment alone made an eighth note suspect. Recall: thirty
questions written in other words than the notes, each with the note that answers it. By words
against the index, the right note came first 24 times and in the first three 27; by meaning,
21 and 24; one of the two ways had it in the first three 27 times out of 30. The three misses
are notes whose index line does not name the thing asked about (a 503 from the data provider,
the size limit of the hooks, the command to run after a change). The command was run as a skill in two real
sessions on a copy of a vault: a check that found a stale note and put the question in one
line, and a write that produced a correct note with two code links taken from the parse. Both
cost between one and two dollars at the CLI's default model, most of it reading notes.

Not seen, by design or not yet: a change in a library the code uses; a method reached through
an object (`obj.method()`); a change two calls away; a symbol renamed and rewritten in the
same step (reads as `gone`). Whether the application that manages the vault ignores the
`.atlas` folder beside the notes was not verified against every such application.

## Limits

The vault is yours and stays in your format; the tool never edits a note. A note linked to
code that is not on this machine is reported as not checked, never as broken. Nothing leaves
the machine.

## Inside a shipped artifact: `atlas-artifact`

`tools/artifact.mjs` reads an installed program the way a person would open the box: the
`.asar` (or the folder under `resources/`) as bytes, every module outside `node_modules`
parsed into a syntax tree with the grammars in `tools/wasm/` (`tools/artifact-js.mjs`),
and reports what the entry reaches, the IPC channels in both directions with their pairing
(a channel sent and never handled, a channel pushed and never listened for), the
`contextBridge` keys, every `BrowserWindow` with its preload and the preferences that
matter, the hosts in URL literals, the processes it starts by name, the system APIs it
touches, `eval`, the secret-shaped environment variables it reads, the native addons. A channel
held in a constant, an object of channels, a template, a compiled enum or another file of
the archive is resolved and marked `derived`; a wrapper the app wrote around
`ipcMain.handle`, `ipcRenderer.invoke` or `webContents.send` is recognised from its body
and its callers counted (`derived` for a plain call, `inferred` through an object). A webpack build
is read by its module table (modules with their extent, edges from the module's own
require calls), an esbuild build by its named modules, and every fact inside a bundle
carries its module; when the archive ships the map, the original file, line and column
too. `fuses` reads the build-time switches of the Electron executable after their sentinel
(eight by name, later ones by index) and lists the ones a shipped application is not
expected to have. `compare` reads two versions and lists what changed by name. `observe`, only
with `--yes` from the person and on their own program, starts it with its debugging ports
open, reads the main process (the IPC channels really registered, the windows with the
preferences they got, the child processes, paths and versions) and every renderer (network
requests by host, console, exceptions, the bridge keys and what they expose), stops it by
process id after the seconds asked, and correlates with the static reading: channels and
hosts that only one side sees. It refuses when the program is already running, since the
running instance is not its to stop. `bin` reads a
compiled file by the tables its loader reads: a PE (machine, sections and their
permissions, imports by DLL, exports, version resource, manifest, ASLR/NX/CFG/signature,
and when a CLR header is there the .NET metadata: assembly, references, types, methods,
every P/Invoke, user strings, entry), an ELF (needed libraries, rpath, symbols, PIE, NX,
RELRO, canary, stripped), a Mach-O (thin or fat, dylibs, platform and SDK, rpaths,
signature, symbols), and in any of them the Go build information (version, modules,
settings) and the Rust compiler and crates the panic paths keep. For a .NET assembly, `cil` goes further and disassembles the method bodies: the CIL of
each method as a named instruction listing (the opcode table from ECMA-335), with call,
field and `newobj` tokens resolved to `Type::member` and `ldstr` strings shown; it reports
how many bodies decoded fully and any unknown opcode (42,949 methods across five real
assemblies, 100%, none unknown). `disasm` decodes the x86-64 instructions of a program's code sections (opcode maps,
prefixes, ModR/M and SIB from the Intel SDM, so instruction length is exact), from the
entry point by default, with a coverage number from a linear sweep (over 99% decoded on a
C++, a Go and an ELF binary; the classic prologue and stack-canary read back correctly).
The ARM64 (A64) decoder is fixed-width (every instruction 4 bytes, from the Arm ARM, no
length to get wrong): on a real arm64 binary, 100% allocated, the prologue and GOT-load
patterns read back correctly. `disasm` picks the decoder from the architecture. `dex` reads an Android `.apk` (a ZIP, its `classes*.dex` pulled out) or a bare `.dex`:
the pools from the DEX format spec, then each method's Dalvik bytecode decoded with every
index resolved to a name (`invoke-direct {v1, v2}, Type;.method`, `const-string "…"`). On
the Android API compiled to Dalvik (6,376 classes), 55,481 method bodies, 100%, no unknown
opcode. `cfg` recovers one function's control-flow graph from the disassembly (basic blocks, the
direct edges, loops from back-edges) on x86-64 and arm64 — the skeleton before expressions
and structuring. A PE's import address table is read, so a `call [rip+x]` to an import shows its
`dll!function` in `disasm`, `cfg` and the pseudo-C (`rax = KERNEL32.MultiByteToWideChar(...)`).
`cfg --pseudo` lifts the CFG to structured pseudo-C — x86-64 and ARM64 (A64), both with the full middle-end (liveness, dead-store elimination, stack-frame recovery, API-anchored types, points-to struct recovery). On x86-64: intra-block expression folding
(`eax = (-(ebp | 0xff))`), branch conditions recovered from `cmp`/`test` + the jump, memory
as `*(addr)`, registers as the variables; then structured over the dominator and post-
dominator trees into `if/else` and `while`/`for (;;)` with `break`/`continue`, a labelled
`goto` only where the flow is irreducible (`--goto` keeps the flat listing). Types are
recovered where anchored: a resolved import call is ground truth, so a compact table of
Win32 / C-runtime / ntdll prototypes types the argument registers (rcx/rdx/r8/r9) and the
return (rax), annotated in place (`rax = (ULONG)ADVAPI32.EventRegister(/* LPCGUID, … */)`),
with sign carried from signed vs unsigned jumps; an unanchored type stays `?`. The stack
frame is then recovered: each slot becomes a named local (`*(rsp+0x30)` → `local_30`), and
the compiler boilerplate (stack canary, frame set-up/tear-down) is annotated. A backward
liveness pass over the CFG drops the dead register writes at block ends (a value used only in
an address is substituted in), and a value is forwarded into the block that uses it along a
linear chain (never across a branch, so it can't be duplicated); `xor r, r` reads as `r = 0`.
Memory access reads as array and field access from the address shape (`[base+i*8]` → `base[i]`, `[base+0x10]` → `base->field_10`). The register state is width-canonical (writing `eax` kills and zero-extends `rax`, `inc rax` is seen by a later `eax` read), so a value that merges from two paths is handled correctly through the register variable. A dead-store elimination pass removes the spills every reader inlined (register names canonicalised, call right-hand sides kept). An intra-procedural points-to pass groups field accesses by object (origin tag: `arg0`..`arg3`, a call return, a global, or `arg0.f0` for a pointer loaded from a field), so accesses through different registers to the same object merge into one `struct arg0_t` and two different arguments stay separate; it falls back to per-register when no object can be tagged. Each field is a pointer if its value is dereferenced (or a `void (*)()` if called), else an integer whose width is the access size (`mov eax, [rcx+0x24]` → 32-bit); arrays are typed from the index scale. Full inter-procedural type inference and real member names remain the frontier.
`dex --pseudo` lifts each Dalvik method to pseudo-Java (register forward substitution, `new Type(args)` from new-instance + `<init>`, calls folded through `move-result`), with the gotos structured into `if/else`/`while` (`--goto` for the flat form): the android.jar stub reads back as `throw new RuntimeException("Stub!");`.
`wasm` reads a WebAssembly module per the W3C core spec: sections, signatures, imports/exports, and each function's code; `wasm --pseudo` lifts the stack machine back to structured pseudocode (block/loop/if become real control flow, loads/stores become `mem[addr]`, calls use the export/import name), e.g. a function reads back as `return (local0 + local1);`.
`evm` reads Ethereum Virtual Machine bytecode (raw or hex) per the EVM opcode list: disassembly with JUMPDEST labels, the 4-byte function selectors from the dispatcher, and the Solidity metadata (solc version, IPFS hash); `evm --pseudo` lifts the stack to pseudo-Solidity (`storage[k]`, `msg.sender`, `calldata[x]`, constant jumps resolved), structured into `if/else`/`while` (`--goto` for the flat form).
`pcap` reads a libpcap or pcapng capture: link type, then Ethernet/IPv4/IPv6/TCP/UDP/ICMP decode, with protocol counts and the conversations (who talked to whom, on which ports) ordered by packet count.
`sqlite` reads a database file read-only: schema, counts, indexes, triggers, a sample of
one table on request. `cil --pseudo` lifts a .NET method's CIL to readable pseudo-C# by simulating the stack (call arity read from the signature): e.g. `throw new ArgumentNullException(GetArgumentName(arg0));`; 7,176 core-library methods lift with no crash, and the labelled gotos are structured into `if/else`/`while` (`--goto` keeps the flat listing). `map` decodes a source map and turns a bundled position back into a file,
line and name.

Every answer is one record: an id derived from the record, the subject with its sha256,
the operation, a confidence (`observed` from the bytes, `derived` from observed facts,
`inferred` when the reading could be wrong), the coverage in words, the limitations. The
reading is textual and says so: a channel built from a variable or a URL assembled at run
time is an `unknown` in the report, not a missing fact. `--text` prints twenty readable
lines; the JSON is read by page. Nothing is executed, nothing is written, no network.
Binaries (`.exe`, ELF, Mach-O, APK, firmware) are recognised by `detect` and not read.

Measured on five installed applications (2026-10-18), text patterns against the parse:
the author's own app (180 MB, 7,790 files) 0.9 s, 60 handlers of which 49 through its
wrapper, 67 channels, every renderer call paired; a bundled app with Electron on a
namespace: 0 → 3 handlers; an app whose channels are a compiled enum: 0 → 8 handlers, 12 →
3 unknown; one app with channels built from `this` fields at run time: 23 unknown, stated
as such. The same five, read as bundles: one webpack build of four files with 601, 142,
100 and 13 modules and 2,249 edges in all; one esbuild-style build shipping its map, every
finding mapped to its original file and line; fuses read from all four executables, with
four to six switches in the weak state on each. Compiled files, same day: an Electron
executable (233 MB, 0.9 s: 7 DLLs, 3,241 exports, ASLR, CFG, unsigned), a .NET core
library (14.6 MB, 0.2 s: 2,755 types, 39,326 methods, 550 P/Invoke), a Go tool (12 MB,
0.2 s: go1.25.1, 22 modules, VCS revision), a Linux `.node` addon (needed libraries,
runpath, canary) and its macOS twin (dylibs, SDK, signed). Alive: the author's own app for fifteen
seconds, main process and one page reached, four channels at runtime against three in the
code (the fourth is the event emitter's own `error`), the bridge with its forty-two keys,
the window with the preferences the code promised, stopped by process id.

---

# atlas-code

Everything in `atlas`, plus coding and documents: twenty-three more skills, eight more
subagents and an optional guard hook. This page covers what the build adds. Everything below the line
is the README of `atlas` itself, and its measurements are about `atlas`, not about this
build.

## What it adds

| type this | and it |
|---|---|
| `atlas review` | what is wrong with a diff, a branch, a file or a pull request, with a checklist for the languages in it |
| `atlas fix` | a failing build, type check or linter back to green, one error at a time |
| `atlas commit` | the commit message for what is staged |
| `atlas test` | writes tests: test-first, coverage gaps, end to end, or against a deployed site |
| `atlas verify` | build, types, lint, tests and leftovers in one pass, compared with the previous run |
| `atlas plan` | plans before code and waits for a yes; asked to build, carries the work through tests and review to a commit, with a second yes before committing |
| `atlas multi` | asks other models for an opinion, a review or an approach, after showing what will be sent |
| `atlas docs` | keeps docs true to the code: sync, a map, onboarding, one feature traced end to end, locale files |
| `atlas perf` | speed work by measurement: baseline, one change, keep or revert |
| `atlas ship` | pull request, container, pipeline, deploy, Windows installer; nothing leaves the machine without a yes |
| `atlas track` | GitHub issues, Jira, Linear: read a ticket, update it, triage a backlog |
| `atlas refactor` | dead code, simplification, duplicates, an old codebase's own style; behaviour unchanged |
| `atlas publish` | prepares a private project to go public, on a copy, with a scan by a reader that did not do the cleaning |
| `atlas ui` | direction, polish, accessibility to WCAG 2.2 AA, motion, design tokens, a screenshot into components |
| `atlas build-ai` | code that calls a model: prompts, agent tools, evals, retrieval, cost, MCP servers, scheduled collectors |
| `atlas media` | animated explainers, video written in React, HTML slides, recorded demos, with tools that run locally |
| `atlas context` | what every session loads, when to compact, one answer at a chosen depth, a side question mid-task |
| `atlas secure` | audits a whole project you own: dangerous code, vulnerable dependencies, secrets in the files and the git history. Finds, never changes |

For the documents that are not code:

| type this | and it |
|---|---|
| `atlas spec` | turns an idea, a brief or a conversation into a specification in eight short sections, every "must" testable; hands a spec to the plan, checking that each requirement has a step and a proof; reviews a spec with a verdict (`BUILDABLE`, `QUESTIONS`, `NOT YET`) and one problem per line |
| `atlas changelog` | reads the history of a range (since the last tag by default) and writes the changelog entry in the project's own format, the release notes for the people who install the version, and the version number the changes call for |
| `atlas brief` | writes the text other agents read: a project's `CLAUDE.md` or `AGENTS.md`, a rules file scoped to a path, the description and body of a skill or a subagent, with the token cost measured |
| `atlas explain` | explains one thing to one reader: in plain words for someone who does not code, a decision with the options that lost and what would reopen it, a table of measurements with what it proves and what it does not |

One more skill is not typed: `atlas-stack`, eighteen short files on how code is written in
a given language or framework. `atlas plan` reads the one for your project before writing
code.

Each skill is a short router with a folder of files beside it. Only its description is
loaded in every session; a file is read when the request calls for it.

## What the document commands have in common

The document is written whole, in the language of the project's documents, for people who
were not in the room; the active compression level governs the conversation, not the
document. Every statement is traceable to its source (the conversation, the history, the
code, the measurement) or marked as reconstructed. Writing into a file, bumping a version,
creating a release: shown first, done after a yes; the release on the forge is `atlas-ship`'s
and needs its own.

## The guard hook

One hook file with three switches. All are off until you put one in `.atlas.json` at the
root of a project, or in `~/.claude/atlas.json` for every project:

```json
{ "guard": true, "gate": true, "finish": true }
```

- `guard` asks you before a command that destroys or publishes: a recursive forced delete,
  `git push --force`, `git reset --hard`, `git clean -f`, `DROP TABLE`, `kubectl delete`,
  `npm publish`, `--no-verify`. Add `"freeze": "src/api"` and it also asks before a write
  outside that folder.
- `gate` turns back the first edit of each file once per session, with what to look up
  first: who imports the file, which instruction the edit serves. The second attempt goes
  through.
- by voice: `atlas guard on`, `atlas guard off` (the same for `gate` and `finish`) write the
  switch to `~/.claude/atlas.json` (`$CLAUDE_CONFIG_DIR/atlas.json` when that is set). A
  project's `.atlas.json` can turn a switch on or add a `freeze`, never turn off a switch or
  move a `freeze` the user file sets: a cloned repository cannot disarm your guard.
- `finish` warns you when an answer ends by saying something was skipped, is still failing,
  or "should work". It reads English phrases only and never blocks.

The hook runs on every shell command and file edit, whether or not a switch is on: about
40 ms each time on the machine it was tested on.

## What it costs

| | `atlas` | `atlas-code` |
|---|---|---|
| names and descriptions, counted, in every session | 824 | 4,217 |
| rules injected at `low`, counted | 1,408 | 1,686 |
| installed and switched off, as billed | 1,247 | 6,391 |
| first turn at `low`, as billed | 3,357 | 8,898 |
| first turn at `high`, as billed | 3,537 | 9,113 |
| a 40-turn session at `low`, against no plugin | -15% | +13% |
| a 295-turn session at `low` | -29% | -25% |
| a 40-turn session at `high` | -21% | +7% |
| a 295-turn session at `high` | -36% | -32% |

Billed on `claude-opus-5-5` at 0.1.0 (`atlas-test/fixed-costs.mjs`). The session rows assume this build saves per answer what `atlas` saved in the 2026-09-26 run; that was not measured on this build. The files behind the commands are about 125,700 tokens, in 172 files, read one or a few at a time.

## Advantages of this build

- Twenty-three more skills for the whole cycle: plan, test, verify, review, fix, ship, audit, and the documents around them.
- Eight more subagents, so code searches, logs and the heavy modes stay outside your conversation.
- A guard hook, off until you switch it on, that asks before a destructive command.
- Each skill is a router: about 125,700 tokens of files behind them, read one or a few at a time.

## Disadvantages of this build

- 6,391 tokens in every chat, even switched off.
- Below about 57 turns it costs more than no plugin: +13% at 40 turns at `low`, +7% at `high`. It pays over long sessions, or when the commands are used.
- The guard hook runs on every shell command and file edit even with its switches off, about 40 ms each.
- Only `review`, `fix` and `secure` were run headless on real projects. The rest was tried in sessions, not measured. No bench measures the quality of the documents.

## Eight subagents

Three read code for any command: `atlas-finder` (where is X), `atlas-diff` (what is wrong with this diff) and `atlas-runner` (run the tests, return the verdict).

The heavy modes of five skills run in a subagent, so what they read never enters the
conversation: `atlas-auditor` (the whole-project audit of `atlas-secure`), `atlas-fixer` (the
fix loop when a build shows more than five errors or takes longer than about twenty seconds),
`atlas-profiler` (the measured attempts of `atlas-perf`), `atlas-documenter` (map, onboarding,
trace and sync of `atlas-docs`), `atlas-tester` (coverage, end to end, a whole module). Each
skill says when it delegates and keeps the small case in the conversation; each subagent reads
the same rule files as its skill, at the absolute paths the skill passes, and returns only the
report. `atlas-review` now delegates to `atlas-diff` above 120 lines of diff instead of 300.
Why: the audit of a 200-file project read fifty files over 285 seconds; in a conversation that
reading is paid again on every later turn. The price is 511 tokens of descriptions in every
session, used or not.

The first three rows are tiktoken counts (`o200k_base`), made the same way as for the other
builds. The 124 files behind these skills are about 96,000 tokens in all and are read a few
at a time.

**The session rows are a model, not a separate measurement.** The bench measured what the
rules add to the first turn and how much each level shortens an answer; those are the same
in this build, because the rules are the same. The rows above put this build's descriptions
into the same formula the README below uses for the others (500-token answers). This build
loads 2,218 more tokens of descriptions in every session: on a short session at `low` that
turns the small saving into a small cost. It pays for itself on long sessions, or when the coding commands are
actually used.

`atlas review` and `atlas fix` ship in every build except `atlas-min`, so they are
described in the README below.

## How far it has been tried

On 2026-10-04, Claude Code 2.1.283, on one small Python project made for the purpose:

| tried | result |
|---|---|
| `atlas review` (in every build) | read its method and the Python and error checklists; six findings in the line format, tiers and `outside` included |
| `atlas fix` (in every build) | read its method and the Python file, ran the suite through `atlas-runner`, fixed two errors, ended with `PASS` and the four counts |
| `atlas verify` | the six-row table and `CANNOT TELL`, because the passing tests did not cover the new code |
| `atlas docs: trace …` | the trace block, every line with a position |
| `atlas secure` | on a small Flask repo with seeded holes (an SQL injection, a hardcoded live key, a `.env` committed then removed, an unauthenticated endpoint, two outdated pins): found all of them at the expected tiers, left every missing scanner `not run` without installing it, quoted no secret, changed nothing, ended `HOLES FOUND` |
| the hook, all three switches | a hard reset stopped with its reason; the first edit turned back once; the closing warning shown |
| one real Codex call with the flags `atlas multi` uses | answered; the answer on standard output |
| WCAG 2.2 figures in `atlas ui` | twenty-four criteria checked against the published text |
| hook unit tests | 24 pass |

Two things the trials showed that you should know:

- **Type the name.** Asked in plain words ("fix the build", "plan this"), Claude did the
  work without loading the skill, three times out of three. Named, the skill loaded four
  times out of four.
- **No pointer commands.** A command and a skill with the same name are one entry to
  Claude Code, and the command wins: the skill's instructions are never loaded. Every
  build ships skills only, apart from the dial command; each is typed as
  `/atlas-code:<name>` or by its plain name.

**Not run at all:** `atlas test`, `atlas plan` by name, `atlas refactor`, `atlas ship`,
`atlas track` (no Jira or Linear account was available), `atlas publish`, `atlas ui`,
`atlas build-ai`, `atlas media` (Manim, Remotion and Blender were not installed),
`atlas multi` as a skill, `atlas context`, the Gemini command line, and every language file
except Python. Of `atlas secure`, the dependency pass with a real scanner and the secret
pass with `gitleaks` were not run. Treat those as written and reviewed, not as tested.

Headless trials on this machine's own projects, with the installed plugins off and the costs as
billed:
 `atlas review` on three C# files (read `review/csharp.md` and
`method.md`, four findings, one of them a real crash path, $1.29) and on two C++ bridges
(`review/cpp.md`, nine findings, $1.69); `atlas fix` on a C# project with three injected
errors (`fix/csharp.md`, `dotnet build`, four errors fixed since the syntax error hid two,
build green, $0.82); `atlas secure` on a 200-file Python daemon (58 routes read, four medium
findings with one root cause, five low, secrets pass over 272 commits, $3.72 in 285 s).
Java and Swift were not tried: the only files in those languages here are framework
boilerplate.

## Where the document commands come from

The lean eight-section spec and the handoff check are our reading of what product teams
publish as PRD templates; the changelog follows Keep a Changelog; the brief's cost rule is
the plugin's own measurement practice. Nothing was copied: every file here was written for
this plugin, and the sources that were studied are listed in the repository's notes.

## Where it comes from

The coding section was written after reading
[everything-claude-code](https://github.com/affaan-m/everything-claude-code) by Affaan
Mustafa (MIT licence), at commit `ef648e0`. Which topics matter, and several methods (the
proof a review finding needs, eval-first work on model features, the staged check before
publishing a private project), are that project's. The text is ours: each file was
written from scratch in the form the rest of ATLAS uses, and checked for runs of eight
words shared with the original; what the check still finds are compiler error messages,
two shell commands and a list of file extensions, which have one spelling. Of its 293 skills, 146 were merged into the seventeen
coding skills (fifteen here, two in every build); one more, `atlas-secure`, was written fresh for this build. 142 of ECC's skills were left out, and 5 are kept aside for later work.

---

# ATLAS

**Four dials for how a coding assistant talks to you, and two subagents that keep the noisy work out of your conversation. A Claude Code plugin.**

Most of what an assistant writes is packaging: greetings, restatements, hedges, a summary of what it just said, an offer of what to do next. ATLAS removes the packaging and keeps every fact, and it does so on turn fifty as reliably as on turn one, because the rules are re-stated to the model on every message instead of once at the start.

It ships off. Nothing changes until you type `atlas low` or `atlas high`.

## What it does

**Compression** — `atlas low` drops filler, pleasantries, hedging, articles and the copula. `atlas high` halves the words: every fact stays, every explanation goes. Code, error strings, paths, numbers, negations and proper names are never touched at either level. Anything written for other people — commits, docs, pull requests, memory files — is written in ordinary prose whatever the dial says.

**Rigour** — `atlas ask` makes it clarify the goal before building: one question at a time, multiple choice where the options can be named, on every request and not only the first. Bounded tasks — a typo, a rename — are just done.

**Check** — `atlas check` works against invented facts: nothing from memory, primary sources first, its own work verified before it is called done, a second option looked for before recommending the first, a correction verified before it is accepted. "I did not find it" is never written as "it does not exist".

**Silent** — `atlas silent` hands over the result and stops: no narration between tool calls, no closing summary, no offer of what to do next. Three things are still said, one line each: an irreversible action before it happens, a task that cannot run as written, a result that is wrong.

All four persist across turns, restarts and projects until changed, and move independently: `atlas ask off` leaves the other three where they were.

**Two subagents** do the expensive reading somewhere else and hand back only the answer: `atlas-research` (an answer with sources, or a reading list; with "is there a free API for this", the public catalogues; with "what do people say", open forums and what search engines show of social networks) and `atlas-browser` (does the page work, without a screenshot in your context). `atlas-code`, `atlas-mem` and `atlas-max` add `atlas-finder` (where is X), `atlas-diff` (what is wrong with this diff) and `atlas-runner` (run the tests, return the verdict).

**Six commands**: the dials, the reference card, `atlas-search` (an answer from a live search, or with "give me sources" a reading list; asked what people say, it reads open forums too and ends by saying what it could not look at), `atlas-recap` (a handover file so a new chat can continue where this one stopped), `atlas-organize` (tidy a local folder, with an undo) and `atlas-silent`. `atlas-review`, `atlas-fix` and `atlas-commit` come with `atlas-code`, `atlas-mem` and `atlas-max`.

## Commands

| command | what it does |
|---|---|
| `/atlas-max:atlas` | set the dials |
| `/atlas-max:atlas-help` | the reference card |
| `/atlas-max:atlas-recap` | write a handover file for the conversation |
| `/atlas-max:atlas-search` | answer only from a web search; with "give me sources", where to read instead |
| `/atlas-max:atlas-organize` | tidy a local folder, with an undo |
| `/atlas-max:atlas-silent` | do it and hand over the result, nothing else |

## Install

```bash
/plugin marketplace add Z0CC0/ATLAS
/plugin install atlas-max@atlas
```

No dependencies, no build step, no telemetry.

## It ships off

A fresh install changes nothing. The first session prints one line saying it is there and how to
switch it on; after that it does nothing until you do.

```
atlas low      shorter answers
atlas high     half the words
atlas status   what is on
atlas off      back to nothing
```

**The setting is per project and it persists** — across turns and restarts, until you change it.
It is not a per-conversation mode: switch it on once in a repository and every new chat opened
there starts that way. Another repository is another setting, off until you say otherwise, so
`atlas high` set for one piece of work never follows you into the next. `atlas off` persists the
same way. A project is the folder the session runs in, walked up to the nearest `.git` or
`.atlas.json`, so a chat opened in a subfolder shares the repository's dials.

**Uninstalling does not reset it.** The dial states live in `~/.claude/atlas-state/`, one small
file per project, outside the plugin, so removing and reinstalling brings back whatever was set
before. Type `atlas off` in a project before uninstalling, or delete that folder — nothing else
depends on it. Nothing is ever written inside your repositories.

## Five builds

Choose by what you do, not by size. Every build except `atlas-min` has all the dials. Install one: two ATLAS builds side by side inject the rules and the reminder twice. Tokens are what the API billed for one turn on `claude-opus-5-5` at 0.1.0, minus the same turn with no plugin (`atlas-test/fixed-costs.mjs`, results in `atlas-test/fixed-costs.0.1.0.json`). The no-plugin turn itself moved by about 140 tokens between runs, so a smaller difference is noise.

| build | what it is | commands | subagents | installed, switched off | first turn at `low` | first turn at `high` | 40 turns at `low` | 295 turns at `low` |
|---|---|---|---|---|---|---|---|---|
| `atlas` | the rules, the dials, search and the browser | 6 | 2 | 1,247 | 3,357 | 3,537 | -15% | -29% |
| `atlas-min` | compression only | 1 | 0 | about 0 | 1,538 | 1,723 | -26% | -33% |
| `atlas-code` | `atlas` plus coding and documents | 29 | 10 | 6,391 | 8,898 | 9,113 | +13% | -25% |
| `atlas-mem` | `atlas` plus review, fix, a memory and a program reader | 11 | 5 | 2,571 | 4,694 | 4,874 | -8% | -28% |
| `atlas-max` | all of it | 31 | 10 | 6,826 | 9,332 | 9,548 | +15% | -25% |

The last two columns are the session cost against no plugin, negative is cheaper, computed by `atlas-test/session-table.mjs`. Only `atlas` and `atlas-min` had their output measured; the other builds are assumed to save what `atlas` saves, which is not measured. `atlas-code` and `atlas-max` also carry 278 tokens of rules on how code is written.

### `atlas`

Commands: `atlas <dial>`, `atlas-help`, `atlas-search`, `atlas-recap`, `atlas-organize`, `atlas-silent`. Subagents: `atlas-research`, `atlas-browser`. The default if you do not write code every day.

Advantages:

- It holds the rules for anyone, coding or not, for the least that still has every dial.
- 3,357 tokens on the first turn at `low`: -15% at 40 turns against no plugin.

Disadvantages:

- No review, no build fixing, no commit message: those are in `atlas-code`, `atlas-mem` and `atlas-max`.
- No subagent that reads code for you, so a broad code search lands in your conversation.

### `atlas-min`

Commands: `atlas low`, `atlas high`, `atlas status`, `atlas off`.

Advantages:

- The cheapest: nothing measurable when off, 1,538 on the first turn at `low`.
- The compression was measured on this build too, and it saves as much as `atlas`.

Disadvantages:

- No `ask`, `check` or `silent`, no subagents, no search, no recap. One command.
- Nothing here protects you from a wrong answer: it only makes the answer shorter.

### `atlas-code`

Commands, on top of those of `atlas`: `atlas review`, `atlas fix`, `atlas commit`, `atlas test`, `atlas verify`, `atlas plan`, `atlas multi`, `atlas docs`, `atlas perf`, `atlas ship`, `atlas track`, `atlas refactor`, `atlas publish`, `atlas ui`, `atlas build-ai`, `atlas media`, `atlas context`, `atlas secure`, `atlas spec`, `atlas changelog`, `atlas brief`, `atlas explain`, plus `atlas-stack`, which `atlas plan` reads and you do not type. Subagents, on top of the two: `atlas-finder`, `atlas-diff`, `atlas-runner`, `atlas-tester`, `atlas-fixer`, `atlas-auditor`, `atlas-documenter`, `atlas-profiler`.

Advantages:

- Twenty-three more skills for the whole cycle: plan, test, verify, review, fix, ship, audit, and the documents around them.
- Eight more subagents, so code searches, logs and the heavy modes stay outside your conversation.
- A guard hook, off until you switch it on, that asks before a destructive command.
- Each skill is a router: about 125,700 tokens of files behind them, read one or a few at a time.

Disadvantages:

- 6,391 tokens in every chat, even switched off.
- Below about 57 turns it costs more than no plugin: +13% at 40 turns at `low`, +7% at `high`. It pays over long sessions, or when the commands are used.
- The guard hook runs on every shell command and file edit even with its switches off, about 40 ms each.
- Only `review`, `fix` and `secure` were run headless on real projects. The rest was tried in sessions, not measured. No bench measures the quality of the documents.

### `atlas-mem`

Commands, on top of those of `atlas`: `atlas review`, `atlas fix`, `atlas commit`, `atlas memory` (remember, find, is it still true, tidy, label) and `atlas artifact`. Subagents, on top of the two: `atlas-finder`, `atlas-diff`, `atlas-runner`. Local tools: the stale-note check, a code graph, a harvest, search by meaning, live references, labels, a reader of built programs.

Advantages:

- A note that describes code is flagged as suspect when that code changes, instead of staying true by assumption.
- A code graph across projects, labels that follow a symbol into every grep and read, and a harvest of past sessions into an inbox only you accept from.
- `atlas-artifact` reads a shipped program, a binary or a database without running it.
- Review, fix and commit come with it, so you do not need `atlas-code` beside it.

Disadvantages:

- 1,324 more tokens than `atlas` in every chat, and a 23 MB download, of which 22 MB are grammars.
- Three more hooks. `atlas-signals` can ask for a note up to three times a session, one turn each; `"signals": false` in your user `atlas.json` switches it off.
- Notes are written by hand. A memory you do not feed stays empty.
- Search by meaning and live references need npm packages and a 130 MB model. Everything else works without them.
- `harvest` calls a model when you run it, and that spends your usage.
- A vault named by a project counts only if your user `atlas.json` confirms it: add it to `vaults`.

### `atlas-max`

Every command and subagent above: thirty-one commands, ten subagents, the guard hook, the memory and its tools.

Advantages:

- Everything in one install, and the only way to have coding and the memory together: two builds side by side inject the rules twice.
- No extra files to manage beyond what the two builds already ship.

Disadvantages:

- The dearest: 6,826 tokens in every chat, even switched off. Below about 60 turns it costs more than no plugin: +15% at 40 turns at `low`.
- Every hook of both builds, and the 24 MB download.
- If you do not use both halves, `atlas-code` or `atlas-mem` costs less for the same result.

### `atlas-test` (in this repository, not a plugin)

The bench that produced the figures on this page: the questions, all 1,440 answers, every verdict and the scripts. See `atlas-test/README.md`. It lets you check every number here, and it is 22 MB you never need to install. A full rerun takes hours and about a subscription's worth of usage. It measures the form of answers, not whether code written with `atlas-code` is better.

## Measured

Every number below is measured, not estimated, and the unfavourable ones are printed with the rest. The compression tables were measured on 2026-09-26 with `claude-opus-5-5`, the CLI's default model, on an earlier revision of these rules. An earlier run on 2026-09-08 with `claude-sonnet-5` and an older revision of the rules is kept in `atlas-test/` (`cases/compression.*`) as history: Sonnet compressed more under every plugin, `atlas high` about 54% in English where Opus gives 46%, so figures from the two days are not comparable with each other. That older run also has a flaw found on 2026-09-26: Claude Code keeps only about 10 KB of a hook's output and hands the model a 2 KB preview of anything longer, silently. Those rules were over that size in every state but `low`, so the Sonnet rows for `high`, `ask` and `check` measured the first two kilobytes of the rules, not the rules. The rules are now injected in parts under the limit; the `check` rows below were generated after that fix and the billed input of every row is in the data, which is how the flaw was caught.

**Compression.** 24 English and 24 Italian questions, each carrying its own sheet of facts so that every setup answers with the same information and only the form can change. Each question was answered 2 times per setup in a fresh session through the real hooks; tokens are the API's own count of the visible answer, thinking excluded. "Details lost" is how many of the sheet's notes a reader can no longer learn from the answer, the median across rounds, minus what the no-plugin answer already lost. Every answer was read against its whole sheet by `claude-sonnet-5-5`, with no plugin and no configuration name in sight; each note marked absent was then read again with the question beside the answer, because `14:20.` does answer "what time is it in London?". That second reading turned 75 of the 80 absent notes into present. The no-plugin answers lose 1 note in English and 2 in Italian. Controls: a note from another question was called present 0 times in 1,440 calls, and a sentence copied from the answer was called absent 2 times in 1,391. Then a sensitivity test, 60 answers per language with the sentences carrying one note deleted: the judge still called that note present 11 times of 120, some because the information was stated elsewhere too, and called a note left in absent 0 times of 104. So a real loss can slip past it, and these zeros mean "very few", not "none". The older judge in the same folder uses a substring check, re-judged only where it found nothing. That check also "finds" 3.1% to 3.4% of the facts of other questions, so its zeros prove little, though this reading reaches about the same result.

English:

| setup | output vs no plugin, median | worst … best round | details lost |
|---|---|---|---|
| `low` | -37% | -37% … -37% | 0 of 176 |
| `high` | -46% | -45% … -47% | 0 of 176 |
| `low` + `ask` | -36% | -33% … -38% | 0 of 176 |
| `low` + `check` | -38% | -38% … -38% | 0 of 176 |
| `low` + `ask` + `check` | -39% | -38% … -40% | 0 of 176 |
| `high` + `ask` | -46% | -46% … -46% | 0.5 of 176 |
| `high` + `check` | -47% | -47% … -48% | 0 of 176 |
| `high` + `ask` + `check` | -46% | -45% … -46% | 0 of 176 |
| `atlas-min` at `low` | -40% | -39% … -41% | 0 of 176 |
| `atlas-min` at `high` | -47% | -47% … -48% | 0 of 176 |

Italian:

| setup | output vs no plugin, median | worst … best round | details lost |
|---|---|---|---|
| `low` | -37% | -35% … -38% | 0 of 176 |
| `high` | -43% | -43% … -44% | 0 of 176 |
| `low` + `ask` | -38% | -38% … -38% | 0 of 176 |
| `low` + `check` | -34% | -34% … -34% | 0 of 176 |
| `low` + `ask` + `check` | -35% | -35% … -36% | 0 of 176 |
| `high` + `ask` | -43% | -43% … -44% | 0 of 176 |
| `high` + `check` | -42% | -42% … -42% | 0 of 176 |
| `high` + `ask` + `check` | -41% | -41% … -42% | 0 of 176 |
| `atlas-min` at `low` | -39% | -38% … -39% | 0 of 176 |
| `atlas-min` at `high` | -44% | -44% … -44% | 0 of 176 |

Run-to-run noise with no plugin and the rules frozen: 0.4 points in English, 0.6 in Italian. A gap smaller than that between two setups is not an effect.

**Billed output is a different number.** The figures above count the visible answer; the API
bills thinking tokens as output too, and under the dials the model thinks more while it writes
less. Summed over the same 48 answers per setup (`atlas-test/generated/opus.*`, where
`output_tokens` includes thinking and `thinking_tokens` is the part not shown), billed output
against no plugin, English and Italian: `low` +2.0% and +4.7%, `high` -24.6% and -18.3%,
`low` + `check` +10.1% and +23.6%, `low` + `ask` + `check` +15.6% and +21.7%, `atlas-min` at
`low` -8.0% and -1.3%, at `high` -24.6% and -20.4%. So `low` saves reading, not the bill;
`high` saves both. The session tables below use the visible saving: read them as reading
cost.

**What a session costs against no plugin, in visible tokens** (thinking excluded; see "Billed output" above; savings from the 2026-09-26 run above), by build and setup: the fixed cost paid once, then per turn the reminder plus an answer shortened by that setup's own measured saving (mean of the two languages); a 500-token answer with no plugin; 40 turns and 295 turns, the average of the real transcripts this was tuned on. Negative is cheaper.

`atlas`

| setup | 40 turns | 295 turns |
|---|---|---|
| `low` | -15% | -29% |
| `high` | -21% | -36% |
| `low` + `ask` | -11% | -27% |
| `low` + `check` | -6% | -26% |
| `low` + `ask` + `check` | -3% | -24% |
| `high` + `ask` | -16% | -33% |
| `high` + `check` | -12% | -33% |
| `high` + `ask` + `check` | -6% | -29% |

`atlas-min`

| setup | 40 turns | 295 turns |
|---|---|---|
| `low` | -26% | -33% |
| `high` | -31% | -38% |

`atlas-code`

| setup | 40 turns | 295 turns |
|---|---|---|
| `low` | +13% | -25% |
| `high` | +7% | -32% |

`atlas-mem`

| setup | 40 turns | 295 turns |
|---|---|---|
| `low` | -8% | -28% |
| `high` | -14% | -35% |

`atlas-max`

| setup | 40 turns | 295 turns |
|---|---|---|
| `low` | +15% | -25% |
| `high` | +10% | -32% |

**Fixed cost per session**, `atlas` build, counted at 0.1.0 by `atlas-test/fixed-costs.mjs` with tiktoken `o200k_base`, an approximation of Claude's tokenizer:

| | tokens per session |
|---|---|
| rules injected at `low` (default) | 1,408 |
| rules injected at `high` | 1,530 |
| skill, command and subagent names and descriptions, always present | 824 |
| per-turn reminder | 27-32 |
| **total at the default** | **2,232** |

`atlas-min` carries 34 of descriptions and 1,051 of rules, `atlas-code` 4,217 and 1,686, `atlas-mem` 1,691 and 1,410, `atlas-max` 4,511 and 1,686. The script counts the name and the description of each item.

**What the API bills is higher.** The first turn of `atlas` at `low` is 3,357 tokens: 1,247 when installed and off, which is the descriptions as billed, and 2,110 for the rules and the reminder. That is 1.51 and 1.47 times the counted figures. The bill depends on the model, and a cheaper model can bill less for the same build. Why was not investigated.

**On a long session the per-turn reminder outweighs everything above it.** At 27 tokens a
turn, over a 295-turn session — the average measured on real transcripts — that is 7,965
tokens, about three times the rest put together. A longer wording of 42 tokens was
measured against it on the same day and compressed identically. The rules were cut
from 2,165 to 1,409 tokens the same way: examples and reasons out, every rule kept; measured
on the same day, two rounds, the compact rules compress 1.6 points less in English and 1.7 in
Italian, within two points of the run-to-run noise, for a thousand tokens less in every chat.

**The rules arrive in parts.** Claude Code keeps about 10 KB of one hook's output; above that it saves the text to a file and gives the model a 2 KB preview, with no warning to anyone. With `check` on the rules are 10-13 KB, so in one piece a session with that dial on would run on the first two kilobytes of them: no provenance marker, no second pass, no verification, while the reminder kept naming rules the model had never seen. The session-start hook is now registered three times and each call prints one slice, cut at section boundaries, the largest 7,298 bytes. Nothing in the rules changed. It was caught by the billed input in the bench data: the `check` rows cost less than `low` alone.

Token counts for the fixed costs are tiktoken (`o200k_base`), an approximation of Claude's tokenizer, except where a line says "billed"; the compression figures come from the API's own counts. Compare them with each other, not with a bill.

## Getting the most out of it

Everything below follows from the measurements above. None of it is required; each line says what it buys.

**Pick the level by the reader, not by the task.** `high` when you read the answer once and act on it. `low` when you re-read, paste it somewhere, or someone else reads it: the token gap between the two is a few points, the readability gap is not.

**Long sessions are where it pays.** The fixed cost is paid once per chat. Ten chats of five turns pay it ten times; one chat of fifty turns pays it once. Keep working in the same chat and use `atlas-recap` when it has to end, so the next one starts with the state instead of the story.

**Turn on `ask` for open-ended work, off for bounded work.** It earns its cost when the goal can move: a new feature, a refactor, a design. On a typo or a rename it is a question you did not need.

**Turn on `check` for facts, off for code you can run.** Versions, prices, APIs, how someone else's software behaves: on. A function you will test in the next minute: off, the test is the check.

**`silent` for batches.** A list of mechanical changes, a migration, anything where you will read the diff and not the prose.

**Delegate what is bigger than its answer.** A test log, a screenshot, a catalogue, a hundred-file search: send it to the subagent and pay for the verdict. Read directly what you will need to see anyway.

**Write the request with the constraint in it.** "In under 50 lines", "only the failing test", "one option, not a comparison": the model follows a stated bound better than any rule about brevity, and the bound costs you a few words.

**Every plugin you install costs its descriptions in every chat, on or off.** Count them once: this one bills 1,247 tokens on `atlas`, 6,391 on `atlas-code` and next to nothing on `atlas-min` (`claude-opus-5-5`, 0.1.0); caveman 2.7.0 was 1,281 by tiktoken on 2026-09-26, not re-measured; a large toolkit can be 30,000. Remove what you have not used in a month.

**`atlas-min` when tokens are the only thing you want.** Same compression rules, one command, no subagents, 34 tokens of descriptions: measured against caveman 2.7.0 on the same day, at `high` it compresses 19 points more per answer than caveman `ultra`, and over 295 turns its best setup is 26 points cheaper than caveman.

**Memory files in English.** They load at every start; the tokenizer reads English about a third cheaper than Italian and cheaper still than most other languages. Write `MEMORY.md` in English even if you talk to the model in your own.

**Put project names in `atlas-terms.txt`.** One per line: never compressed, never translated, never abbreviated.

**Pin a project's dials in `.atlas.json`** when the same repository always wants the same setup, and leave the per-project state for everything else.

**Connect Context7 if you ask about libraries.** One call for the right version's docs, where a search takes four; `check` and `atlas-research` use it first when it is there.

## Advantages

- **It holds.** The rules are injected at session start and re-stated in a short line on every turn, so the style does not drift back after twenty messages. That line names the rules that slip first, not only the state.
- **Next to nothing is lost.** Measured: at most one note of 176 in a round, on any setup. Compression removes packaging, not facts. Negations, qualifiers that change what is true, numbers, names, paths and error strings survive at every level; a shorter answer missing one of them has failed.
- **Every rule is binary.** A rule that needs a judgment call every time it applies loses to habit by turn fifty. What ships is only the kind a model can follow as a yes or no: one word when one word answers, first line answers the question, no list markers, at most two bold spans, no tables unless asked.
- **Four dials, no combined modes.** `high` + `ask` + `check` is three two-word commands, and each can be turned off alone.
- **The subagents pay for themselves immediately.** One screenshot is about 9,800 tokens, a catalogue is 550,000 tokens. None of it enters your conversation.
- **Everything is local.** No account, no gateway, no telemetry. The hooks touch only the files listed under "What leaves your machine", all on this computer. Two subagents reach the network because fetching is their job, and only when you delegate to them.
- **It ships off, and switching it off sticks.** No behaviour changes until you ask, and `atlas off` survives a restart.

## Disadvantages

- **It cannot search everywhere.** Asked what people say, `atlas-search` reads Hacker News, Lemmy, Stack Overflow and GitHub, which answer with no account. Reddit, X, Bluesky, LinkedIn, Instagram, TikTok, Facebook, Threads and Mastodon show a stranger little or nothing, so it sees only what search engines show of them, and it says so in every answer. No login, no cookie, and no way round a refusal.
- **It is a style constraint on a language model, not a filter.** The model follows it most of the time, not all of the time. On long sessions it occasionally slips — an article here, a list marker there — and the per-turn reminder exists because of that, not instead of it.
- **`low` and `high` are 9 and 7 points apart.** Measured: `low` 37% and `high` 46% less output in English, 37% and 43% in Italian. `high` is the harder rule set and reads more telegraphically: the saving is real, and so is the cost in readability.
- **Short sessions pay less.** The fixed cost is paid before the first answer, so on the `atlas` build a 40-turn session goes from -3% to -21% depending on the dials, a 295-turn one from -24% to -36%. A session of a handful of turns with short answers may not pay at all.
- **The per-turn reminder scales with turns.** Over 295 turns it costs more than the whole first turn. It is as short as it can be while still naming rules.
- **`check` adds tokens by design.** Verifying means looking things up. It is the one dial that costs more than it saves in tokens; it is paid for by the compression running underneath it.
- **`ask` cannot know what you have not said.** It reduces wrong assumptions; it does not remove them.
- **English commands, English hook phrases.** Requests in any language are recognised by the model, but the phrases the hook matches by itself ("stop atlas", "normal mode") are English. `atlas off` is a name and works everywhere.
- **The state is per project, keyed by the folder a session runs in** (walked up to the nearest `.git` or `.atlas.json`). Two checkouts of the same repository are two settings; a folder with no `.git` is its own project. Stored outside the plugin, so uninstalling does not reset it.
- **`atlas-browser` needs the desktop app's Browser pane.** From the plain CLI it has nothing to drive and says so.
**The same rules as an output style, without the hook (2026-10-15).** Twelve of the English
questions, two rounds, `claude-fable-5-1` (119 of the 120 answers; one call ran on `claude-opus-5-5`), an earlier revision of the rules: injected by the session-start hook
and re-stated by the tracker (`atlas low` / `atlas high`), or written once into the system
prompt as a Claude Code output style made from the hook's own output (`style-low` /
`style-high`, `atlas-test/style-rules.mjs`). Saving against no plugin: hook 31.3% at `low`
and 38.4% at `high`; style 34.2% and 40.4%. Details lost, by the older substring judge: 0 of 132 in every row. Billed input
of the one-turn call: the same, 2,100-2,300 tokens over no plugin either way. The bands of the
two rounds do not overlap, so the two to three points are not noise, but the gap is small and
one-turn calls cannot show the one thing the hook pays for every turn: the 27-32 token reminder
is absent in the style. Not measured: sessions of many turns, Italian, other models, and
whether replacing Claude Code's own output-style text changes its coding behaviour. Rows in
`atlas-test/generated/style.en/`.

- **The compression figure is 2 rounds on 48 questions with fixed fact sheets, one model (`claude-opus-5-5`, 2026-09-26).** It measures form with the information held constant; answers that have to find their own facts vary more, and another model compresses by another amount: Sonnet 5 gave larger savings under every plugin.
- **It shortens output only.** Your input, your files and what tools return are not touched: a hook cannot rewrite a tool's result.


## Recommended companions

ATLAS works on its own. It works better with these three connected — none is required, and no
rule ever says an answer is unavailable because one is missing.

| server | what ATLAS does with it | install |
|---|---|---|
| **Context7** | `atlas-research` and `check` ask it first for library APIs: one call for the right version, where a search takes four and may land on a page about another one | `claude mcp add --transport http --scope user context7 https://mcp.context7.com/mcp` |
| **Chrome DevTools MCP** | the two things `atlas-browser` cannot do — pages behind a login, and performance traces. It hands those back rather than reporting what an anonymous visitor sees | `claude mcp add --scope user chrome-devtools -- npx -y chrome-devtools-mcp@latest` |
| **Composio** | one gateway to Gmail, Notion, Slack, GitHub and the rest, so the subagents reach real data instead of only the web | `claude mcp add --transport http --scope user composio https://connect.composio.dev/mcp` then `claude mcp login composio` |

`--scope user` matters: without it the server exists only in the project you ran the command in.
Restart Claude Code afterwards — MCP servers are read at startup.

**Order, for the browser**: `atlas-browser` first, the external one only for what it hands back.
The subagent keeps screenshots out of your conversation; driving Chrome yourself does not.

**Composio holds OAuth tokens for the accounts you connect.** Connect only what you use.

## What leaves your machine

**Nothing you did not ask for.** The rules, the dials and the hooks are entirely local: they read
only the files in the table below and write only the state file, plus `~/.claude/atlas.json` when
you type a guard switch, and in this build, before a compaction, the harvest file of the vault, and in this build one small file per session in the system temp folder while `gate` is on. Nothing about your sessions is ever sent anywhere.

Two subagents do reach the network, because fetching is their job, and only when you delegate to
them: `atlas-research` searches and opens pages (and, in catalogue mode, the public catalogues),
`atlas-browser` drives a page you named. They send your query, nothing else. `atlas-min`
ships neither and makes no network calls at all.

| file | purpose |
|---|---|
| `~/.claude/atlas-state/<project>.state` | the four dials of one project, e.g. `high:ask:on:off` |
| `~/.claude/atlas-terms.txt` | your untouchable terms, one per line. Ships empty |
| `<project>/.atlas.json` | optional per-project default |
| `~/.claude/atlas.json` | optional default for every project, and the guard switches of `atlas-code` |
| `<vault>/.atlas/harvest/<session>.md` | written before a compaction: the lines of that session that read like a decision |
| `<vault>/.atlas/labels.json`, the session transcript | read by the labels hook and the signals hook |
| `<temp>/atlas-gate-<session>.json` | the files the gate already turned back in this session (`gate` on) |

`~/.claude` is `$CLAUDE_CONFIG_DIR` when that is set, for every file above.

On a question about what people say, `atlas-search` runs `tools/social.mjs`, which sends your search words to `hn.algolia.com`, `lemmy.world`, `api.stackexchange.com` and `api.github.com`, and nothing else.

## Untouchable terms

One term per line in `~/.claude/atlas-terms.txt`. Never compressed, never translated, never
abbreviated. Ships empty on purpose — a published plugin should not carry anyone's project names.

```
# lines starting with # are ignored
PelicanDB
retry_budget
```

## Turning it off

`atlas off`, or "stop atlas". The state file is written as off and stays that way across
restarts, for the project you typed it in. Removing the plugin does not touch it: delete the
`~/.claude/atlas-state/` folder by hand if you want no trace left.

## Tests

```bash
npm test
```

`tests/prompts.json` holds twenty-five behavioural prompts, written before the rules they test.
Those need a model to run; `npm test` covers what a machine can judge on its own.

The same by hand, from this folder (Node 22, nothing to install):

```bash
node --test "tests/*.test.mjs"
```

## Licence

MIT.
