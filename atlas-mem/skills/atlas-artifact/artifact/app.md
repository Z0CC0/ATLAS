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

## What it cannot see

The reading is textual. A channel name built from a variable, a URL assembled from parts,
a module loaded from a path computed at run time, code fetched from the network, a
minified bundle's original names: all gaps, each counted in `limitations` and listed under
`unknown` in the report. `node_modules` is counted and not scanned unless `--all` is asked;
a dependency that opens a channel or a host is then found, at the cost of a longer run.

## Comparing with the source

When the repository of the same program is here, run `app` on the source folder too. The
two records differ where the build changed things: a module in the source and not in the
archive (not shipped, or bundled under another name), a host in the archive and not in the
source (a dependency's), a handler in the source and not in the archive (dead code the
bundler dropped). The difference is the finding; neither record alone is.

## Two versions

Two archives of the same program, one `app` each, `--detail full`, and the lists compared
by name: channels added and removed, hosts added and removed, preferences that changed,
processes that appeared. What appeared is read first.
