// Tests for the artifact reader: node --test tests/artifact.test.mjs
// A tiny asar is built here from scratch (the header is sixteen bytes of sizes and a JSON
// tree), a SQLite file is written with node:sqlite, a source map by hand. Nothing external.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const tool = path.join(here, '..', 'tools', 'artifact.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-artifact-'));

function run(...args) {
  const r = spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr, json: (() => { try { return JSON.parse(r.stdout); } catch { return null; } })() };
}

/** Pack a {path: text} map into an asar the way Electron lays it out. */
function makeAsar(files, out) {
  const tree = { files: {} };
  const chunks = [];
  let offset = 0;
  for (const [p, content] of Object.entries(files)) {
    const buf = Buffer.from(content, 'utf8');
    const parts = p.split('/');
    let node = tree;
    for (const d of parts.slice(0, -1)) { node.files[d] = node.files[d] || { files: {} }; node = node.files[d]; }
    node.files[parts.at(-1)] = { size: buf.length, offset: String(offset) };
    chunks.push(buf);
    offset += buf.length;
  }
  const json = Buffer.from(JSON.stringify(tree), 'utf8');
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4);
  json.copy(padded);
  const header = Buffer.alloc(16);
  header.writeUInt32LE(4, 0);
  header.writeUInt32LE(padded.length + 8, 4);
  header.writeUInt32LE(padded.length + 4, 8);
  header.writeUInt32LE(json.length, 12);
  fs.writeFileSync(out, Buffer.concat([header, padded, ...chunks]));
}

const APP = {
  'package.json': JSON.stringify({ name: 'demo', productName: 'Demo', version: '1.2.3', main: 'main.js' }),
  'main.js': [
    "const { app, BrowserWindow, ipcMain, shell } = require('electron');",
    "const { spawn } = require('child_process');",
    "const helper = require('./lib/helper');",
    "function handle(name, fn) { ipcMain.handle(name, (e, ...a) => fn(...a)); }",
    "handle('demo:read', () => 1);",
    "ipcMain.on('demo:ping', () => {});",
    "const win = new BrowserWindow({ webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false } });",
    "win.webContents.send('demo:tick', 1);",
    "fetch('https://api.example.com/v1/items');",
    "spawn('git', ['status']);",
    "shell.openExternal('https://example.org');",
    "const k = process.env.DEMO_API_KEY;",
  ].join('\n'),
  'preload.js': [
    "const { contextBridge, ipcRenderer } = require('electron');",
    "contextBridge.exposeInMainWorld('demoApi', {",
    "  read: () => ipcRenderer.invoke('demo:read'),",
    "  ping: () => ipcRenderer.send('demo:ping'),",
    "  lost: () => ipcRenderer.invoke('demo:nobody'),",
    "  onTick: (cb) => ipcRenderer.on('demo:tick', cb),",
    "});",
  ].join('\n'),
  'lib/helper.js': "module.exports = { x: 1 };\nrequire('./missing');",
  'index.html': '<html><body><script src="renderer.js"></script></body></html>',
  'renderer.js': 'window.demoApi.read();',
  'node_modules/dep/index.js': "ipcMain.handle('dep:hidden', () => 0);",
};

test('detect names the formats it can read', () => {
  const asar = path.join(tmp, 'demo.asar');
  makeAsar(APP, asar);
  const d = run('detect', asar);
  assert.equal(d.json.result.format, 'asar');
  assert.ok(d.json.result.next.includes(' app '));
  const map = path.join(tmp, 'x.map');
  fs.writeFileSync(map, JSON.stringify({ version: 3, sources: [], mappings: '' }));
  assert.equal(run('detect', map).json.result.format, 'source-map');
  fs.writeFileSync(path.join(tmp, 'blob.bin'), Buffer.from([1, 2, 3, 4, 5]));
  assert.equal(run('detect', path.join(tmp, 'blob.bin')).json.result.format, 'unknown');
  assert.equal(run('detect', path.join(tmp, 'nope')).code, 2);
});

test('app reads an asar: entry, modules, ipc in both directions, bridge, window, hosts, processes', () => {
  const asar = path.join(tmp, 'demo.asar');
  makeAsar(APP, asar);
  const r = run('app', asar, '--detail', 'full');
  assert.equal(r.code, 0, r.out + r.err);
  const res = r.json.result;
  assert.equal(res.name, 'Demo');
  assert.equal(res.entry, 'main.js');
  assert.equal(res.files.sources, 4); // main, preload, lib/helper, renderer; node_modules not counted
  const mods = Object.fromEntries(res.modules.map((m) => [m.path, m]));
  assert.equal(mods['main.js'].reachedFromEntry, true);
  assert.equal(mods['lib/helper.js'].reachedFromEntry, true);
  assert.equal(mods['renderer.js'].reachedFromEntry, false); // reached through html, not require
  assert.ok(res.edges.some((e) => e.from === 'lib/helper.js' && e.missing), 'the missing require is marked');
  const channels = res.ipc.handlers.map((h) => h.channel).sort();
  assert.deepEqual(channels, ['demo:ping', 'demo:read']);
  assert.ok(res.ipc.handlers.find((h) => h.channel === 'demo:read').via.startsWith('wrapper handle'), 'the wrapper is read');
  assert.equal(res.ipc.handlers.find((h) => h.channel === 'demo:read').confidence, 'derived');
  assert.deepEqual(res.ipc.sentNeverHandled, ['demo:nobody']);
  assert.deepEqual(res.ipc.pushedNeverListened, []);
  assert.deepEqual(res.ipc.wrappers.map((w) => w.name), ['handle']);
  assert.ok(!res.ipc.handlers.some((h) => h.channel === 'dep:hidden'), 'node_modules is not scanned by default');
  assert.deepEqual(res.bridge.map((b) => b.key), ['demoApi']);
  assert.equal(res.windows.length, 1);
  assert.ok(res.windows[0].preferences.includes('contextIsolation:true'));
  assert.deepEqual(Object.keys(res.urls).sort(), ['api.example.com', 'example.org']);
  assert.equal(res.processes[0].command, 'git');
  assert.equal(res.shell[0].call, 'shell.openExternal');
  assert.deepEqual(res.envSecrets.map((e) => e.name), ['DEMO_API_KEY']);
  assert.deepEqual(res.renderers[0].scripts, ['renderer.js']);
  assert.equal(res.packages.electron, 2);
  assert.ok(r.json.id.startsWith('ev_'));
  assert.ok(r.json.limitations.some((l) => l.includes('not executed')));
  assert.equal(r.json.subject.format, 'asar');
  assert.equal(r.json.subject.sha256.length, 64);
});

test('app --all scans node_modules and says so; summary pages the lists', () => {
  const asar = path.join(tmp, 'demo.asar');
  const all = run('app', asar, '--all', '--detail', 'full');
  assert.ok(all.json.result.ipc.handlers.some((h) => h.channel === 'dep:hidden'));
  assert.ok(!all.json.limitations.some((l) => l.includes('node_modules listed')));
  const s = run('app', asar, '--per', '2', '--page', '1');
  assert.equal(s.json.result.modules.per, 2);
  assert.equal(s.json.result.modules.items.length, 2);
  assert.equal(s.json.result.modules.total, 4);
  const t = run('app', asar, '--text');
  assert.ok(t.out.includes('Demo 1.2.3'));
  assert.ok(t.out.includes('bridge keys demoApi'));
});

test('app reads a folder the same way, and a folder with resources/app.asar', () => {
  const dir = path.join(tmp, 'srcapp');
  for (const [p, c] of Object.entries(APP)) { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), c); }
  const r = run('app', dir, '--detail', 'full');
  assert.equal(r.json.subject.format, 'node-app');
  assert.equal(r.json.result.ipc.handlers.length, 2);
  const inst = path.join(tmp, 'installed', 'resources');
  fs.mkdirSync(inst, { recursive: true });
  makeAsar(APP, path.join(inst, 'app.asar'));
  const i = run('app', path.join(tmp, 'installed'));
  assert.equal(i.json.subject.format, 'asar');
  assert.equal(i.json.result.name, 'Demo');
});

test('sqlite reads schema, counts and a sample without writing', async () => {
  let sqlite;
  try { sqlite = await import('node:sqlite'); } catch { return; }
  const db = path.join(tmp, 'demo.db');
  const d = new sqlite.DatabaseSync(db);
  d.exec("create table notes (id integer primary key, title text not null, body blob); create index notes_title on notes(title); insert into notes (title, body) values ('a', x'0102'), ('b', null), ('c', 'x');");
  d.close();
  const before = fs.statSync(db).mtimeMs;
  const r = run('sqlite', db, '--table', 'notes', '--limit', '2');
  assert.equal(r.code, 0, r.out);
  const res = r.json.result;
  assert.equal(res.tables[0].name, 'notes');
  assert.equal(res.tables[0].rows, 3);
  assert.deepEqual(res.tables[0].columns.map((c) => c.name), ['id', 'title', 'body']);
  assert.equal(res.indexes[0].name, 'notes_title');
  assert.equal(res.sample.rows.length, 2);
  assert.equal(res.sample.rows[0].body, '<2 bytes>');
  assert.equal(fs.statSync(db).mtimeMs, before, 'the file is not touched');
  assert.equal(run('sqlite', db, '--table', 'nope').code, 2);
});

test('map decodes mappings and looks a position up', () => {
  const map = path.join(tmp, 't.map');
  fs.writeFileSync(map, JSON.stringify({ version: 3, file: 'out.js', sources: ['src/a.ts', 'src/b.ts'], names: ['foo', 'bar'], sourcesContent: ['const a=1;', null], mappings: 'AAAA,IAAIA;ACAJ,MAAMC' }));
  const r = run('map', map, '--line', '2', '--col', '5');
  assert.equal(r.code, 0, r.out);
  const res = r.json.result;
  assert.equal(res.segments, 4);
  assert.equal(res.generatedLines, 2);
  assert.equal(res.sourcesWithContent, 1);
  assert.deepEqual(res.lookup.original, { source: 'src/b.ts', line: 1, col: 0, name: null });
  const r2 = run('map', map, '--line', '1', '--col', '9');
  assert.equal(r2.json.result.lookup.original.name, 'foo');
  assert.ok(r.json.limitations.some((l) => l.includes("bundler's claim")));
});

test('channels held in constants, enums, templates and other files are resolved as derived', () => {
  const files = {
    'package.json': JSON.stringify({ name: 'c', main: 'main.js' }),
    'channels.js': "const CH = Object.freeze({ read: 'c:read', write: 'c:write' });\nconst PREFIX = 'c:';\nmodule.exports = { CH, PREFIX };",
    'enum.js': "var Kind;\n(function (Kind) { Kind['Start'] = 'k:start'; Kind.Stop = 'k:stop'; })(Kind || (Kind = {}));\nmodule.exports = { Kind };",
    'main.js': [
      "const electron = require('electron');",
      "const { CH, PREFIX } = require('./channels');",
      "const { Kind } = require('./enum');",
      "const LOCAL = 'c:local';",
      "function push(win, channel, data) { win.webContents.send(channel, data); }",
      "electron.ipcMain.handle(CH.read, () => 1);",
      "electron.ipcMain.on(PREFIX + 'join', () => 2);",
      "electron.ipcMain.on(`${PREFIX}leave`, () => 3);",
      "electron.ipcMain.on(LOCAL, () => 4);",
      "electron.ipcMain.on(Kind.Start, () => 5);",
      "electron.ipcMain.on(someVariable, () => 6);",
      "push(null, 'c:tick', 1);",
    ].join('\n'),
    'preload.js': "const { ipcRenderer } = require('electron');\nipcRenderer.on('c:tick', () => {});\nipcRenderer.invoke('c:read');",
  };
  const dir = path.join(tmp, 'consts');
  for (const [p, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir, p), c); }
  const r = run('app', dir, '--detail', 'full');
  assert.equal(r.code, 0, r.out + r.err);
  const res = r.json.result;
  assert.equal(res.reader, 'parse');
  const handlers = Object.fromEntries(res.ipc.handlers.map((h) => [h.channel, h.confidence]));
  assert.deepEqual(handlers, { 'c:read': 'derived', 'c:join': 'derived', 'c:leave': 'derived', 'c:local': 'derived', 'k:start': 'derived' });
  assert.equal(res.ipc.dynamic.length, 1);
  assert.equal(res.ipc.dynamic[0].expr, 'someVariable');
  assert.deepEqual(res.ipc.wrappers.map((w) => [w.name, w.side]), [['push', 'push']]);
  assert.ok(res.ipc.senders.some((s) => s.via === 'webContents.send' && s.channel === 'c:tick' && s.confidence === 'derived'));
  assert.deepEqual(res.ipc.pushedNeverListened, []);
  assert.deepEqual(res.ipc.sentNeverHandled, []);
});

test('a webpack bundle is read by its module table, findings sit in their module and map back through a shipped map', () => {
  // two modules in one webpack-style table; module 20 requires 10; the ipc call lives in 20
  // a table needs ten members before it is read as one (a smaller object is just an object)
  const bundle = [
    "var m = {",
    "  10(e, t, r) { t.exports = { x: 1 }; },",
    "  20(e, t, r) { const a = r(10); const { ipcMain } = r(30); ipcMain.handle('w:go', () => a.x); },",
    "  30(e, t, r) { t.exports = require('electron'); },",
    ...Array.from({ length: 9 }, (_, i) => `  ${40 + i}(e, t, r) { t.exports = ${i}; },`),
    "};",
  ].join('\n');
  // a map that claims line 3 col 2 of the bundle came from src/go.ts line 7
  const map = { version: 3, sources: ['src/one.ts', 'src/go.ts'], names: [], mappings: 'AAAA;AAAA;ECMA' };
  const files = { 'package.json': JSON.stringify({ name: 'w', main: 'bundle.js' }), 'bundle.js': bundle, 'bundle.js.map': JSON.stringify(map) };
  const asar = path.join(tmp, 'web.asar');
  makeAsar(files, asar);
  const r = run('app', asar, '--detail', 'full');
  assert.equal(r.code, 0, r.out + r.err);
  const res = r.json.result;
  assert.deepEqual(res.bundles, [{ file: 'bundle.js', kind: 'webpack', modules: 12, edges: 2 }]);
  assert.equal(res.maps, 1);
  const h = res.ipc.handlers.find((x) => x.channel === 'w:go');
  assert.equal(h.module, '20');
  assert.deepEqual(h.origin, { source: 'src/go.ts', line: 7, col: 0 });
  assert.ok(r.json.limitations.some((l) => l.includes("bundler's claim")));
});

test('an esbuild bundle names its modules by path', () => {
  const bundle = [
    "var __commonJS = (cb) => cb;",
    "var require_a = __commonJS({ 'src/a.js'(exports, module) { module.exports = 1; } });",
    "var require_b = __commonJS({ 'src/b.js'(exports, module) { const { ipcMain } = require('electron'); ipcMain.on('e:ping', () => {}); } });",
  ].join('\n');
  const dir = path.join(tmp, 'esb');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'e', main: 'bundle.js' }));
  fs.writeFileSync(path.join(dir, 'bundle.js'), bundle);
  const r = run('app', dir, '--detail', 'full');
  assert.equal(r.json.result.bundles[0].kind, 'esbuild');
  assert.equal(r.json.result.bundles[0].modules, 2);
  assert.equal(r.json.result.ipc.handlers[0].module, 'src/b.js');
});

test('fuses are read from the executable beside an installed archive, and alone', () => {
  const inst = path.join(tmp, 'fused');
  fs.mkdirSync(path.join(inst, 'resources'), { recursive: true });
  makeAsar(APP, path.join(inst, 'resources', 'app.asar'));
  const exe = Buffer.concat([Buffer.alloc(100, 0x90), Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX', 'latin1'), Buffer.from([1, 8]), Buffer.from('01001101', 'latin1'), Buffer.alloc(50, 0)]);
  fs.writeFileSync(path.join(inst, 'Fused.exe'), exe);
  const r = run('app', inst);
  assert.equal(r.code, 0, r.out + r.err);
  const fz = r.json.result.fuses;
  assert.equal(fz.count, 8);
  assert.equal(fz.fuses[0].state, 'off');
  assert.equal(fz.fuses[4].name, 'EnableEmbeddedAsarIntegrityValidation');
  assert.deepEqual(fz.weak, []);
  const alone = run('fuses', path.join(inst, 'Fused.exe'));
  assert.equal(alone.json.result.fuses[5].state, 'on');
  const weakExe = Buffer.concat([Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX', 'latin1'), Buffer.from([1, 9]), Buffer.from('101100011', 'latin1')]);
  fs.writeFileSync(path.join(tmp, 'weak.exe'), weakExe);
  const w = run('fuses', path.join(tmp, 'weak.exe'));
  assert.deepEqual(w.json.result.weak, ['RunAsNode:on', 'EnableCookieEncryption:off', 'EnableNodeOptionsEnvironmentVariable:on', 'EnableNodeCliInspectArguments:on', 'EnableEmbeddedAsarIntegrityValidation:off', 'OnlyLoadAppFromAsar:off']);
  assert.ok(w.json.result.fuses[8].name.startsWith('fuse 8'));
  fs.writeFileSync(path.join(tmp, 'plain.exe'), Buffer.alloc(64, 1));
  assert.equal(run('fuses', path.join(tmp, 'plain.exe')).json.result.found, false);
});

test('compare says what changed between two versions, by name', () => {
  const v1 = path.join(tmp, 'v1'), v2 = path.join(tmp, 'v2');
  for (const [d, extra] of [[v1, ''], [v2, "\nipcMain.handle('demo:new', () => 0);\nfetch('https://new.example.net/x');"]]) {
    for (const [p, c] of Object.entries(APP)) { fs.mkdirSync(path.dirname(path.join(d, p)), { recursive: true }); fs.writeFileSync(path.join(d, p), p === 'main.js' ? c + extra : c); }
  }
  fs.unlinkSync(path.join(v2, 'lib', 'helper.js'));
  const r = run('compare', v1, v2);
  assert.equal(r.code, 0, r.out + r.err);
  const res = r.json.result;
  assert.deepEqual(res.handlers, { added: ['demo:new'], removed: [] });
  assert.deepEqual(res.hosts, { added: ['new.example.net'], removed: [] });
  assert.deepEqual(res.modules, { added: [], removed: ['lib/helper.js'] });
  assert.equal(r.json.confidence, 'derived');
  assert.equal(run('compare', v1).code, 2);
});

test('bin reads the running node executable: a PE on Windows, an ELF or Mach-O elsewhere', () => {
  const r = run('bin', process.execPath);
  assert.equal(r.code, 0, r.out + r.err);
  const res = r.json.result;
  assert.ok(['pe', 'elf', 'mach-o'].includes(res.format));
  if (res.format === 'pe') {
    assert.equal(res.pe32plus, process.arch === 'x64' || process.arch === 'arm64');
    assert.ok(res.imports.some((i) => /^kernel32\.dll$/i.test(i.dll)), 'node imports kernel32');
    assert.ok(res.sections.some((s) => s.name === '.text' && s.flags.includes('exec')));
    assert.ok(res.version && /node/i.test(res.version.ProductName || res.version.FileDescription || ''), JSON.stringify(res.version));
    assert.equal(typeof res.hardening.aslr, 'boolean');
  } else if (res.format === 'elf') {
    assert.ok(res.needed.length >= 1);
    assert.equal(typeof res.hardening.pie, 'boolean');
  } else {
    assert.ok(res.dylibs.length >= 1);
  }
  assert.ok(r.json.limitations.some((l) => l.includes('not disassembled')));
  assert.equal(r.json.subject.sha256.length, 64);
  assert.equal(run('detect', process.execPath).json.result.next.includes(' bin '), true);
});

test('the Go and Rust readers and a hand-made ELF and Mach-O', async () => {
  const bin = await import(pathToFileURL(path.join(here, '..', 'tools', 'artifact-bin.mjs')).href);
  // Go build info, modern layout: magic, pointer size, flags bit 1, two varint-prefixed strings
  const mod = ['path\tgithub.com/x/app', 'mod\tgithub.com/x/app\t(devel)\t', 'dep\tgolang.org/x/sys\tv0.20.0\th1:abc=', 'build\tGOOS=linux', 'build\tGOARCH=amd64', ''].join('\n');
  const vlq = (n) => { const out = []; do { let c = n & 0x7f; n >>= 7; if (n) c |= 0x80; out.push(c); } while (n); return Buffer.from(out); };
  const go = Buffer.concat([Buffer.alloc(64, 0), Buffer.from('\xff Go buildinf:', 'latin1'), Buffer.from([8, 2]), Buffer.alloc(16, 0), vlq(8), Buffer.from('go1.22.3'), vlq(Buffer.byteLength(mod)), Buffer.from(mod), Buffer.alloc(32, 0)]);
  const g = bin.readGo(go);
  assert.equal(g.version, 'go1.22.3');
  assert.equal(g.main.path, 'github.com/x/app');
  assert.deepEqual(g.deps[0], { path: 'golang.org/x/sys', version: 'v0.20.0', sum: 'h1:abc=', replaced: false });
  assert.equal(g.settings.GOOS, 'linux');
  assert.equal(bin.readGo(Buffer.alloc(100, 1)), null);
  // Rust: the registry paths a panic message keeps
  const rs = Buffer.from('xx /rustc/8b0dd4d5e4b0f5c3a1e9f2b7c6d5e4f3a2b1c0d9/library/core/src/x.rs yy C:\\Users\\u\\.cargo\\registry\\src\\index.crates.io-6f17d22bba15001f\\serde-1.0.210\\src\\de.rs zz /home/u/.cargo/registry/src/index.crates.io-6f17d22bba15001f/tokio-1.40.0/src/lib.rs', 'latin1');
  const rr = bin.readRust(rs, null);
  assert.equal(rr.rustc.commit, '8b0dd4d5e4b0f5c3a1e9f2b7c6d5e4f3a2b1c0d9');
  assert.deepEqual(rr.crates.map((c) => `${c.name}@${c.version}`), ['serde@1.0.210', 'tokio@1.40.0']);
  assert.equal(bin.readRust(Buffer.from('nothing here'), null), null);
  // a 64-bit ELF with one executable GNU_STACK segment and no sections
  const elf = Buffer.alloc(64 + 56 * 2, 0);
  elf.write('\x7fELF', 0, 'latin1'); elf[4] = 2; elf[5] = 1; elf[6] = 1;
  elf.writeUInt16LE(3, 16); elf.writeUInt16LE(62, 18); elf.writeUInt32LE(1, 20);
  elf.writeBigUInt64LE(0x1000n, 24); elf.writeBigUInt64LE(64n, 32); elf.writeUInt16LE(56, 54); elf.writeUInt16LE(2, 56); elf.writeUInt16LE(64, 58);
  elf.writeUInt32LE(1, 64); elf.writeUInt32LE(5, 68); elf.writeBigUInt64LE(0n, 72); elf.writeBigUInt64LE(0x1000n, 80); elf.writeBigUInt64LE(0n, 88); elf.writeBigUInt64LE(BigInt(elf.length), 96); elf.writeBigUInt64LE(BigInt(elf.length), 104);
  elf.writeUInt32LE(0x6474e551, 120); elf.writeUInt32LE(7, 124);
  const e = bin.readElf(elf);
  assert.equal(e.machine, 'x86-64');
  assert.equal(e.hardening.pie, true);
  assert.equal(e.hardening.nx, false);
  assert.ok(e.limitations.some((l) => l.includes('no section headers')));
  // a 64-bit Mach-O with one LC_LOAD_DYLIB and one LC_BUILD_VERSION
  const name = Buffer.from('/usr/lib/libSystem.B.dylib\0\0\0\0\0\0');
  const dylib = Buffer.alloc(24 + name.length); dylib.writeUInt32LE(0xc, 0); dylib.writeUInt32LE(dylib.length, 4); dylib.writeUInt32LE(24, 8); dylib.writeUInt32LE(0, 12); dylib.writeUInt32LE((1 << 16) | (2 << 8) | 3, 16); name.copy(dylib, 24);
  const bv = Buffer.alloc(24); bv.writeUInt32LE(0x32, 0); bv.writeUInt32LE(24, 4); bv.writeUInt32LE(1, 8); bv.writeUInt32LE(14 << 16, 12); bv.writeUInt32LE(15 << 16, 16);
  const hdr = Buffer.alloc(32); hdr.writeUInt32LE(0xfeedfacf, 0); hdr.writeUInt32LE(0x0100000c, 4); hdr.writeUInt32LE(0, 8); hdr.writeUInt32LE(2, 12); hdr.writeUInt32LE(2, 16); hdr.writeUInt32LE(dylib.length + bv.length, 20); hdr.writeUInt32LE(0x200000, 24);
  const m = bin.readMachO(Buffer.concat([hdr, dylib, bv]), 0);
  assert.equal(m.cpu, 'arm64');
  assert.equal(m.filetype, 'executable');
  assert.deepEqual(m.dylibs[0], { name: '/usr/lib/libSystem.B.dylib', weak: false, reexport: false, version: '1.2.3' });
  assert.deepEqual(m.build, { platform: 'macos', minos: '14.0.0', sdk: '15.0.0' });
  assert.equal(m.flags.pie, true);
});

test('every record has the same spine', () => {
  const asar = path.join(tmp, 'demo.asar');
  for (const rec of [run('detect', asar).json, run('app', asar).json]) {
    for (const k of ['id', 'tool', 'subject', 'operation', 'params', 'confidence', 'coverage', 'limitations', 'result']) assert.ok(k in rec, `${rec.operation} has ${k}`);
    assert.ok(['observed', 'derived', 'inferred'].includes(rec.confidence));
    assert.ok(['complete', 'partial', 'unknown'].includes(rec.coverage.status));
  }
});

test.after(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* windows */ } });
