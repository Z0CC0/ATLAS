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
import { structurize, structureLinear, dominates, domTree, rpo } from '../tools/artifact-struct.mjs';
import { liftBlock as liftArm64Block } from '../tools/artifact-lift-arm64.mjs';
import { inferTypes, inferTypesArm, protoFor, signatureText } from '../tools/artifact-types.mjs';
import { readWasm, liftWasm } from '../tools/artifact-wasm.mjs';
import { readEvm, lift as liftEvm, selectors as evmSelectors, decode as evmDecode } from '../tools/artifact-evm.mjs';
import { readPcap, summarise as summarisePcap } from '../tools/artifact-pcap.mjs';
import { pointsTo } from '../tools/artifact-pointsto.mjs';
import { readElf, readMachO, buildSym } from '../tools/artifact-bin.mjs';

// A minimal real Mach-O64 (x86-64) with one lazy-binding stub for "_puts".
function makeMachoWithStub() {
  const buf = Buffer.alloc(0x140);
  const SEG = 0x20, DYS = 0xB8, SYM = 0x108, NLIST = 0x120, STR = 0x130, IND = 0x138, STUBOFF = 0x13C;
  const STUBVA = 0x100000000 + STUBOFF;
  buf.writeUInt32LE(0xfeedfacf, 0); buf.writeUInt32LE(0x01000007, 4); buf.writeUInt32LE(0, 8);
  buf.writeUInt32LE(2, 12); buf.writeUInt32LE(3, 16); buf.writeUInt32LE(0x100, 20); buf.writeUInt32LE(0, 24);
  buf.writeUInt32LE(0x19, SEG); buf.writeUInt32LE(152, SEG + 4); buf.write('__TEXT', SEG + 8, 'latin1');
  buf.writeBigUInt64LE(0x100000000n, SEG + 24); buf.writeBigUInt64LE(0x2000n, SEG + 32);
  buf.writeBigUInt64LE(0n, SEG + 40); buf.writeBigUInt64LE(BigInt(buf.length), SEG + 48);
  buf.writeUInt32LE(7, SEG + 56); buf.writeUInt32LE(5, SEG + 60); buf.writeUInt32LE(1, SEG + 64);
  const S = SEG + 72; buf.write('__stubs', S, 'latin1'); buf.write('__TEXT', S + 16, 'latin1');
  buf.writeBigUInt64LE(BigInt(STUBVA), S + 32); buf.writeBigUInt64LE(2n, S + 40);
  buf.writeUInt32LE(STUBOFF, S + 48); buf.writeUInt32LE(0, S + 68); buf.writeUInt32LE(2, S + 72);
  buf.writeUInt32LE(0xb, DYS); buf.writeUInt32LE(80, DYS + 4); buf.writeUInt32LE(IND, DYS + 56); buf.writeUInt32LE(1, DYS + 60);
  buf.writeUInt32LE(0x2, SYM); buf.writeUInt32LE(24, SYM + 4); buf.writeUInt32LE(NLIST, SYM + 8); buf.writeUInt32LE(1, SYM + 12); buf.writeUInt32LE(STR, SYM + 16); buf.writeUInt32LE(7, SYM + 20);
  buf.writeUInt32LE(1, NLIST); buf.write('\0_puts\0', STR, 'latin1'); buf.writeUInt32LE(0, IND);
  return buf;
}

// A minimal real ELF64 with one PLT slot for "puts", built by hand.
function makeElfWithPlt() {
  const buf = Buffer.alloc(0x340);
  const PH = 0x40, DYN = 0xB0, DSTR = 0xE0, DSYM = 0xE8, RELA = 0x118, PLT = 0x130, SHSTR = 0x150, SH = 0x1C0;
  buf.write('\0puts\0', DSTR, 'latin1');
  buf.writeUInt32LE(1, DSYM + 24); buf[DSYM + 24 + 4] = 0x12; buf.writeUInt16LE(0, DSYM + 24 + 6);
  buf.writeBigUInt64LE(0x3000n, RELA); buf.writeUInt32LE(7, RELA + 8); buf.writeUInt32LE(1, RELA + 12);
  const shstr = '\0' + '.dynstr\0.dynsym\0.rela.plt\0.plt\0.shstrtab\0';
  buf.write(shstr, SHSTR, 'latin1');
  const nameOff = (s) => shstr.indexOf('\0' + s + '\0') + 1;
  buf.write('\x7fELF', 0, 'latin1'); buf[4] = 2; buf[5] = 1; buf[6] = 1;
  buf.writeUInt16LE(2, 16); buf.writeUInt16LE(62, 18); buf.writeUInt32LE(1, 20);
  buf.writeBigUInt64LE(BigInt(PH), 32); buf.writeBigUInt64LE(BigInt(SH), 40);
  buf.writeUInt16LE(64, 52); buf.writeUInt16LE(56, 54); buf.writeUInt16LE(2, 56);
  buf.writeUInt16LE(64, 58); buf.writeUInt16LE(6, 60); buf.writeUInt16LE(5, 62);
  buf.writeUInt32LE(1, PH); buf.writeUInt32LE(5, PH + 4);
  buf.writeBigUInt64LE(BigInt(buf.length), PH + 32); buf.writeBigUInt64LE(BigInt(buf.length), PH + 40);
  buf.writeUInt32LE(2, PH + 56); buf.writeUInt32LE(6, PH + 56 + 4);
  buf.writeBigUInt64LE(BigInt(DYN), PH + 56 + 8); buf.writeBigUInt64LE(BigInt(DYN), PH + 56 + 16);
  buf.writeBigUInt64LE(0x30n, PH + 56 + 32); buf.writeBigUInt64LE(0x30n, PH + 56 + 40);
  buf.writeBigUInt64LE(5n, DYN); buf.writeBigUInt64LE(BigInt(DSTR), DYN + 8);
  buf.writeBigUInt64LE(10n, DYN + 16); buf.writeBigUInt64LE(6n, DYN + 24); buf.writeBigUInt64LE(0n, DYN + 32);
  const sh = (i, name, type, off, size, opt = {}) => { const o = SH + i * 64; buf.writeUInt32LE(nameOff(name), o); buf.writeUInt32LE(type, o + 4); buf.writeBigUInt64LE(BigInt(opt.addr || off), o + 16); buf.writeBigUInt64LE(BigInt(off), o + 24); buf.writeBigUInt64LE(BigInt(size), o + 32); buf.writeUInt32LE(opt.link || 0, o + 40); buf.writeBigUInt64LE(BigInt(opt.entsize || 0), o + 56); };
  sh(1, '.dynstr', 3, DSTR, 6); sh(2, '.dynsym', 11, DSYM, 48, { link: 1, entsize: 24 });
  sh(3, '.rela.plt', 4, RELA, 24, { entsize: 24 }); sh(4, '.plt', 1, PLT, 32, { addr: PLT });
  sh(5, '.shstrtab', 3, SHSTR, shstr.length);
  return buf;
}

test('ELF PLT is read and a direct call to a stub resolves to name@plt', () => {
  const r = readElf(makeElfWithPlt());
  assert.deepEqual(r.plt, [{ addr: 0x140, name: 'puts' }], 'the PLT stub maps to its symbol');
  const sym = buildSym(r);
  // a direct call whose target file offset is 0x140 (ins.addr 0x40 + displacement 0x100)
  assert.equal(sym({ addr: 0x40, len: 5, mnem: 'call', text: 'call 0x100' }), 'puts@plt');
  assert.equal(sym({ addr: 0x40, len: 5, mnem: 'call', text: 'call 0x200' }), '', 'an unrelated target stays unresolved');
});

test('Mach-O stubs are read and a direct call to a stub resolves to name@stub', () => {
  const r = readMachO(makeMachoWithStub());
  assert.deepEqual(r.stubs, [{ addr: 0x10000013C, name: '_puts' }], 'the __stubs slot maps to its symbol');
  const sym = buildSym(r);
  // a call at file offset 0x100 with displacement 0x3c targets the stub at 0x13c
  assert.equal(sym({ addr: 0x100, len: 5, mnem: 'call', text: 'call 0x3c' }), '_puts@stub');
});

test('a PE direct call to a named export resolves to module!name', () => {
  const r = { format: 'pe', sections: [{ vaddr: 0x1000, raw: 0x400, rawSize: 0x200, vsize: 0x200 }], iat: [], exports: { name: 'lib.dll', addrs: [{ rva: 0x1100, name: 'Foo' }] } };
  const sym = buildSym(r);
  // export rva 0x1100 -> file offset 0x500; a call at 0x400 with displacement 0x100 hits it
  assert.equal(sym({ addr: 0x400, len: 5, mnem: 'call', text: 'call 0x100' }), 'lib.dll!Foo');
});
import { recoverFrame, eliminateDeadStores, structLayouts, synthStructs, fieldWidths, arrayElems, fnPtrFields } from '../tools/artifact-frame.mjs';
import { liveness, defsUses, withAliases, valueFlow } from '../tools/artifact-dataflow.mjs';
import { liftBlock as liftX86Block } from '../tools/artifact-lift-x86.mjs';

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

test('observe refuses without the yes, and the inspector session speaks to a live Node', async () => {
  const dir = path.join(tmp, 'srcapp');
  const r = run('observe', dir);
  assert.equal(r.code, 2);
  assert.equal(r.json.error.code, 'consent');
  const runmod = await import(pathToFileURL(path.join(here, '..', 'tools', 'artifact-run.mjs')).href);
  const port = await runmod.freePort();
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, [`--inspect=${port}`, '-e', 'globalThis.answer = 41; setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  try {
    let targets = null;
    for (let i = 0; i < 40 && !targets; i += 1) { targets = await runmod.listTargets(port); if (!targets || !targets.length) { targets = null; await new Promise((x) => setTimeout(x, 150)); } }
    assert.ok(targets && targets.length, 'the inspector lists a target');
    const s = await new runmod.Session(targets[0].webSocketDebuggerUrl).open();
    await s.send('Runtime.enable');
    assert.equal(await s.evaluate('globalThis.answer + 1'), 42);
    const probe = await s.evaluate('JSON.stringify({ pid: process.pid, node: process.versions.node })');
    assert.equal(JSON.parse(probe).pid, child.pid);
    s.close();
  } finally { child.kill(); }
});

test('the CIL decoder reads an instruction stream and resolves tokens and strings', async () => {
  const cil = await import(pathToFileURL(path.join(here, '..', 'tools', 'artifact-cil.mjs')).href);
  const code = Buffer.from([
    0x00,             // nop
    0x02,             // ldarg.0
    0x1f, 0x05,       // ldc.i4.s 5
    0x72, 0x01, 0x00, 0x00, 0x70, // ldstr (#US token 0x70000001)
    0x28, 0x01, 0x00, 0x00, 0x0a, // call (MemberRef token 0x0a000001)
    0x2b, 0x01,       // br.s -> target past the ret
    0x2a,             // ret
  ]);
  const resolve = { token: (t) => `tok:${t.toString(16)}`, string: (t) => (t === 0x70000001 ? 'hello' : '?') };
  const d = cil.decode(code, 0, code.length, resolve);
  assert.equal(d.complete, true);
  assert.equal(d.stoppedAt, null);
  const ops = d.instructions.map((i) => i.op);
  assert.deepEqual(ops, ['nop', 'ldarg.0', 'ldc.i4.s', 'ldstr', 'call', 'br.s', 'ret']);
  assert.equal(d.instructions[2].operand, 5);
  assert.equal(d.instructions[3].operand.value, 'hello');
  assert.equal(d.instructions[4].operand.name, 'tok:a000001');
  assert.equal(d.instructions[5].operand.target, code.length); // 16 (after br.s) + 1
  assert.equal(cil.format(d.instructions[3]), 'IL_0004:  ldstr  "hello"');
  // a two-byte prefix opcode
  const fe = cil.decode(Buffer.from([0xfe, 0x01, 0x2a]), 0, 3, resolve); // ceq; ret
  assert.deepEqual(fe.instructions.map((i) => i.op), ['ceq', 'ret']);
  // an unknown opcode stops decoding and is reported
  const bad = cil.decode(Buffer.from([0x00, 0xf1, 0x2a]), 0, 3, resolve);
  assert.equal(bad.complete, false);
  assert.equal(bad.stoppedAt, 'f1');
  assert.equal(bad.instructions.length, 1);
});

test('cil decodes a real .NET assembly fully, or skips when none is installed', () => {
  const candidates = [];
  const dotnet = 'C:/Program Files/dotnet/shared/Microsoft.NETCore.App';
  try { for (const v of fs.readdirSync(dotnet)) candidates.push(path.join(dotnet, v, 'System.Private.CoreLib.dll')); } catch { /* not windows / no dotnet */ }
  const dll = candidates.find((p) => fs.existsSync(p));
  if (!dll) { return; } // nothing to decode here
  const r = run('cil', dll, '--max', '300');
  assert.equal(r.code, 0, r.out + r.err);
  const res = r.json.result;
  assert.equal(res.coverage.percent, 100, JSON.stringify(res.coverage.unknownOpcodes));
  assert.deepEqual(res.coverage.unknownOpcodes, []);
  const withCalls = res.methods.find((m) => m.instructions && m.instructions.some((i) => i.op === 'call' || i.op === 'callvirt' || i.op === 'newobj'));
  assert.ok(withCalls, 'a method with a call, its token resolved to a name');
  const call = withCalls.instructions.find((i) => i.op === 'call' || i.op === 'callvirt' || i.op === 'newobj');
  assert.ok(/::/.test(call.operand.name), `token resolved to Type::member, got ${call.operand.name}`);
  assert.equal(r.json.subject.format, 'cil');
  assert.ok(r.json.limitations.some((l) => l.includes('not executed')));
});

test('the x86-64 decoder reads length and mnemonics for common instructions', async () => {
  const x = await import(pathToFileURL(path.join(here, '..', 'tools', 'artifact-x86.mjs')).href);
  const cases = [
    [[0x48, 0x89, 0xc8], 3, 'mov rax, rcx'],
    [[0xc3], 1, 'ret'],
    [[0x48, 0x83, 0xec, 0x28], 4, 'sub rsp, 0x28'],      // group /5, reg field suppressed
    [[0x55], 1, 'push rbp'],
    [[0x48, 0x8b, 0x05, 0x34, 0x59, 0x4e, 0x03], 7, 'mov rax, [rip+0x34e5934]'], // RIP-relative
    [[0xe8, 0x10, 0x00, 0x00, 0x00], 5, null],            // call rel32
    [[0x0f, 0x84, 0x79, 0x00, 0x00, 0x00], 6, null],      // je rel32
    [[0xff, 0x15, 0x00, 0x10, 0x00, 0x00], 6, null],      // call [rip+...]  (group5 /2)
    [[0x48, 0xb8, 0x32, 0xa2, 0xdf, 0x2d, 0x99, 0x2b, 0x00, 0x00], 10, null], // movabs rax, imm64
    [[0x48, 0x8d, 0x4d, 0x10], 4, 'lea rcx, [rbp+0x10]'], // lea reg, mem
    [[0x0f, 0xb6, 0xc0], 3, 'movzx eax, al'],             // two-byte, reg,rm
  ];
  for (const [bytes, len, text] of cases) {
    const d = x.decodeOne(Buffer.from(bytes), 0, bytes.length);
    assert.equal(d.bad, false, `${bytes.map((b) => b.toString(16)).join(' ')} -> ${d.text}`);
    assert.equal(d.len, len, `len of ${bytes.map((b) => b.toString(16)).join(' ')}`);
    if (text) assert.equal(d.text, text);
  }
  // a prefixed/REX sweep stays in sync: three instructions back to back
  const seq = Buffer.from([0x55, 0x48, 0x89, 0xe5, 0xc3]); // push rbp; mov rbp, rsp; ret
  const sw = x.disasm(seq, 0, seq.length);
  assert.deepEqual(sw.instructions.map((i) => i.text), ['push rbp', 'mov rbp, rsp', 'ret']);
  assert.equal(sw.bad, 0);
});

test('disasm decodes a real x86-64 binary from its entry point, or skips', () => {
  const r = run('bin', process.execPath, '--compact');
  const arch = r.json && r.json.result && (r.json.result.machine || r.json.result.cpu);
  if (arch !== 'x86-64') return; // not an x86-64 host
  const d = run('disasm', process.execPath, '--count', '80');
  assert.equal(d.code, 0, d.out + d.err);
  const res = d.json.result;
  assert.equal(res.arch, 'x86-64');
  assert.ok(res.coverage.percent >= 98, `linear-sweep decode rate ${res.coverage.percent}%`);
  // the entry listing is real code: almost all decode, and prologue/ret mnemonics appear
  const listing = res.listing;
  const decoded = listing.filter((i) => !i.bad).length;
  assert.ok(decoded / listing.length >= 0.9, `${decoded}/${listing.length} of the entry listing decoded`);
  const mnems = new Set(listing.filter((i) => !i.bad).map((i) => i.mnem));
  assert.ok([...mnems].some((m) => ['mov', 'push', 'call', 'sub', 'lea', 'jmp', 'ret', 'cmp'].includes(m)), [...mnems].join(','));
  assert.ok(d.json.limitations.some((l) => l.includes('not executed')));
});

test('the ARM64 decoder reads fixed-width words into mnemonics and operands', async () => {
  const a = await import(pathToFileURL(path.join(here, '..', 'tools', 'artifact-arm64.mjs')).href);
  const cases = [
    [0xd65f03c0, 'ret', 'ret'],
    [0x910003fd, 'mov', 'mov x29, sp'],               // add xd, xn, #0 alias
    [0xa9bf7bfd, 'stp', 'stp x29, x30, [sp, -0x10]!'], // pre-indexed pair
    [0xf9400000, 'ldr', 'ldr x0, [x0]'],
    [0xd503201f, 'nop', 'nop'],
    [0x14000000, 'b', null],
    [0x94000000, 'bl', null],
    [0xd63f0000, 'blr', 'blr x0'],
    [0x9b007c00, 'mul', null],                          // madd with Ra=31 -> mul
    [0xaa0103e0, 'mov', 'mov x0, x1'],                  // orr xzr alias
    [0x320003e0, 'orr', 'orr w0, wzr, 0x1'],            // logical immediate expanded (DecodeBitMasks)
    [0xb900001f, 'str', 'str wzr, [x0]'],               // store of the zero register (Rt=31 -> wzr, not w31)
  ];
  for (const [w, mn, text] of cases) {
    const d = a.decodeOne(w >>> 0);
    assert.equal(d.bad, false, `${(w >>> 0).toString(16)} -> ${d.text}`);
    assert.equal(d.mnem, mn, `${(w >>> 0).toString(16)}`);
    if (text) assert.equal(d.text, text);
  }
  // a word in no allocated group is reported as data, never guessed
  assert.equal(a.decodeOne(0x00000000).bad, true);
  // a small sweep stays aligned (fixed width, so no desync is even possible)
  const buf = Buffer.alloc(12); buf.writeUInt32LE(0xa9bf7bfd, 0); buf.writeUInt32LE(0x910003fd, 4); buf.writeUInt32LE(0xd65f03c0, 8);
  const sw = a.disasm(buf, 0, 12);
  assert.deepEqual(sw.instructions.map((i) => i.mnem), ['stp', 'mov', 'ret']);
  assert.equal(sw.unknown, 0);
});

test('disasm reads a real arm64 binary, or skips when none is here', () => {
  const root = path.join(here, '..', '..', '..', '..', '..');
  let found = null;
  const tryDirs = [path.join(root, 'node_modules', 'onnxruntime-node', 'bin', 'napi-v6', 'linux', 'arm64'), path.join(root, 'node_modules', 'onnxruntime-node', 'bin', 'napi-v6', 'darwin', 'arm64')];
  for (const dirp of tryDirs) { try { for (const f of fs.readdirSync(dirp)) if (f.endsWith('.node')) { found = path.join(dirp, f); break; } } catch { /* not here */ } if (found) break; }
  if (!found) return;
  const b = run('bin', found, '--compact');
  if (!b.json || (b.json.result.machine !== 'arm64' && b.json.result.cpu !== 'arm64')) return;
  const d = run('disasm', found, '--count', '40');
  assert.equal(d.code, 0, d.out + d.err);
  assert.equal(d.json.result.arch, 'arm64');
  assert.ok(d.json.result.coverage.allocatedPercent >= 99, `allocated ${d.json.result.coverage.allocatedPercent}%`);
  assert.equal(d.json.result.coverage.unknown, 0, 'a fixed-width decoder leaves nothing unaligned');
  const mnems = new Set(d.json.result.listing.filter((i) => !i.bad && !i.coarse).map((i) => i.mnem));
  assert.ok([...mnems].some((m) => ['stp', 'ldr', 'mov', 'bl', 'ret', 'adrp', 'add'].includes(m)), [...mnems].join(','));
});

test('the Dalvik decoder reads register instructions and resolves pool references', async () => {
  const dex = await import(pathToFileURL(path.join(here, '..', 'tools', 'artifact-dex.mjs')).href);
  // code units (16-bit LE): const/4 v0,#1 ; const-string v2,@5 ; invoke-direct {v1,v2},@3 ; return-void ; <bad>
  const units = [0x1012, 0x021a, 0x0005, 0x2070, 0x0003, 0x0021, 0x000e];
  const buf = Buffer.alloc(units.length * 2 + 2);
  units.forEach((w, i) => buf.writeUInt16LE(w, i * 2));
  buf.writeUInt16LE(0x00e3, units.length * 2); // 0xe3: an unused opcode -> stops
  const resolve = (kind, idx) => kind === 'string' ? `"s${idx}"` : kind === 'method' ? `Foo.bar#${idx}` : `@${idx}`;
  const d = dex.decodeInsns((i) => buf.readUInt16LE(i * 2), buf.length / 2, resolve);
  assert.equal(d.complete, false);
  assert.equal(d.stoppedAt, 'e3');
  assert.deepEqual(d.instructions.map((x) => x.text), [
    'const/4 v0, #1',
    'const-string v2, "s5"',
    'invoke-direct {v1, v2}, Foo.bar#3',
    'return-void',
  ]);
});

test('an APK (zip) yields its classes.dex, extracted', async () => {
  const dex = await import(pathToFileURL(path.join(here, '..', 'tools', 'artifact-dex.mjs')).href);
  const content = Buffer.from('dex\n035\0THIS-IS-THE-DEX-PAYLOAD');
  const name = Buffer.from('classes.dex');
  const lfh = Buffer.alloc(30); lfh.writeUInt32LE(0x04034b50, 0); lfh.writeUInt16LE(0, 8); lfh.writeUInt32LE(content.length, 18); lfh.writeUInt32LE(content.length, 22); lfh.writeUInt16LE(name.length, 26);
  const local = Buffer.concat([lfh, name, content]);
  const cdh = Buffer.alloc(46); cdh.writeUInt32LE(0x02014b50, 0); cdh.writeUInt16LE(0, 10); cdh.writeUInt32LE(content.length, 20); cdh.writeUInt32LE(content.length, 24); cdh.writeUInt16LE(name.length, 28); cdh.writeUInt32LE(0, 42);
  const cd = Buffer.concat([cdh, name]);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(local.length, 16);
  const zip = Buffer.concat([local, cd, eocd]);
  const got = dex.dexEntriesFromZip(zip);
  assert.equal(got.length, 1);
  assert.equal(got[0].name, 'classes.dex');
  assert.equal(got[0].data.toString(), content.toString());
});

test('dex decodes a real DEX fully when one is present, else skips', () => {
  const candidates = [];
  const scratch = process.env.ATLAS_DEX || '';
  if (scratch && fs.existsSync(scratch)) candidates.push(scratch);
  const dll = candidates.find((p) => fs.existsSync(p));
  if (!dll) return;
  const r = run('dex', dll, '--max', '200');
  assert.equal(r.code, 0, r.out + r.err);
  assert.equal(r.json.result.coverage.percent, 100, JSON.stringify(r.json.result.coverage.unknownOpcodes));
  assert.ok(r.json.result.decoded.some((m) => m.instructions && m.instructions.some((i) => /invoke/.test(i.op))));
});

test('the CIL lift rebuilds pseudo-C# from the stack machine', async () => {
  const cil = await import(pathToFileURL(path.join(here, '..', 'tools', 'artifact-cil.mjs')).href);
  // return (arg0 + 5);
  let p = cil.lift([{ il: 0, op: 'ldarg.0' }, { il: 1, op: 'ldc.i4.5' }, { il: 2, op: 'add' }, { il: 3, op: 'ret' }], {});
  assert.deepEqual(p.map((s) => s.text), ['return (arg0 + 5);']);
  // an instance call with a receiver, arity from the signature
  const sig = (tok) => (tok === 1 ? { hasThis: true, paramCount: 0, retVoid: false } : { hasThis: false, paramCount: 1, retVoid: false });
  p = cil.lift([{ il: 0, op: 'ldarg.0' }, { il: 1, op: 'callvirt', operand: { token: 1, name: 'Foo::Bar' } }, { il: 6, op: 'ret' }], { sig });
  assert.deepEqual(p.map((s) => s.text), ['return arg0.Bar();']);
  // a constructor: pops its args, pushes the object
  p = cil.lift([{ il: 0, op: 'ldstr', operand: { value: 'x' } }, { il: 5, op: 'newobj', operand: { token: 2, name: 'Ex::.ctor' } }, { il: 10, op: 'throw' }], { sig });
  assert.deepEqual(p.map((s) => s.text), ['throw new Ex("x");']);
  // a branch becomes a label and a conditional goto; the field store reads back
  p = cil.lift([{ il: 0, op: 'ldarg.0' }, { il: 1, op: 'brtrue.s', operand: { target: 8 } }, { il: 3, op: 'ldarg.1' }, { il: 4, op: 'stsfld', operand: { name: 'field X.n' } }, { il: 8, op: 'ret' }], {});
  assert.deepEqual(p.map((s) => s.text), ['if (arg0) goto IL_0008;', 'X.n = arg1;', 'IL_0008:', 'return;']);
});

test('cil --pseudo lifts a real assembly without crashing, when one is installed', () => {
  const dotnet = 'C:/Program Files/dotnet/shared/Microsoft.NETCore.App';
  let dll = null;
  try { for (const v of fs.readdirSync(dotnet)) { const p = path.join(dotnet, v, 'System.Private.CoreLib.dll'); if (fs.existsSync(p)) { dll = p; break; } } } catch { /* no dotnet */ }
  if (!dll) return;
  const r = run('cil', dll, '--method', 'ThrowArgumentNullException', '--max', '1', '--pseudo');
  assert.equal(r.code, 0, r.out + r.err);
  const m = r.json.result.methods.find((x) => x.pseudo);
  assert.ok(m && m.pseudo.length >= 1, 'a method came back with pseudocode');
  assert.ok(m.pseudo.some((s) => /throw new .*ArgumentNullException/.test(s.text)), m.pseudo.map((s) => s.text).join(' | '));
});

test('the CFG builder splits blocks, resolves direct edges and finds a loop', async () => {
  const cfg = await import(pathToFileURL(path.join(here, '..', 'tools', 'artifact-cfg.mjs')).href);
  // 0: je 0x8 (cond, fall to 4) ; 4: jmp -0x4 (back to 0 -> loop) ; 8: ret
  const prog = {
    0: { addr: 0, len: 4, mnem: 'je', text: 'je 0x8', bad: false },
    4: { addr: 4, len: 4, mnem: 'jmp', text: 'jmp -0x4', bad: false },
    8: { addr: 8, len: 4, mnem: 'ret', text: 'ret', bad: false },
  };
  const g = cfg.buildCfg((pos) => prog[pos] || null, 0, 12, 'x86-64', 8192);
  assert.equal(g.blocks.length, 3);
  assert.equal(g.loops, 1);
  const b0 = g.blocks.find((b) => b.start === 0);
  assert.deepEqual(b0.succ.map((s) => s.to).sort((a, b) => a - b), [4, 8]);
  const b4 = g.blocks.find((b) => b.start === 4);
  assert.equal(b4.succ[0].to, 0);
  assert.equal(b4.succ[0].loop, true);
  const txt = cfg.formatCfg(g, 0);
  assert.ok(/L_0:/.test(txt) && /loop/.test(txt) && /return/.test(txt));
});

test('cfg recovers a function from a real binary, or skips', () => {
  const b = run('bin', process.execPath, '--compact');
  const arch = b.json && b.json.result && (b.json.result.machine || b.json.result.cpu);
  if (arch !== 'x86-64') return;
  const c = run('cfg', process.execPath, '--budget', '512');
  assert.equal(c.code, 0, c.out + c.err);
  assert.equal(c.json.result.arch, 'x86-64');
  assert.ok(c.json.result.blockCount >= 1);
  assert.ok(c.json.result.instructions >= 1);
  assert.ok(c.json.limitations.some((l) => l.includes('indirect')));
});

test('the ARM64 lift folds expressions, loads, stores, calls and recovers a condition', () => {
  const r = liftArm64Block([
    { text: 'ldr x0, [x1, 0x10]' },   // x0 = x1->field_10
    { text: 'add x0, x0, 0x1' },      // x0 = (… + 0x1)
    { text: 'cmp x0, x2' },           // flags from x0 - x2
    { text: 'b.eq .+0x8' },
  ]);
  assert.equal(r.cond.text, '(x1->field_10 + 0x1) == x2');
  const s = liftArm64Block([
    { text: 'mov x8, 0x0' },
    { text: 'str x8, [x19, 0x8]' },   // x19->field_8 = 0
    { text: 'bl .+0x40' },            // x0 = call
    { text: 'cbnz x0, .+0xc' },
  ]);
  assert.ok(s.stmts.includes('x19->field_8 = 0x0;'), s.stmts.join(' | '));
  assert.ok(s.stmts.some((x) => /^x0 = /.test(x)), 'the call result is a statement');
  assert.equal(s.cond.text, 'x0 != 0');
});

test('ARM64 liveness drops a dead spill and keeps the return value', async () => {
  const df = await import(pathToFileURL(path.join(here, '..', 'tools', 'artifact-dataflow.mjs')).href);
  const fr = await import(pathToFileURL(path.join(here, '..', 'tools', 'artifact-frame.mjs')).href);
  const cfg = { start: 0, blocks: [
    { start: 0, insns: [{ text: 'ldr x9, [x0, 0x8]', mnem: 'ldr' }, { text: 'ldr x10, [x0, 0x10]', mnem: 'ldr' }, { text: 'cbz x10, .+0x8', mnem: 'cbz' }], succ: [{ to: 8, cond: true }, { to: 4, fall: true }] },
    { start: 4, insns: [{ text: 'add x0, x10, 0x1', mnem: 'add' }, { text: 'ret', mnem: 'ret' }], succ: [] },
    { start: 8, insns: [{ text: 'mov x0, 0x0', mnem: 'mov' }, { text: 'ret', mnem: 'ret' }], succ: [] },
  ] };
  const live = df.liveness(cfg, 'arm64');
  assert.ok(live.get(0).has('x10') && !live.get(0).has('x9'), 'x10 live, x9 dead');
  const body = fr.eliminateDeadStores(structurize(cfg, 0, (b) => liftArm64Block(b.insns, null, df.withAliases(live.get(b.start) || new Set(), 'arm64'))));
  assert.ok(!/x9 = /.test(body), 'the dead x9 spill is removed');
  assert.match(body, /x0 = 0x0;/, 'the return value of the then-arm is kept');
  assert.match(body, /x0 = \(x10 \+ 0x1\);/, 'the return value of the else-arm is kept');
});

test('ARM64 blocks structure into if/else through the shared structurizer', () => {
  const cfg = { start: 0, blocks: [
    { start: 0, insns: [{ text: 'cmp x0, 0x0', mnem: 'cmp' }, { text: 'b.eq .+0x8', mnem: 'b.eq' }], succ: [{ to: 8, cond: true }, { to: 4, fall: true }] },
    { start: 4, insns: [{ text: 'mov x0, 0x1', mnem: 'mov' }, { text: 'ret', mnem: 'ret' }], succ: [] },
    { start: 8, insns: [{ text: 'mov x0, 0x2', mnem: 'mov' }, { text: 'ret', mnem: 'ret' }], succ: [] },
  ] };
  const out = structurize(cfg, 0, (b) => liftArm64Block(b.insns, null));
  assert.match(out, /if \(x0 == 0x0\) \{/);
  assert.match(out, /\} else \{/);
  assert.ok(!/goto/.test(out), 'a reducible arm64 diamond needs no goto');
});

test('the x86 lift folds expressions and recovers a branch condition', async () => {
  const lx = await import(pathToFileURL(path.join(here, '..', 'tools', 'artifact-lift-x86.mjs')).href);
  const insns = [
    { mnem: 'mov', text: 'mov rax, rcx' },
    { mnem: 'add', text: 'add rax, 0x5' },
    { mnem: 'cmp', text: 'cmp rax, rdx' },
    { mnem: 'je', text: 'je 0x10' },
  ];
  const r = lx.liftBlock(insns);
  assert.ok(r.stmts.includes('rax = (rcx + 0x5);'), r.stmts.join(' | '));
  assert.equal(r.cond.text, '(rcx + 0x5) == rdx');
  // a memory store, and test+jne -> != 0
  const r2 = lx.liftBlock([{ mnem: 'mov', text: 'mov [rdi], rsi' }, { mnem: 'test', text: 'test rsi, rsi' }, { mnem: 'jne', text: 'jne 0x8' }]);
  assert.ok(r2.stmts.includes('*rdi = rsi;'), r2.stmts.join(' | '));
  assert.equal(r2.cond.text, 'rsi != 0');
});

test('the lift renders array and field access from the address shape', async () => {
  const lx = await import(pathToFileURL(path.join(here, '..', 'tools', 'artifact-lift-x86.mjs')).href);
  const load = lx.liftBlock([{ mnem: 'mov', text: 'mov rax, [r8+rcx*8]' }], null, new Set(['rax']));
  assert.ok(load.stmts.includes('rax = r8[rcx];'), load.stmts.join(' | '));
  const field = lx.liftBlock([{ mnem: 'mov', text: 'mov rax, [rcx+0x70]' }], null, new Set(['rax']));
  assert.ok(field.stmts.includes('rax = rcx->field_70;'), field.stmts.join(' | '));
  const store = lx.liftBlock([{ mnem: 'mov', text: 'mov [r8+rax*8], rdx' }]);
  assert.ok(store.stmts.includes('r8[rax] = rdx;'), store.stmts.join(' | '));
});

test('cfg --pseudo lifts a real x86-64 function to pseudo-C, or skips', () => {
  const b = run('bin', process.execPath, '--compact');
  if (!b.json || (b.json.result.machine !== 'x86-64')) return;
  const c = run('cfg', process.execPath, '--pseudo', '--budget', '512');
  assert.equal(c.code, 0, c.out + c.err);
  assert.ok(c.json && c.json.result.blockCount >= 1);
});

test('the Dalvik lift rebuilds pseudo-Java (new, fields, binops, branches)', async () => {
  const dex = await import(pathToFileURL(path.join(here, '..', 'tools', 'artifact-dex.mjs')).href);
  // new-instance + <init> + const-string + throw  ->  throw new RuntimeException("Stub!");
  let p = dex.liftDalvik([
    { off: 0, op: 'new-instance', text: 'new-instance v1, Ljava/lang/RuntimeException;' },
    { off: 2, op: 'const-string', text: 'const-string v2, "Stub!"' },
    { off: 4, op: 'invoke-direct', text: 'invoke-direct {v1, v2}, Ljava/lang/RuntimeException;.<init>' },
    { off: 7, op: 'throw', text: 'throw v1' },
  ]);
  assert.deepEqual(p.map((s) => s.text), ['throw new RuntimeException("Stub!");']);
  // a binop folded into a field store
  p = dex.liftDalvik([
    { off: 0, op: 'add-int', text: 'add-int v0, v1, v2' },
    { off: 1, op: 'iput', text: 'iput v0, v3, Lcom/X;.count:I' },
  ]);
  assert.deepEqual(p.map((s) => s.text), ['v3.count = (v1 + v2);']);
  // an invoke whose result is taken, then returned
  p = dex.liftDalvik([
    { off: 0, op: 'invoke-virtual', text: 'invoke-virtual {v1}, Lcom/X;.size' },
    { off: 3, op: 'move-result', text: 'move-result v0' },
    { off: 4, op: 'return', text: 'return v0' },
  ]);
  assert.deepEqual(p.map((s) => s.text), ['return v1.size();']);
  // a conditional branch
  p = dex.liftDalvik([{ off: 0, op: 'if-eqz', text: 'if-eqz v0, L_8' }]);
  assert.deepEqual(p.map((s) => s.text), ['if (v0 == 0) goto L_8;']);
});

test('a PE exposes its import address table, and calls resolve to dll!function', () => {
  const r = run('bin', process.execPath, '--detail', 'full');
  if (!r.json || r.json.result.format !== 'pe') return; // not a PE host
  const iat = r.json.result.iat;
  assert.ok(Array.isArray(iat) && iat.length >= 1, 'the IAT is read');
  assert.ok(iat.every((e) => typeof e.rva === 'number' && /.+!.+/.test(e.name)), 'each slot has an rva and a dll!name');
  if (r.json.result.machine !== 'x86-64') return;
  const d = run('disasm', process.execPath, '--count', '1500');
  assert.equal(d.code, 0);
  // the annotation only shows in --text; here assert the IAT lookup data is sound: at least
  // one import is a well-known kernel/ntdll symbol
  assert.ok(iat.some((e) => /KERNEL32!|ntdll!|ADVAPI32!/i.test(e.name)), iat.slice(0, 3).map((e) => e.name).join(','));
});

test('every record has the same spine', () => {
  const asar = path.join(tmp, 'demo.asar');
  for (const rec of [run('detect', asar).json, run('app', asar).json]) {
    for (const k of ['id', 'tool', 'subject', 'operation', 'params', 'confidence', 'coverage', 'limitations', 'result']) assert.ok(k in rec, `${rec.operation} has ${k}`);
    assert.ok(['observed', 'derived', 'inferred'].includes(rec.confidence));
    assert.ok(['complete', 'partial', 'unknown'].includes(rec.coverage.status));
  }
});

test('structuring turns a diamond into if/else with a single merge', () => {
  const cfg = { start: 0, blocks: [
    { start: 0, insns: [], succ: [{ to: 16, cond: true }, { to: 8, fall: true }] },
    { start: 8, insns: [], succ: [{ to: 24, fall: true }] },
    { start: 16, insns: [], succ: [{ to: 24, fall: true }] },
    { start: 24, insns: [], succ: [] },
  ] };
  const lift = (b) => ({ stmts: [`s_${b.start.toString(16)}();`], cond: b.start === 0 ? { text: 'x == 1' } : null });
  const t = structurize(cfg, 0, lift);
  assert.match(t, /if \(x == 1\) \{/);
  assert.match(t, /\} else \{/);
  assert.ok(t.indexOf('s_18();') > t.indexOf('} else {'), 'the merge block prints once after the if');
  assert.equal((t.match(/s_18\(\);/g) || []).length, 1, 'merge emitted exactly once, not duplicated into both arms');
  assert.ok(!/goto/.test(t), 'a reducible diamond needs no goto');
});

test('structuring recovers a loop with a break, no goto', () => {
  const cfg = { start: 0, blocks: [
    { start: 0, insns: [], succ: [{ to: 8, cond: true }, { to: 16, fall: true }] },
    { start: 8, insns: [], succ: [{ to: 0, fall: true, loop: true }] },
    { start: 16, insns: [], succ: [] },
  ] };
  const lift = (b) => ({ stmts: [`s_${b.start.toString(16)}();`], cond: b.start === 0 ? { text: 'i < n' } : null });
  const t = structurize(cfg, 0, lift);
  assert.match(t, /for \(;;\) \{|while \(/);
  assert.match(t, /break;/);
  assert.ok(!/goto/.test(t), 'a natural loop needs no goto');
});

test('structureLinear turns labelled-goto bytecode into if/else and keeps the return value', () => {
  const body = structureLinear([
    { off: 0, text: 't0 = arg0;' }, { off: 1, text: 'if (!(t0)) goto IL_0008;' },
    { off: 3, text: 'loc0 = 1;' }, { off: 6, text: 'goto IL_000b;' },
    { off: 8, text: 'IL_0008:' }, { off: 8, text: 'loc0 = 2;' },
    { off: 0xb, text: 'IL_000b:' }, { off: 0xb, text: 'return loc0;' },
  ]).join('\n');
  assert.match(body, /if \(!\(t0\)\) \{/);
  assert.match(body, /\} else \{/);
  assert.match(body, /return loc0;/);
  assert.ok(!/goto/.test(body), 'a reducible bytecode diamond needs no goto');
});

test('structureLinear recovers a while loop from bytecode', () => {
  const body = structureLinear([
    { off: 0, text: 'loc0 = 0;' }, { off: 2, text: 'IL_0002:' },
    { off: 2, text: 'if (loc0 >= arg0) goto IL_0010;' }, { off: 5, text: 'sum = (sum + loc0);' },
    { off: 9, text: 'loc0 = (loc0 + 1);' }, { off: 0xd, text: 'goto IL_0002;' },
    { off: 0x10, text: 'IL_0010:' }, { off: 0x10, text: 'return sum;' },
  ]).join('\n');
  assert.match(body, /while \(|for \(;;\)/);
  assert.match(body, /return sum;/);
});

test('dominators: entry dominates all, a branch does not dominate the merge', () => {
  const succ = new Map([[0, [16, 8]], [8, [24]], [16, [24]], [24, []]]);
  const pred = new Map([[0, []], [8, [0]], [16, [0]], [24, [8, 16]]]);
  const order = rpo(0, succ);
  const idom = domTree(0, succ, pred, order);
  assert.ok(dominates(idom, 0, 24), 'entry dominates the merge');
  assert.ok(!dominates(idom, 8, 24), 'one branch does not dominate the merge');
  assert.equal(idom.get(24), 0, 'the merge is dominated immediately by the entry');
});

test('prototype lookup is A/W-suffix tolerant and yields a C signature', () => {
  const a = protoFor('ADVAPI32!EventRegister');
  assert.ok(a && a.proto.ret === 'ULONG' && a.proto.args.length === 4);
  const w = protoFor('KERNEL32!GetModuleHandleW'); // matches GETMODULEHANDLE via the W drop
  assert.ok(w && w.proto.ret === 'HMODULE');
  assert.equal(signatureText('CloseHandle', protoFor('KERNEL32!CloseHandle').proto), 'BOOL CloseHandle(HANDLE)');
  assert.equal(protoFor('MYAPP!private_helper'), null);
  // libc/libm/pthread via the ELF @plt form
  assert.equal(protoFor('malloc@plt').proto.ret, 'void*');
  assert.deepEqual(protoFor('pthread_mutex_lock@plt').proto, { ret: 'int', args: ['pthread_mutex_t*'] });
  assert.equal(protoFor('sqrt@plt').proto.ret, 'double');
  assert.equal(protoFor('tolower@plt').proto.args[0], 'int');
});

test('type recovery anchors argument and return types at a resolved call', () => {
  const cfg = { start: 0, blocks: [
    { start: 0, insns: [
      { addr: 0, len: 5, text: 'mov ecx, 0x1', mnem: 'mov' },
      { addr: 5, len: 6, text: 'call [rip+0x10]', mnem: 'call' },
      { addr: 11, len: 2, text: 'ret', mnem: 'ret' },
    ], succ: [] },
  ] };
  const sym = (ins) => (ins.mnem === 'call' ? 'KERNEL32!MultiByteToWideChar' : '');
  const ti = inferTypes(cfg, sym);
  assert.equal(ti.anchored, 1, 'one call anchored');
  assert.equal(ti.signatures[0].text, 'int MultiByteToWideChar(UINT, DWORD, LPCCH, int, LPWSTR, int)');
  assert.equal(ti.regTypes.rax, 'int', 'return typed into rax');
  assert.equal(ti.regTypes.rcx, 'UINT', 'first arg typed into rcx');
  assert.equal(ti.regTypes.r8, 'LPCCH', 'third arg typed into r8');
});

test('ARM64 type recovery anchors arg/return types from a PLT call and types an sp slot', () => {
  const cfg = { blocks: [{ start: 0, insns: [
    { text: 'bl .+0x40', mnem: 'bl', addr: 0 },        // resolves to memcpy@plt
    { text: 'str x0, [sp, 0x18]', mnem: 'str', addr: 4 }, // store the return into a local
  ] }] };
  const sym = (ins) => (ins.mnem === 'bl' ? 'memcpy@plt' : '');
  const ti = inferTypesArm(cfg, sym);
  assert.equal(ti.signatures[0].text, 'void* memcpy(void*, const void*, size_t)');
  assert.equal(ti.regTypes.x0, 'void*');
  assert.equal(ti.regTypes.x2, 'size_t', 'the third A64 argument register is typed');
  assert.equal(ti.slotTypes.local_18, 'void*', 'the return stored into the slot types it');
});

test('a typed return stored to a stack slot types that slot', () => {
  const cfg = { start: 0, blocks: [
    { start: 0, insns: [
      { addr: 0, len: 6, text: 'call [rip+0x10]', mnem: 'call' },   // returns HANDLE
      { addr: 6, len: 5, text: 'mov [rsp+0x30], rax', mnem: 'mov' }, // store to a local
      { addr: 11, len: 1, text: 'ret', mnem: 'ret' },
    ], succ: [] },
  ] };
  const sym = (ins) => (ins.mnem === 'call' ? 'KERNEL32!CreateFileA' : '');
  const ti = inferTypes(cfg, sym);
  assert.equal(ti.slotTypes.local_30, 'HANDLE', 'the slot takes the return type of CreateFile');
});

test('an unknown call clears the volatile register types', () => {
  const cfg = { start: 0, blocks: [
    { start: 0, insns: [
      { addr: 0, len: 6, text: 'call [rip+0x10]', mnem: 'call' },  // known: sets rax/rcx...
      { addr: 6, len: 6, text: 'call [rip+0x20]', mnem: 'call' },  // unknown: clobbers them
      { addr: 12, len: 2, text: 'ret', mnem: 'ret' },
    ], succ: [] },
  ] };
  const sym = (ins) => (ins.addr === 0 ? 'KERNEL32!CloseHandle' : 'APP!helper');
  const ti = inferTypes(cfg, sym);
  assert.equal(ti.anchored, 1);
  assert.equal(ti.regTypes.rax, undefined, 'rax cleared by the later unknown call');
});

// A minimal Wasm module built by hand: one exported function add(i32,i32)->i32.
const WASM_ADD = Buffer.from([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, // magic, version 1
  0x01, 0x07, 0x01, 0x60, 0x02, 0x7f, 0x7f, 0x01, 0x7f, // type: (i32,i32)->i32
  0x03, 0x02, 0x01, 0x00, // function: one func, type 0
  0x07, 0x07, 0x01, 0x03, 0x61, 0x64, 0x64, 0x00, 0x00, // export "add" func 0
  0x0a, 0x09, 0x01, 0x07, 0x00, 0x20, 0x00, 0x20, 0x01, 0x6a, 0x0b, // code: local.get 0; local.get 1; i32.add; end
]);

test('a Wasm module parses to sections, types, exports and code', () => {
  const m = readWasm(WASM_ADD);
  assert.equal(m.version, 1);
  assert.deepEqual(m.types[0], { params: ['i32', 'i32'], results: ['i32'] });
  assert.equal(m.functions.length, 1);
  assert.equal(m.exports[0].name, 'add');
  assert.equal(m.funcNames[0], 'add');
  assert.equal(m.code[0].ins.length, 4); // local.get, local.get, i32.add, end
});

test('the Wasm lift turns the stack machine back into an expression', () => {
  const m = readWasm(WASM_ADD);
  const pseudo = liftWasm(m.code[0].ins, m.funcNames);
  assert.match(pseudo, /return \(local0 \+ local1\);/);
});

test('the wasm command runs end to end and reports complete coverage', () => {
  const p = path.join(tmp, 'add.wasm');
  fs.writeFileSync(p, WASM_ADD);
  const r = run('wasm', p, '--pseudo', '--text');
  assert.equal(r.code, 0);
  assert.match(r.out, /func 0: add \(i32, i32\) -> i32/);
  assert.match(r.out, /return \(local0 \+ local1\);/);
  const j = run('wasm', p);
  assert.equal(j.json.coverage.status, 'complete');
  assert.equal(j.json.result.counts.functions, 1);
});

// A tiny contract: free-memory prologue, selector dispatch on 0x12345678, two jumpdests.
const EVM_HEX = '608060405260003560e01c806312345678146019575b005b602a6020526040516020f3';

test('EVM bytecode decodes, with PUSH carrying its immediate', () => {
  const r = readEvm(Buffer.from(EVM_HEX, 'latin1')); // a hex *text* file
  assert.equal(r.bytes, EVM_HEX.length / 2);
  assert.ok(r.instructions.some((i) => i.name === 'MSTORE'));
  assert.ok(r.instructions.some((i) => i.name === 'PUSH4' && i.value === '0x12345678'));
  assert.equal(r.jumpdests, 2);
  assert.equal(r.bad, 0);
});

test('EVM extracts the function selector from the dispatcher', () => {
  const r = readEvm(Buffer.from(EVM_HEX, 'latin1'));
  assert.equal(r.selectors.length, 1);
  assert.equal(r.selectors[0].selector, '0x12345678');
});

test('EVM lift resolves a constant jump and reads a selector extraction', () => {
  const ins = evmDecode(Buffer.from(EVM_HEX, 'hex'));
  const p = liftEvm(ins).map((e) => e.text).join('\n');
  assert.match(p, /calldata\[0x00\] >> 0xe0/); // top 4 bytes of calldata = the selector
  assert.match(p, /goto L_19/);
  assert.match(p, /storage|mem\[0x20\] = 0x2a/);
});

test('the evm command runs end to end', () => {
  const p = path.join(tmp, 'c.evm');
  fs.writeFileSync(p, EVM_HEX);
  const r = run('evm', p, '--pseudo', '--text');
  assert.equal(r.code, 0);
  assert.match(r.out, /function selectors \(1\)/);
  assert.match(r.out, /0x12345678/);
  assert.equal(run('evm', p).json.coverage.status, 'complete');
});

// Build a minimal classic pcap by hand: Ethernet / IPv4 / TCP packets.
function makePcap() {
  const pkt = (src, dst, sp, dp) => {
    const eth = Buffer.from([0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 1, 0x08, 0x00]);
    const ip = Buffer.alloc(20); ip[0] = 0x45; ip[9] = 6;
    src.split('.').forEach((x, i) => { ip[12 + i] = +x; }); dst.split('.').forEach((x, i) => { ip[16 + i] = +x; });
    const tcp = Buffer.alloc(20); tcp.writeUInt16BE(sp, 0); tcp.writeUInt16BE(dp, 2);
    return Buffer.concat([eth, ip, tcp]);
  };
  const rec = (frame) => { const h = Buffer.alloc(16); h.writeUInt32LE(frame.length, 8); h.writeUInt32LE(frame.length, 12); return Buffer.concat([h, frame]); };
  const gh = Buffer.alloc(24); gh.writeUInt32LE(0xa1b2c3d4, 0); gh.writeUInt16LE(2, 4); gh.writeUInt16LE(4, 6); gh.writeUInt32LE(65535, 16); gh.writeUInt32LE(1, 20);
  return Buffer.concat([gh, rec(pkt('10.0.0.1', '10.0.0.2', 12345, 80)), rec(pkt('10.0.0.1', '10.0.0.2', 12345, 80)), rec(pkt('10.0.0.2', '10.0.0.1', 80, 12345))]);
}

test('a classic pcap decodes Ethernet/IPv4/TCP and summarises conversations', () => {
  const cap = readPcap(makePcap());
  assert.equal(cap.format, 'pcap');
  assert.equal(cap.linktype, 'ethernet');
  assert.equal(cap.packets.length, 3);
  assert.equal(cap.packets[0].src, '10.0.0.1');
  assert.equal(cap.packets[0].dport, 80);
  const sum = summarisePcap(cap);
  assert.equal(sum.protocols.tcp, 3);
  assert.equal(sum.conversations[0].flow, '10.0.0.1:12345 -> 10.0.0.2:80 (tcp, http)');
  assert.equal(sum.conversations[0].packets, 2);
});

test('the pcap command runs end to end and detect routes to it', () => {
  const p = path.join(tmp, 'cap.pcap');
  fs.writeFileSync(p, makePcap());
  const r = run('pcap', p, '--text');
  assert.equal(r.code, 0);
  assert.match(r.out, /tcp 3/);
  assert.match(r.out, /10\.0\.0\.1:12345 -> 10\.0\.0\.2:80/);
  assert.equal(run('detect', p).json.result.format, 'pcap');
});

test('frame recovery names ARM64 sp-relative slots too', () => {
  const body = ['void func() {', '  x8 = *(sp + 0x10);', '  *(sp + 0x8) = x0;', '}'].join('\n');
  const { body: out, locals } = recoverFrame(body);
  assert.match(out, /x8 = local_10;/);
  assert.match(out, /local_8 = x0;/);
  assert.ok(locals.includes('local_10') && locals.includes('local_8'));
});

test('dead-store elimination drops an unused pure spill, keeps live and side-effecting ones', () => {
  const body = [
    'void func() {',
    '  rbx = (rsi + 2);',       // dead: rbx read nowhere -> removed
    '  rax = (rsi + 1);',       // live: read later as eax (canonical) -> kept
    '  rdx = alloc(rcx);',      // has a call: kept even though rdx is unused
    '  if (eax == 0) {',        // reads eax == rax
    '  }',
    '}',
  ].join('\n');
  const out = eliminateDeadStores(body);
  assert.ok(!/rbx = /.test(out), 'the dead store is removed');
  assert.ok(/rax = \(rsi \+ 1\);/.test(out), 'the value read later as eax is kept');
  assert.ok(/rdx = alloc\(rcx\);/.test(out), 'a store with a call side effect is kept');
});

test('struct layout inference groups field offsets off a base, sorted, 2+ only', () => {
  const body = [
    'void func() {',
    '  rax = rcx->field_50;',
    '  rcx->field_48 = rax;',
    '  if (rcx->field_48 == rdx->field_8) {}', // rdx has a single field -> not reported
    '}',
  ].join('\n');
  const lay = structLayouts(body);
  const rcx = lay.find((l) => l.base === 'rcx');
  assert.ok(rcx, 'rcx is reported');
  assert.deepEqual(rcx.fields, ['+0x48', '+0x50'], 'offsets sorted');
  assert.ok(!lay.some((l) => l.base === 'rdx'), 'a single-field base is not reported');
});

test('points-to merges accesses to one object across registers, and splits distinct args', () => {
  const cfg = { start: 0, blocks: [{ start: 0, insns: [
    { addr: 0, mnem: 'mov', text: 'mov rax, rcx' },        // rax = arg0 (rcx)
    { addr: 3, mnem: 'mov', text: 'mov rdx, [rcx+0x8]' },  // arg0.field_8  (via rcx)
    { addr: 6, mnem: 'mov', text: 'mov rsi, [rax+0x10]' }, // arg0.field_10 (via rax, same object)
    { addr: 9, mnem: 'mov', text: 'mov rbx, [r9+0x20]' },  // arg3.field_20 (a different object)
    { addr: 12, mnem: 'mov', text: 'mov rbp, [r9+0x28]' }, // arg3.field_28
    { addr: 15, mnem: 'ret', text: 'ret' },
  ], succ: [] }] };
  const pt = pointsTo(cfg);
  const a0 = pt.structs.find((s) => s.origin === 'arg0');
  const a3 = pt.structs.find((s) => s.origin === 'arg3');
  assert.ok(a0, 'arg0 struct exists');
  assert.deepEqual(a0.members.map((m) => m.field), ['field_8', 'field_10'], 'arg0 fields merged across rcx and rax');
  assert.ok(a3, 'arg3 is a separate object, not merged with arg0');
  assert.deepEqual(a3.members.map((m) => m.field), ['field_20', 'field_28']);
});

test('ARM64 points-to merges an object across registers and keeps arguments separate', () => {
  const cfg = { start: 0, blocks: [{ start: 0, insns: [
    { text: 'mov x9, x0', mnem: 'mov', addr: 0 },
    { text: 'ldr x10, [x0, 0x8]', mnem: 'ldr', addr: 4 },
    { text: 'ldr x11, [x9, 0x10]', mnem: 'ldr', addr: 8 }, // via x9 (= x0): same object
    { text: 'ldr x12, [x1, 0x0]', mnem: 'ldr', addr: 12 },
    { text: 'str x12, [x1, 0x8]', mnem: 'str', addr: 16 },
    { text: 'ret', mnem: 'ret', addr: 20 },
  ], succ: [] }] };
  const pt = pointsTo(cfg, 'arm64');
  const a0 = pt.structs.find((s) => s.origin === 'arg0');
  const a1 = pt.structs.find((s) => s.origin === 'arg1');
  assert.deepEqual(a0.members.map((m) => m.field), ['field_8', 'field_10'], 'arg0 merged across x0 and x9');
  assert.deepEqual(a1.members.map((m) => m.field), ['field_0', 'field_8'], 'arg1 is a separate object');
});

test('a field called indirectly is typed as a function pointer', () => {
  const cfg = { blocks: [{ start: 0, insns: [
    { mnem: 'mov', text: 'mov rax, [rcx+0x10]' },
    { mnem: 'call', text: 'call [rcx+0x10]' },   // indirect call through field 0x10
    { mnem: 'mov', text: 'mov rdx, [rcx+0x18]' },
  ] }] };
  const fp = fnPtrFields(cfg);
  assert.ok(fp.has('rcx|10'), 'the called field is detected');
  assert.ok(!fp.has('rcx|18'));
  const body = 'void func() {\n  rax = rcx->field_10;\n  rdx = rcx->field_18;\n}';
  const s = synthStructs(body, new Map(), fp);
  const rcx = s.find((x) => x.base === 'rcx');
  assert.equal(rcx.members.find((m) => m.field === 'field_10').fn, true);
  assert.equal(rcx.members.find((m) => m.field === 'field_18').fn, false);
});

test('array element type is recovered from the index scale and access width', () => {
  const cfg = { blocks: [{ start: 0, insns: [
    { text: 'mov rax, [r8+rcx*8]' },  // r8: 8-byte elements
    { text: 'mov edx, [r9+rsi*4]' },  // r9: 4-byte elements
  ] }] };
  const a = arrayElems(cfg);
  const r8 = a.find((x) => x.base === 'r8');
  const r9 = a.find((x) => x.base === 'r9');
  assert.equal(r8.elem, 'int64_t'); assert.equal(r8.scale, 8);
  assert.equal(r9.elem, 'int32_t'); assert.equal(r9.scale, 4);
});

test('field widths come from the access size and type the struct members', () => {
  const cfg = { blocks: [{ start: 0, insns: [
    { text: 'mov eax, [rcx+0x24]' },   // 32-bit access of field 0x24
    { text: 'mov rdx, [rcx+0x28]' },   // 64-bit access of field 0x28
    { text: 'movzx ecx, [rcx+0x24]' }, // another 32-bit of 0x24 (widest wins, stays 32)
  ] }] };
  const w = fieldWidths(cfg);
  assert.equal(w.get('rcx|24'), 32);
  assert.equal(w.get('rcx|28'), 64);
  const body = 'void func() {\n  rax = rcx->field_24;\n  rdx = rcx->field_28;\n}';
  const s = synthStructs(body, w);
  const rcx = s.find((x) => x.base === 'rcx');
  assert.equal(rcx.members.find((m) => m.field === 'field_24').type, 'int32_t');
  assert.equal(rcx.members.find((m) => m.field === 'field_28').type, 'int64_t');
});

test('struct synthesis types a dereferenced field as a pointer, a plain one as an integer', () => {
  const body = [
    'void func() {',
    '  rax = rcx->field_8->field_0;', // field_8 dereferenced -> pointer
    '  rbx = rcx->field_10;',          // plain -> integer
    '  rdx = (rcx->field_8)[rsi];',    // indexed -> pointer (reinforces)
    '}',
  ].join('\n');
  const s = synthStructs(body);
  const rcx = s.find((x) => x.base === 'rcx');
  assert.ok(rcx, 'a struct for rcx is synthesised');
  assert.equal(rcx.name, 'rcx_t');
  const f8 = rcx.members.find((m) => m.field === 'field_8');
  const f10 = rcx.members.find((m) => m.field === 'field_10');
  assert.equal(f8.type, 'void*', 'a dereferenced field is a pointer');
  assert.equal(f10.type, 'int64_t', 'a plain field is an integer');
});

test('frame recovery names stack slots and annotates the boilerplate', () => {
  const body = [
    '  *(rsp+0x50) = (*(rip+0x100) ^ (rsp - 0x58));',
    '  rsp = (rsp - 0x58);',
    '  *(rbp+0x10) = eax;',
    '  rax = *(rsp+0x50);',
    '  if ((*(rsp+0x50) ^ rsp) != *(rip+0x200)) {',
    '  rsp = (rsp + 0x58);',
  ].join('\n');
  const { body: out, locals } = recoverFrame(body);
  assert.match(out, /local_50 = \(\*\(rip\+0x100\) \^ \(rsp - 0x58\)\);  \/\/ stack canary: set/);
  assert.match(out, /rsp = \(rsp - 0x58\);  \/\/ frame set-up/);
  assert.match(out, /rsp = \(rsp \+ 0x58\);  \/\/ frame tear-down/);
  assert.match(out, /\^ rsp\) != \*\(rip\+0x200\)\) \{  \/\/ stack canary: check/);
  assert.ok(locals.includes('local_50'), 'local_50 recovered');
  assert.ok(locals.includes('arg_10'), 'rbp+ slot recovered as an argument');
  assert.ok(!/\*\(rsp\+0x50\)/.test(out), 'no raw stack ref left for the named slot');
});

test('instruction def/use is read for the common forms', () => {
  assert.deepEqual([...defsUses({ text: 'mov rbx, [rdx]' }).def], ['rbx']);
  assert.ok(defsUses({ text: 'mov rbx, [rdx]' }).use.has('rdx'));
  const add = defsUses({ text: 'add rax, rcx' }); // read-modify-write: rax both
  assert.ok(add.def.has('rax') && add.use.has('rax') && add.use.has('rcx'));
  const call = defsUses({ text: 'call 0x1000' });
  assert.ok(call.def.has('rax') && call.use.has('rcx'), 'a call defines rax and uses the arg regs');
});

test('liveness keeps a register read downstream and drops a dead one', () => {
  const cfg = { start: 0, blocks: [
    { start: 0, insns: [
      { addr: 0, len: 3, text: 'mov rbx, [rdx]', mnem: 'mov' },
      { addr: 3, len: 3, text: 'mov rdi, [rcx]', mnem: 'mov' }, // rdi never read again: dead
      { addr: 6, len: 2, text: 'jne 0xa', mnem: 'jne' },
    ], succ: [{ to: 10, cond: true }, { to: 8, fall: true }] },
    { start: 8, insns: [{ addr: 8, len: 1, text: 'ret', mnem: 'ret' }], succ: [] },
    { start: 10, insns: [
      { addr: 10, len: 3, text: 'mov rax, rbx', mnem: 'mov' }, // reads rbx
      { addr: 13, len: 1, text: 'ret', mnem: 'ret' },
    ], succ: [] },
  ] };
  const live = liveness(cfg);
  assert.ok(live.get(0).has('rbx'), 'rbx is live out of the entry (read in a successor)');
  assert.ok(!live.get(0).has('rdi'), 'rdi is dead and not live out');
  // alias expansion covers the sub-registers for the raw-name lookup
  const ali = withAliases(live.get(0));
  assert.ok(ali.has('ebx') && ali.has('bl'));
});

test('value forwarding carries a value along a linear chain, into a block that uses it', () => {
  const cfg = { start: 0, blocks: [
    { start: 0, insns: [{ addr: 0, len: 3, text: 'mov rbx, [rdx]', mnem: 'mov' }], succ: [{ to: 3, fall: true }] },
    { start: 3, insns: [{ addr: 3, len: 3, text: 'mov rax, rbx', mnem: 'mov' }, { addr: 6, len: 1, text: 'ret', mnem: 'ret' }], succ: [] },
  ] };
  const vf = valueFlow(cfg, (insns, ie) => liftX86Block(insns, null, null, ie));
  assert.equal(vf.inEnv.get(3).get('rbx').expr, '*rdx', 'rbx forwarded into the block that reads it');
  assert.ok(vf.noSpill.get(0).has('rbx'), 'the single consuming successor lets the def block skip the spill');
});

test('value forwarding does not cross a branch (no duplication, no phi)', () => {
  const cfg = { start: 0, blocks: [
    { start: 0, insns: [{ addr: 0, len: 3, text: 'mov rbx, [rdx]', mnem: 'mov' }, { addr: 3, len: 2, text: 'jne 0x9', mnem: 'jne' }], succ: [{ to: 9, cond: true }, { to: 5, fall: true }] },
    { start: 5, insns: [{ addr: 5, len: 3, text: 'mov rax, rbx', mnem: 'mov' }, { addr: 8, len: 1, text: 'ret', mnem: 'ret' }], succ: [] },
    { start: 9, insns: [{ addr: 9, len: 3, text: 'mov rax, rbx', mnem: 'mov' }, { addr: 12, len: 1, text: 'ret', mnem: 'ret' }], succ: [] },
  ] };
  const vf = valueFlow(cfg, (insns, ie) => liftX86Block(insns, null, null, ie));
  assert.equal(vf.inEnv.get(5).size, 0, 'a branch predecessor forwards nothing (would duplicate)');
  assert.equal(vf.inEnv.get(9).size, 0);
  assert.ok(!vf.noSpill.get(0).has('rbx'), 'the two-way block keeps its spill');
});

test.after(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* windows */ } });
