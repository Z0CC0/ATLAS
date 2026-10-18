# An application — an asar, an installed program, a source folder

## What the reader sees

`app` opens the archive (or the folder, or the `resources/app.asar` under an installed
program) and reads every JavaScript and HTML file outside `node_modules`:

- **Entry and reach.** The `main` of `package.json`, and which modules a chain of
  `require`/`import` reaches from it. A module not reached is dead in that archive or loaded
  another way (an HTML page, a worker, a dynamic path): the report says which.
- **IPC, both directions.** Channels handled in the main process (`ipcMain.handle`/`on`),
  sent from a renderer (`ipcRenderer.invoke`/`send`), pushed from main
  (`webContents.send`) and listened for (`ipcRenderer.on`). Then the pairing: a channel
  sent and never handled is a call into nothing; a channel handled and never sent is a door
  nobody uses, or one opened from code the reader did not see. A wrapper the app wrote
  around `ipcMain.handle` is recognised when its body calls it with a variable; its callers
  count as handlers, marked `derived`.
- **The bridge and the windows.** Every `contextBridge.exposeInMainWorld` key, every
  `BrowserWindow` with its preload and the preferences that matter (`contextIsolation`,
  `nodeIntegration`, `sandbox`, `webSecurity`); a weak preference is its own line.
- **Outside the program.** Hosts in URL literals, with how often and where first; processes
  started by name (`spawn`, `exec`, `fork`); `shell.openExternal` and its siblings; the
  APIs that reach into the system (login items, global shortcuts, protocol handlers, the
  clipboard, screen capture); `eval` and `new Function`; environment variables read whose
  name says key, token, secret or password.
- **Native code.** Every `.node` addon inside or beside the archive (`app.asar.unpacked`).
- **The bundles.** A file that is a webpack build is read by its module table: every
  numbered module with its extent, and the edges between them from the module's own
  require calls; an esbuild build by its named modules. A fact found inside a bundle then
  carries the module it sits in. When the archive ships the bundle's map, every fact also
  carries the original file, line and column the map claims; the record says it is the
  bundler's claim.
- **The fuses.** An installed program has an executable beside `resources/`; the build-time
  switches live in it, after a fixed sentinel. Eight are known by name; a ninth or later
  is reported by its index, never guessed. Six have a state a shipped application is
  expected to have (`RunAsNode` off, cookie encryption on, `NODE_OPTIONS` ignored, the
  inspector arguments ignored, the archive's integrity checked, only the archive loaded);
  any other state is listed as weak and goes to `atlas-secure` as a `high` when the program
  is distributed. `fuses <exe>` reads one executable alone.

## How it reads

Each file is parsed into a syntax tree (the grammars the memory section already ships),
not searched as text. So a channel is found when it is a literal in place (`observed`),
and also when it is held in a constant, taken from an object of channels, built from two
literals or a template, defined as a compiled enum, or imported from another file of the
archive (`derived`). A bundle that keeps Electron on a namespace (`electron.ipcMain`) is
read the same. A wrapper the app wrote around `ipcMain.handle`, `ipcRenderer.invoke` or
`webContents.send` is recognised from its body (a function or a method whose parameter is
the channel); a plain call to it is a handler or a sender, `derived`; a call through an
object (`this.send(...)`) is `inferred`, and a wrapper with a generic name (`on`, `send`)
is not trusted that way. When no grammar is available the text patterns run instead and
the record says `reader: text`.

## What it cannot see

A channel built at run time from a value no file holds, a URL assembled from parts the
parser cannot join, a module loaded from a path computed at run time, code fetched from
the network, a minified bundle's original names, a renderer loaded from outside the
archive: all gaps, each counted in `limitations` and listed under `unknown` in the report
with the expression as written. `node_modules` is counted and not scanned unless `--all`
is asked; a dependency that opens a channel or a host is then found, at the cost of a
longer run.

## Comparing with the source

When the repository of the same program is here, run `app` on the source folder too. The
two records differ where the build changed things: a module in the source and not in the
archive (not shipped, or bundled under another name), a host in the archive and not in the
source (a dependency's), a handler in the source and not in the archive (dead code the
bundler dropped). The difference is the finding; neither record alone is.

## Two versions

`compare <A> <B>` reads both and lists what changed by name: channels, handlers, hosts,
processes, preferences, system APIs, bridge keys, packages, native addons, environment
secrets, fuses, modules, each as added and removed. What appeared is read first; a host or
a process that was not there before is the question to answer. A module the bundler
renamed shows as removed and added, and the record says so. The comparison is `derived`:
what neither reading could see, it cannot compare.
