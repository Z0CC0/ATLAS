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
value tracking, so registers are the variables.

The blocks are then structured. Over the dominator and post-dominator trees (Cooper-Harvey-
Kennedy iterative data flow) a two-way block becomes `if (…) { … } else { … }` merging at its
immediate post-dominator, and a natural loop (a back-edge whose target dominates its source)
becomes `while (…)` or `for (;;)` with `break`/`continue`. A labelled `goto` survives only
where the flow is irreducible or leaves its region — the honest fallback, never a wrong
nesting. `cfg --pseudo --goto` keeps the old flat listing with labels for comparison.

Call targets are named across the three formats. A PE import through the address table (the
slots a `call [rip+x]` lands on) shows its `dll!function`, and in the pseudo-C reads
`rax = KERNEL32.MultiByteToWideChar(...)`. A PE direct call to one of the file's own exports
shows `module!export`. An ELF direct call to a procedure-linkage-table stub shows `name@plt`,
read from `.rela.plt` and `.dynsym` (with `.plt.sec` handled for CET builds). What is not an
import, export or PLT stub stays an offset.

Types are recovered where they can be anchored. A resolved import call is ground truth: a
compact table of common Win32 / C-runtime / ntdll prototypes (from the public API headers,
a specification) gives each `call dll!func` its parameter types in rcx/rdx/r8/r9 and its
return type in rax under the Microsoft x64 convention. The call is annotated in place
(`rax = (ULONG)ADVAPI32.EventRegister(/* LPCGUID, PENABLECALLBACK, PVOID, PREGHANDLE */)`),
the prototypes are listed above the function, and a forward pass carries a type along `mov`
copies (across blocks, since a non-volatile register survives a call) and marks sign from a
signed vs unsigned jump. A typed value stored into a stack slot types that slot, so the
locals get a declaration line (`HANDLE local_30`) when a typed value reaches them. A type
that is not anchored stays `?` — honest, not guessed. User structs and a fully-typed C are
still the frontier, and the prototype table is compact, so the typing is as wide as the
table.

The stack frame is recovered too (the first middle-end pass). A compiler keeps a function's
locals at a fixed offset from the stack or frame pointer; each distinct slot is renamed to a
variable (`*(rsp+0x30)` → `local_30`, `*(rbp+0x10)` → `arg_10`), the slots are listed as the
function's locals, and the compiler boilerplate is annotated rather than left as noise — the
stack-protector cookie (`// stack canary: set` / `: check`) and the frame set-up / tear-down.
The pass renames and comments, it never deletes a statement.

Values flow across blocks (the second and third middle-end passes). A backward liveness
data-flow (live-in = use ∪ (live-out − def), to a fixpoint over the CFG) finds which registers
each block actually leaves live; the lift then keeps only the live writes at a block's end and
drops the dead ones, so the spill noise is gone. A value used only inside a memory address is
substituted into that address, so no bare register is left without a visible definition. Then
a value a block computes is forwarded into the block that uses it, along a strictly linear
chain (one successor, one predecessor) so the value has exactly one path and can never be
duplicated across a branch; a register the block only passes through untouched is not carried.
The zeroing idiom `xor r, r` / `sub r, r` reads as `r = 0`. The passes are conservative: an
unmodelled instruction marks its registers used and nothing defined, so a write is dropped
only when the register is provably dead.

Memory access reads as array and field access, from the shape of the address: `[base+index*
scale]` becomes `base[index]`, `[base+disp]` becomes `base->field_<disp>`, `[base]` becomes
`*base`. This names the offsets off a pointer as fields and the scaled index as an array
subscript — the observed layout, not an invented named type; the frame base and rip-relative
globals are left flat for the other passes.

The register state is width-canonical: it is keyed on the 64-bit register, so writing `eax`
kills the old value of `rax` and zero-extends into the top half, writing `al` is a partial
write that leaves a wider read opaque, and `inc rax` is seen by a later read of `eax`. A value
that merges from two paths (a phi) is handled correctly through the register variable: each
path materialises its value into the register and the merge reads it, with the right kill
semantics — no stale value crosses the join.

A dead-store elimination pass then removes a spill `X = expr;` whose value every reader
inlined (so X is read nowhere else) when the right-hand side has no call, with register names
canonicalised so a value spilled as `rax` and read as `eax` is kept. This drops the leftover
spill noise and the dead parts of the compiler's boilerplate.

An intra-procedural points-to pass groups the field accesses by the *object*, not the
register. Each pointer value carries an origin tag — an incoming argument (`arg0`..`arg3`), a
call's return, a global, or a pointer loaded from another object's field (`arg0.f0`) — and the
tag propagates through copies and interior-pointer arithmetic, so `[rcx+8]` and, after
`mov rax, rcx`, `[rax+0x10]` fall on the same object and merge into one `struct arg0_t`; two
different arguments stay two structs. A merge of disagreeing origins clears the tag (no false
merge). When no object can be tagged, the pass falls back to grouping by register.

For each pointer with two or more distinct fields, a `struct` declaration is synthesised above
the function. Each
field's type is inferred: a pointer when the field's value is itself dereferenced or indexed,
otherwise an integer whose width is the access size recovered from the instruction (`mov eax,
[rcx+0x24]` makes `field_24` 32-bit, `mov rdx, [rcx+0x28]` makes `field_28` 64-bit; the widest
access wins). It is labelled approximate: the offsets are observed (a gap shows as the offset
comment) and the base register may hold different objects at different points. Arrays are
noted too: an indexed access `[base+index*scale]` is reported as `base[]` with the element
type from the scale and access width (`[r8+rcx*8]` → `int64_t r8[]`). A field called
indirectly (`call [base+disp]`) is typed as a function pointer (`void (*field_N)()`), an
observed fact, not a guess — useful for vtables and callbacks. This is the honest step toward
the real frontier (points-to plus full type inference), not that frontier.

What `cfg` does not do: an indirect jump or call (through a register, a jump table, a
virtual call) has no resolved target, so a block only it reaches is missing. The field names
are offsets and the layout is what was observed off a register (which may hold different
objects at different points), not a reconstructed struct with real member types and names —
that stays the frontier.

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

## WebAssembly: `wasm`

`wasm <file.wasm>` reads a module from its bytes per the WebAssembly core specification: the
sections (type, import, function, table, memory, global, export, start, element, code,
data), the function signatures, the imports and exports, and each function's code. `--func
name` filters, `--max N` caps how many bodies are shown, `--text` prints them.

`wasm --pseudo` lifts each function to structured pseudocode. Wasm is a stack machine with
already-structured control flow (block / loop / if / else / end with labelled `br`), so the
lift reads cleaner than a native one: the stack is turned back into expressions
(`local.get`/`const`/arith fold into one line), a load/store becomes `mem[addr]`, a `call`
uses the imported or exported name, and the blocks become real `if`/`loop` with indentation
— no CFG recovery needed. A function with no export or import name shows as `funcN` (the
custom "name" section is not applied); SIMD (v128) and the `0xFC`/`0xFD`/`0xFE`-prefixed
instructions are listed but not folded into operators.

## EVM: `evm`

`evm <file>` reads Ethereum Virtual Machine bytecode (raw bytes, or a hex string with or
without `0x`) per the EVM opcode list: the instruction stream with program-counter offsets
and JUMPDEST labels, the 4-byte function selectors pulled from the dispatcher
(`PUSH4 <sel> … EQ … JUMPI`), and the Solidity metadata solc appends (compiler version,
IPFS/Swarm hash). `evm --pseudo` lifts the stack back to pseudo-Solidity: `storage[k]`,
`mem[a]`, `msg.sender`, `calldata[x]`, binary operators, and a `goto`/`if … goto` wherever a
constant `PUSH` gives the jump target. A computed jump target comes off the stack at run
time and is left as the expression. The names behind the selector hashes need a signature
database, which is not shipped; the hashes are reported as-is.

## Network captures: `pcap`

`pcap <file>` reads a libpcap or pcapng capture: the link type and byte order from the
header, then every packet record. It decodes the common stack — Ethernet (with VLAN tags),
IPv4 / IPv6, TCP / UDP / ICMP — and summarises the protocol counts and the conversations
(source and destination address and port, ordered by packet count). `--max N` caps how many
individual packets the JSON lists. The payload bytes are not reassembled and higher
protocols (TLS, HTTP bodies) are not parsed; a conversation is counted by packet, not by
reconstructed stream. Useful for reversing a wire protocol from a capture without a live tap.

## Not yet

Expression reconstruction's last native frontier is user-struct and full type recovery (API
prototypes already type the call sites). Firmware is read by header only; payload reassembly
and higher-layer protocol decode on top of `pcap` are a later slice.
