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

## Not yet

Native code (x86-64, ARM64) and Android bytecode (Dalvik): the instruction decoders for
those are being written from their specifications (Intel SDM, the Arm ARM, the Dalvik
format), architecture by architecture, each with its coverage measured, and readable
pseudocode on top. Until a decoder lands, the report for that kind ends where the headers
end, and says it.
