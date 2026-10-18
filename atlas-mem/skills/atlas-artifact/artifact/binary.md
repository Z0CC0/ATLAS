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

## Not yet

Code. A function's instructions, what it calls, what a string is used for: that reader
is being written, architecture by architecture, with its coverage measured. Until then
the report ends where the headers end, and says it.
