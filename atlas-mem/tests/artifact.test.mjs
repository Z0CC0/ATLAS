// Tests for the artifact reader: node --test tests/artifact.test.mjs
// A tiny asar is built here from scratch (the header is sixteen bytes of sizes and a JSON
// tree), a SQLite file is written with node:sqlite, a source map by hand. Nothing external.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
  assert.deepEqual(res.ipc.wrappers, ['handle']);
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

test('every record has the same spine', () => {
  const asar = path.join(tmp, 'demo.asar');
  for (const rec of [run('detect', asar).json, run('app', asar).json]) {
    for (const k of ['id', 'tool', 'subject', 'operation', 'params', 'confidence', 'coverage', 'limitations', 'result']) assert.ok(k in rec, `${rec.operation} has ${k}`);
    assert.ok(['observed', 'derived', 'inferred'].includes(rec.confidence));
    assert.ok(['complete', 'partial', 'unknown'].includes(rec.coverage.status));
  }
});

test.after(() => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* windows */ } });
