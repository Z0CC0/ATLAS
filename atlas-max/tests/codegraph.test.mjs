// Tests for the code graph: node --test tests/codegraph.test.mjs — needs the parser.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const cg = await import(pathToFileURL(path.join(here, '..', 'tools', 'codegraph.mjs')).href);
const p = await import(pathToFileURL(path.join(here, '..', 'tools', 'parse.mjs')).href);
await p.load(['x.js', 'x.py']);
const opts = { skip: p.ready('x.js') ? false : 'the optional parser is not installed' };

const RETRY = [
  'export function retry(fn, limit) {',
  '  let n = 0;',
  '  while (n < limit) {',
  '    try { return fn(); } catch (e) { n += 1; }',
  '  }',
  '  throw new Error("too many attempts");',
  '}',
];
const RETRY_RENAMED = RETRY.map((l) => l.replace(/retry/g, 'again').replace(/\bfn\b/g, 'job').replace(/\blimit\b/g, 'max').replace(/\bn\b/g, 'k').replace('too many attempts', 'enough'));

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codegraph-'));
  const w = (rel, lines) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), lines.join('\n') + '\n'); };
  // project A: a util used by main, a dead helper, a dynamic file
  w('alpha/src/util.js', [...RETRY, '', 'export function unused() {', '  return 1 + 1 + 1 + 1 + 1 + 1;', '}']);
  w('alpha/src/main.js', ["import { retry } from './util.js';", 'const run = () => retry(() => 1, 3);', 'run();']);
  w('alpha/src/ipc.js', ["ipcMain.handle('do', () => 1);", 'function handler() {', '  return 2;', '}']);
  // project B: the same retry, identical; and a renamed copy
  w('beta/lib/net.js', [...RETRY, '', ...RETRY_RENAMED]);
  // project C: a python module importing a sibling
  w('gamma/engine/api.py', ['from engine.core import run', 'def serve():', '    return run()']);
  w('gamma/engine/core.py', ['def run():', '    return 1']);
  // noise that must be skipped
  w('alpha/node_modules/dep/index.js', RETRY);
  w('alpha/dist/bundle.min.js', RETRY);
  w('.hidden/x.js', RETRY);
  return root;
}

test('scan: projects, files, symbols, imports and calls', opts, async () => {
  const g = await cg.scan(setup());
  assert.deepEqual(g.projects.map((x) => x.name), ['alpha', 'beta', 'gamma']);
  assert.ok(!g.files.some((f) => /node_modules|dist|\.hidden/.test(f.project + '/' + f.path)), 'generated folders are skipped');
  const util = g.files.find((f) => f.path === 'src/util.js');
  const main = g.files.find((f) => f.path === 'src/main.js');
  assert.ok(g.imports.some((e) => e.from === main.id && e.to === util.id), 'relative import resolved to the file');
  const retry = g.symbols.find((s) => s.name === 'retry' && s.project === 'alpha');
  const run = g.symbols.find((s) => s.name === 'run' && s.project === 'alpha');
  assert.ok(g.calls.some((e) => e.from === run.id && e.to === retry.id), 'run calls retry');
  assert.equal(retry.in, 1);
  assert.equal(retry.exported, true);
  const api = g.files.find((f) => f.path === 'engine/api.py');
  const core = g.files.find((f) => f.path === 'engine/core.py');
  assert.ok(g.imports.some((e) => e.from === api.id && e.to === core.id), 'python import resolved');
});

test('duplicates: identical across projects, same shape under other names, nothing tiny', opts, async () => {
  const g = await cg.scan(setup());
  const sym = (name, project) => g.symbols.find((s) => s.name === name && s.project === project);
  const ident = g.dups.filter((d) => d.kind === 'identical');
  assert.ok(ident.some((d) => [d.a, d.b].includes(sym('retry', 'alpha').id) && [d.a, d.b].includes(sym('retry', 'beta').id)), 'retry is identical in alpha and beta');
  const shape = g.dups.filter((d) => d.kind === 'shape');
  assert.ok(shape.some((d) => [d.a, d.b].includes(sym('again', 'beta').id)), 'the renamed copy has the same shape');
  assert.ok(!g.dups.some((d) => [d.a, d.b].includes(sym('unused', 'alpha').id)), 'a short function is not compared');
  const e = g.projectEdges.find((x) => x.a === 'alpha' && x.b === 'beta');
  assert.ok(e && e.identical >= 1);
});

test('a declared porting pair is marked and not counted', opts, async () => {
  const g = await cg.scan(setup(), { porting: [['alpha', 'beta']] });
  assert.ok(g.dups.filter((d) => d.cross).every((d) => d.porting));
  assert.match(cg.report(g), /in declared portings \(not counted\)/);
  assert.equal(cg.dupsReport(g, { cross: true }), 'no duplicates');
});

test('uncalled symbols are graded, never removed', opts, async () => {
  const g = await cg.scan(setup());
  const grade = (name) => { const s = g.symbols.find((x) => x.name === name && x.project === 'alpha'); const d = g.dead.find((x) => x.symbol === s.id); return d ? d.grade : null; };
  assert.equal(grade('retry'), null, 'called: not a candidate');
  assert.equal(grade('unused'), 'probable', 'exported but uncalled: probable, another project may use it');
  assert.equal(grade('handler'), 'probable', 'uncalled in a file with IPC by string: probable');
  assert.match(cg.deadReport(g, 'alpha'), /labels|probable/);
  for (const f of ['src/util.js', 'src/main.js']) assert.ok(fs.existsSync(path.join(g.root, 'alpha', f)), 'no source file touched');
});

test('inherits edges and the blast radius', opts, async () => {
  const root = setup();
  const w = (rel, lines) => fs.writeFileSync(path.join(root, rel), lines.join('\n') + '\n');
  w('alpha/src/shapes.js', ['export class Shape {', '  area() { return 0; }', '}', 'export class Circle extends Shape {', '  area() { return 3; }', '}', 'export function draw(s) {', '  return s.area();', '}', 'export function paint(x) {', '  return draw(x);', '}', 'export function show(x) {', '  return paint(x);', '}']);
  w('alpha/src/py.py', ['class Base:', '    pass', 'class Child(Base):', '    pass']);
  const g = await cg.scan(root);
  const sym = (n) => g.symbols.find((s) => s.name === n && s.project === 'alpha');
  assert.ok(g.inherits.some((e) => e.from === sym('Circle').id && e.to === sym('Shape').id), 'Circle extends Shape');
  assert.ok(g.inherits.some((e) => e.from === sym('Child').id && e.to === sym('Base').id), 'python bases');
  assert.deepEqual(sym('Child').bases, ['Base']);
  const rings = cg.impact(g, sym('draw').id, 3);
  assert.deepEqual(rings.map((r) => r.map((id) => g.symbols[id].name)), [['paint'], ['show']]);
  assert.match(cg.impactReport(g, 'alpha', 'draw'), /1 step away: 1\n {2}paint/);
  assert.match(cg.impactReport(g, 'alpha', 'nothing'), /not a top-level symbol/);
});

test('report and the saved file round-trip', opts, async () => {
  const root = setup();
  const out = path.join(root, 'graph.json');
  const text = await cg.main(['scan', root, '--out', out, '--quiet', '--skip', 'gamma']);
  assert.match(text, /scanned {3}2 projects/);
  const g = cg.loadGraph(out);
  assert.equal(g.projects.length, 2);
  assert.match(cg.report(g), /duplicates/);
  assert.match(cg.hubs(g, 'alpha'), /retry/);
});

test('resolveImport: relative modules, index files, python packages, libraries', () => {
  const files = ['src/a.js', 'src/b/index.ts', 'pkg/__init__.py', 'pkg/mod.py', 'top.py'];
  assert.equal(cg.resolveImport('./b', 'src/a.js', files, 'javascript'), 'src/b/index.ts');
  assert.equal(cg.resolveImport('../a', 'src/b/index.ts', files, 'typescript'), 'src/a.js');
  assert.equal(cg.resolveImport('react', 'src/a.js', files, 'javascript'), null);
  assert.equal(cg.resolveImport('pkg.mod', 'top.py', files, 'python'), 'pkg/mod.py');
  assert.equal(cg.resolveImport('pkg', 'top.py', files, 'python'), 'pkg/__init__.py');
  assert.equal(cg.resolveImport('.mod', 'pkg/__init__.py', files, 'python'), 'pkg/mod.py');
  assert.equal(cg.resolveImport('numpy', 'top.py', files, 'python'), null);
});
