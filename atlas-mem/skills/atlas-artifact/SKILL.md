---
name: atlas-artifact
description: >
  Reads what is inside a shipped artifact without running it: an installed Electron or Node
  application (its modules, what reaches the entry, the IPC channels in both directions, the
  preload bridge, the windows and their preferences, the hosts it talks to, the processes it
  starts, the bundles by their module tables, the fuses of its executable, what changed
  between two versions), a compiled file by its headers (PE with the .NET metadata, ELF,
  Mach-O: imports, exports, hardening, signature, Go modules, Rust crates), the program
  alive for a few seconds after a yes (real IPC channels, windows, network, console,
  against the static reading), a SQLite file (schema, counts, a sample), a source map
  (where a bundled line came from). Every fact with its file and line, a confidence, and what was not covered. Only for
  software the person owns or is allowed to inspect. Use for "atlas artifact", "what is in
  this app", "open this asar", "what does this installed program do", "read this database",
  "map this bundled line back" — in any language.
---

The code that runs is the archive, not the repository. This reads the archive.

## First, whose software

Before anything is opened: the artifact belongs to the person, or they say they are allowed
to look inside it. Not sure: ask, one line, and stop until the answer. A program that is
not theirs is read only with their word that they may, written in the report.

This reads and explains — headers, bytecode, instructions, control flow — so a person
understands their own compiled software and so `atlas-secure` can audit it. It is not for
defeating anything: no licence, serial, trial or activation is removed or forged; no
digital-rights, anti-cheat or anti-tamper layer is bypassed; no authentication or paywall
is circumvented; no patched or cracked copy is produced. A request that is really one of
those is declined in one line, whatever the words around it. The reading is of the bytes as
they are; the archive is left unchanged, and only `observe` ever runs the program, under
the gate in Boundaries.

## What to read

Everything below lives in the `artifact/` folder beside this file.

1. `artifact/method.md`, always: the tool, the record every answer carries, summary before
   detail, the register of what stayed unknown, the report.
2. By the target:
   an `.asar`, an installed Electron program, a folder with a `package.json` → `app.md`
   a `.db`, `.sqlite`, a file that starts with `SQLite format 3` → `data.md`
   a `.map`, "where does this line come from", a stack trace from a bundle → `data.md`
   "fuses", "is it hardened", "can it be run as node", the `.exe` of an Electron program →
   `app.md` (the fuses section)
   "what changed", "compare the versions", "the old one and the new one", two archives →
   `app.md` (two versions)
   "run it and watch", "what does it really do when it starts", "which channels are really
   there", "what does it contact" → `app.md` (alive for a few seconds), only after a yes
   a `.exe`, `.dll`, `.node`, an ELF, a Mach-O, "what does this binary import", "is it
   .NET", "which Go modules", "is it signed", "is it hardened" → `binary.md`
   ".NET", "CIL", "IL", "disassemble this assembly", "what does this method do", a `.dll`
   whose code you want read → `binary.md` (the `cil` section)
   "disassemble", "x86", "x86-64", "arm64", "aarch64", "the instructions", "what does this
   function do", "the assembly of this exe" → `binary.md` (the `disasm` section)
   an `.apk`, a `.dex`, "Android", "Dalvik", "smali", "what does this app's code do" →
   `binary.md` (the `dex` section)
   a `.class`, Java bytecode, JVM, "decompile this class" → `binary.md` (the `jvm` section)
   a `.pyc`, Python bytecode, "disassemble this pyc" → `binary.md` (the `pyc` section)
   a `.wasm`, WebAssembly, "wat", a wasm module in a site or a plugin → `binary.md`
   (the `wasm` section)
   EVM bytecode, a smart contract, Ethereum, Solidity bytecode, a `.evm`, "what functions
   does this contract expose" → `binary.md` (the `evm` section)
   a `.pcap`, a `.pcapng`, a network capture, "what's talking to what", a protocol capture →
   `binary.md` (the `pcap` section)
   firmware → not read yet: say so in one line, and what `detect` reported.

## Boundaries

Read, never changed: no file inside or beside the artifact is written, no network is used,
and no process of it is started, with one exception: `observe`, which starts the person's
own program for a few seconds under its debugging ports and stops it, and runs only after
the person has said yes to that run, in so many words, in this conversation. A question
that needs more than that ("what does it do when I click") is answered from the code with
that said, or is `atlas-browser`'s when the program is a web app. Secrets found in an artifact are reported by name and place, never
by value.

## With the other skills

The source repository, when it is here too, is `atlas-memory`'s code graph; this reads what
shipped and the two are compared when they differ. A security question about what was
found goes to `atlas-secure` with the lines of this report as its starting list. A long
read runs through `atlas-runner` when it exists.

## Form

The active compression level governs the prose. It never overrides the record format in
`method.md`. Paths, channel names and hosts are quoted exactly.
