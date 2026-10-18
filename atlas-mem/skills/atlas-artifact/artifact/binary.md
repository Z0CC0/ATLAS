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

`--pseudo` lifts the method to readable pseudo-C# instead of the instruction listing: CIL
is a stack machine, so the lift simulates the evaluation stack — each push is an
expression, each pop consumes one, a store or a void call or a return is a statement — and
a call pops the right number of arguments because the method's signature (how many
parameters, and whether it has a receiver) is read from the metadata. So
`ThrowArgumentNullException` comes back as `throw new ArgumentNullException(GetArgumentName(arg0));`.
Branch targets get a label and a `goto`; full if/while structuring is a decompiler's job
and is not done, so the output is straight-line pseudocode with labels. On the core
library, 7,176 methods lifted to 91,448 statements with no crash.

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

### The control-flow graph: `cfg`

`cfg <file> [--at <hexoffset>]` recovers one function's control-flow graph from the
disassembly: from the entry it follows the flow (fall-through and the resolved direct
branch targets) by recursive descent, splits the instructions into basic blocks at every
branch and branch target, draws the edges, and marks a back-edge as a loop. This is the
skeleton every decompiler builds before expressions and structuring; it is ours, over our
own x86-64 and ARM64 decoders. The output is the blocks with their instructions and their
successors (`-> if-taken L_… | fall L_…`, `(loop)` on a back-edge).

`cfg --pseudo` lifts the x86-64 CFG one step further, to low-level pseudo-C. Within a block
it folds expressions — a register holds the expression last assigned to it, substituted
into later uses, so a `mov`/`add`/`neg` chain collapses into one statement — and it recovers
the branch condition from the preceding `cmp`/`test` and the conditional-jump kind
(`test esi, esi` + `je` becomes `if (esi == 0)`). A memory write is `*(addr) = …`, a call is
`rax = sub_…(…)`, a return is `return rax;`. There is no type recovery and no cross-block
value tracking, so registers are the variables and blocks keep `goto` labels: this is the
honest middle ground, not clean C.

Call targets are named. A PE's import address table (the slots a `call [rip+x]` lands on)
is read, so an imported call shows its `dll!function` in the disassembly and `cfg`, and in
the pseudo-C a call reads `rax = KERNEL32.MultiByteToWideChar(...)` instead of an offset.

What `cfg` does not do: an indirect jump or call (through a register, a jump table, a
virtual call) has no resolved target, so a block only it reaches is missing. The next slices turn it into readable code:
data flow / SSA to rebuild expressions, then structuring (the gotos back into if/while/for),
then — for native — approximate types. A value is still not tracked and a call target is an
offset, not a symbol.

## Android: `dex`

`dex <file.apk | .dex>` reads an Android program. An `.apk` is a ZIP; its `classes*.dex`
are pulled out (stored or deflated) and read the same way as a bare `.dex`. The container
is a set of pools (strings, types, prototypes, fields, methods, classes), read from the
DEX format specification; then each method's Dalvik bytecode is decoded to a readable
listing, register by register, with every pool index resolved to a name: `const-class`,
`const-string "…"`, `invoke-direct {v1, v2}, Type;.method`, `throw`. `--class` or
`--method` narrows it, `--max` caps the bodies, the rest page.

Dalvik is register-based and its instructions are 16-bit code units, so (like ARM64) there
is no length to get wrong. Coverage is how many method bodies decoded fully, with any
unknown opcode listed. Measured on a real DEX (the Android API compiled to Dalvik, 6,376
classes, 63,630 methods): 55,481 method bodies, 100%, no unknown opcode.

`dex --pseudo` lifts each method to readable pseudo-Java. Dalvik is register-based with its
pool references already resolved, so the lift is a forward substitution over the registers:
a register holds the expression last written to it, substituted into later uses; a
`new-instance` plus its `<init>` fold into `new Type(args)`, an `invoke` whose result a
`move-result` takes folds the call into the destination, a field or array store and a return
and a throw are the statements. So the android.jar stub comes back as
`throw new RuntimeException("Stub!");`. Branch targets get a label and a `goto`; full
if/while structuring is not done.

What is not done: the exception table and debug line info of a method, and if/while
structuring of the pseudo-Java. A register's value is not tracked across blocks.

## Not yet

The control-flow graph and readable pseudocode on top of the decoders: basic blocks from
the branches, then expression reconstruction — easiest for CIL and Dalvik (stack- and
register-based, already typed), harder for native. Firmware, pcap and WASM are read by
header only for now.
