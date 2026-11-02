# Data an application leaves behind — a SQLite file, a source map

## SQLite

`sqlite <file.db>` opens the file read-only and reports the schema (tables with their
columns, keys and row counts; indexes; views; triggers), the page size and count, the
journal mode and the user version. `--table <name> --limit N` adds the first N rows of one
table, strings cut at two hundred characters, blobs as sizes. The rows come in storage
order: a sample, not a random one, and the report says so.

What the schema says that the code does not: which facts the program keeps between runs,
what it indexes (what it searches by), what a trigger does behind an insert. A column
whose name says token, secret, password or key is named in the report with its table, never
with a value. A file with a `-wal` beside it has changes the main file does not yet hold;
the reader opens the pair and the report notes it.

Not done: no query the person did not ask for, no join, no export. A question that needs
one ("how many users signed up in March") is answered with the query written out and run
only after a yes, through the same read-only handle.

## Source maps

`map <file.map>` decodes the mappings and reports the sources, how many segments point into
each, which sources carry their content, the names. `--line L --col C` turns a position in
the bundle (a stack trace, a line from a minified file) into the original file, line and
name when the map has one.

A map is the bundler's claim, and the reader says so: nothing here checks the map against
the bundle it describes. A map without `sourcesContent` gives paths only; the original text
is then read from the repository, when it is here, at the path the map names.

## When the artifact is neither

A `.exe`, a `.dll`, an ELF, a Mach-O: `binary.md`. An `.apk`, a firmware image, a `.wasm`:
`detect` names the format and the reader stops there. The report says what was recognised
and that the inside was not read. No tool is installed to go further without a yes.
