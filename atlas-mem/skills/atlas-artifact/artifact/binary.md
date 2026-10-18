# A compiled file — PE, .NET, ELF, Mach-O, and what Go and Rust leave in them

`bin <file>` reads the tables the operating system's loader reads, the same way, and
nothing more: no instruction is decoded, nothing is run. What comes back is what the file
declares about itself, each item at a file offset.

## Windows: PE

Machine and bitness, whether it is a program or a library, the subsystem (console or
window), the link timestamp (or the note that the field holds a build hash, as every .NET
assembly does), the sections with their permissions (a section both writable and
executable is its own line), the imports by DLL with the function names, the exports by
name, the version resource (product, version, company), the manifest (the execution level
it asks for, DPI awareness) and the hardening flags the linker set: ASLR and high-entropy
ASLR, NX, Control Flow Guard, an Authenticode signature present or not. A shipped program
without ASLR or NX, or with a writable code section, is a `high` for `atlas-secure`.

## .NET inside a PE

When the file carries a CLR header, the metadata is read from its tables: runtime
version, assembly name and version, the assemblies it references, the modules it imports
natively, the types (namespace, name, how many methods, public or not), the method count,
every P/Invoke (which managed method calls which native function in which DLL), the user
strings, and the entry method. The types and strings are paged (sixty in the summary,
all with `--detail full`). The bodies of the methods are not decoded here; that is a
later reader.

## Linux: ELF

Class, type (a shared object is also what a PIE executable looks like), machine, the
interpreter, the libraries it needs with `rpath`/`runpath`, the symbols it imports and
exports, the segments and sections, and the hardening the headers show: PIE, a
non-executable stack, RELRO, a stack canary (the `__stack_chk_fail` import), fortified
calls, whether it is stripped, segments both writable and executable.

## macOS: Mach-O

Thin or fat (every slice listed by CPU); CPU, file type, the platform with minimum OS and
SDK, the dylibs it loads (weak and re-exported marked) with their versions, `rpath`
entries, UUID, a code signature present or not, PIE, imported and exported symbols.

## Go and Rust, in any of the three

A Go binary carries its build information: the Go version, the main module, every
dependency with version and checksum, the build settings (OS, architecture, cgo, the VCS
revision). All of it `observed`. A Rust binary keeps the compiler's commit in its panic
paths and the registry paths of the crates that panic can mention: the crate list is
`derived` from those paths and is a lower bound (a crate that never panics leaves no
path); a binary built with the audit section carries the full list, and it is read.

## Strings

URLs, registry keys, Windows and POSIX paths found as text, with counts. A string is a
string: that the program contains a URL does not mean it ever requests it, and the report
says so.

## .NET method bodies: `cil`

For a .NET assembly, `cil <file.dll>` goes past the headers into the code: it decodes the
CIL (the bytecode the runtime runs) of each method to a readable listing, the way `ildasm`
shows it. The opcode table is from the specification (ECMA-335, Partition III), so every
instruction is named; a method call, a field access, a `newobj` has its token resolved to
`Type::member` through the metadata; a `ldstr` shows the string. `--type <name>` or
`--method <name>` narrows it; `--max` caps how many bodies come back; the rest page.

Every run reports its coverage: how many method bodies were decoded and how many fully,
with any opcode the reader did not know listed (on the whole .NET core library and four
more assemblies, 42,949 methods, 100%, no unknown opcode). A native method, a runtime
method or an abstract one has no byte stream and is said to have none. The exception-handler
regions after a fat method body are not listed yet.

## Native code: `disasm` (x86-64 and ARM64)

`disasm <file>` decodes the native instructions of a program's code sections; it picks the
decoder from the file's architecture. The x86-64 side reads the instructions. The opcode
maps, the prefixes, the ModR/M and SIB bytes are from the specification (Intel SDM Vol. 2,
AMD64 Vol. 3), so the length of every instruction is computed exactly: get a length wrong
by one byte and the whole stream after it turns to noise, so length is the thing the reader
is built around. The listing starts at the entry point, where the bytes are sure to be
real code (`--at <hexoffset>` for elsewhere, `--count` for how many); each line is an
address, the mnemonic and its operands, the way `objdump` or a disassembler shows them.

The coverage number is a linear sweep of the code sections: the share of instructions that
decoded to a known opcode. A code section also holds data (jump tables, padding, constants)
and x86 decodes almost any bytes as some instruction, so this number bounds the
unknown-opcode rate rather than proving every boundary; the entry-point listing is where
real code is read and checked. Measured on three real binaries (a C++ `node.exe`, a Go
`git-lfs.exe`, an ELF addon): over 99% decoded, the classic prologue (`push rbp`,
`mov rbp, rsp`, `sub rsp, …`) and the stack-canary pattern read back correctly.

### ARM64 (A64)

The ARM64 side is simpler and surer: every A64 instruction is a fixed 32 bits, 4-byte
aligned, so there is no length to get wrong and no desync is possible. The decoder (from
the Arm Architecture Reference Manual, DDI 0487) picks the top-level group from four bits
and sub-decodes by bit field: the integer, memory and branch instructions are rendered with
their operands (`stp x29, x30, [sp, -0x10]!`, `adrp x3, …` then `ldr x3, [x3, …]`, `bl`,
`ret`), and the scalar-FP / SIMD group is recognised as a class but named coarsely (`~`).
The coverage is the share of words that are an allocated encoding; on a real ARM64 binary,
100% allocated, nothing unaligned, the prologue and GOT-load patterns read back correctly.

What is not done here (either architecture): a value is not tracked, a call target is an
offset not a symbol, the control-flow graph and pseudocode are the next slices.

## Not yet

Android bytecode (Dalvik): the DEX container and the Dalvik instruction set, from the
format specification, with coverage measured and readable pseudocode on top. Until it
lands, an `.apk` is recognised by `detect` and not read inside, and the report says so.
