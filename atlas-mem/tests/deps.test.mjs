// Tests for slice 3: what a linked symbol depends on, and the blast radius of a change.
// node --test tests/deps.test.mjs — needs the optional parser; skipped without it.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const m = await import(pathToFileURL(path.join(here, '..', 'tools', 'memcheck.mjs')).href);
const p = await import(pathToFileURL(path.join(here, '..', 'tools', 'parse.mjs')).href);

await p.load(['x.js', 'x.py']);
const opts = { skip: p.ready('x.js') ? false : 'the optional parser is not installed' };

const A = [
  'const LIMIT = 3;',
  'function wait(ms) {',
  '  return new Promise((r) => setTimeout(r, ms));',
  '}',
  'async function retry(fn) {',
  '  let n = 0;',
  '  while (n < LIMIT) {',
  '    try { return await fn(); } catch { n += 1; await wait(100 * n); }',
  '  }',
  '  throw new Error("too many");',
  '}',
];
const B = ['function parse(s) {', '  return JSON.parse(s);', '}'];

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memdeps-'));
  const repo = path.join(root, 'repo');
  const vault = path.join(root, 'vault');
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.mkdirSync(vault);
  const write = (rel, lines) => fs.writeFileSync(path.join(repo, rel), lines.join('\n') + '\n');
  write('src/a.js', A);
  write('src/b.js', B);
  fs.writeFileSync(path.join(vault, 'retry-limit.md'), '---\nname: retry-limit\ndescription: a note\nmetadata:\n  type: project\n---\n\nretry gives up after three attempts.\n');
  return { repo, vault, write, link: () => m.main(['link', vault, 'retry-limit', repo, 'src/a.js', 'retry']) };
}
const side = (vault) => JSON.parse(fs.readFileSync(path.join(vault, '.atlas', 'links.json'), 'utf8'));
const check = (vault, write = false) => m.runCheck(vault, { write });

test('a link records what the code depends on: names defined in the repository, not locals or globals', opts, () => {
  const s = setup();
  const out = s.link();
  assert.match(out, /depends on 2: LIMIT, wait/);
  const deps = side(s.vault).notes['retry-limit'].links[0].deps;
  assert.deepEqual(deps.map((d) => d.symbol), ['LIMIT', 'wait']);
  assert.equal(deps[0].lines, '1');
  assert.equal(deps[1].lines, '2-4');
  assert.match(deps[1].fingerprint, /^sha256d:/);
  // n, fn, Error, Promise, setTimeout: locals or not defined in the repository
  assert.ok(!deps.some((d) => ['n', 'fn', 'Error', 'Promise', 'setTimeout'].includes(d.symbol)));
});

test('a dependency that changed makes the link "dep-changed" and the note suspect', opts, () => {
  const s = setup();
  s.link();
  s.write('src/a.js', A.map((l) => l.replace('LIMIT = 3', 'LIMIT = 5')));
  const [r] = check(s.vault);
  assert.equal(r.items[0].state, 'dep-changed');
  assert.equal(r.verdict, 'suspect');
  assert.match(r.items[0].reason, /retry in src\/a\.js is intact, but LIMIT \(src\/a\.js:1\), which it depends on, changed/);
});

test('a dependency that only moved is fine, and --write records where it went', opts, () => {
  const s = setup();
  s.link();
  s.write('src/a.js', ['// top', '// comment', ...A.slice(0, 4), '', ...A.slice(4)]);
  const [r] = check(s.vault);
  assert.equal(r.items[0].state, 'moved');
  assert.equal(r.verdict, 'firm');
  check(s.vault, true);
  const deps = side(s.vault).notes['retry-limit'].links[0].deps;
  assert.equal(deps[0].lines, '3');
  assert.equal(deps[1].lines, '4-6');
  assert.equal(check(s.vault)[0].items[0].state, 'held');
});

test('a dependency that is gone makes the note suspect; the link itself is intact', opts, () => {
  const s = setup();
  s.link();
  s.write('src/a.js', A.filter((l) => !l.startsWith('const LIMIT')));
  const [r] = check(s.vault);
  assert.equal(r.items[0].state, 'dep-changed');
  assert.match(r.items[0].reason, /LIMIT .* is gone/);
});

test('a dependency across files is followed; a dependency defined in two files is not recorded', opts, () => {
  const s = setup();
  s.write('src/a.js', ['const { parse } = require("./b");', ...A.slice(0, 4), 'async function retry(fn) {', '  return parse(await fn());', '}']);
  s.link();
  // a destructured require is not a definition: the dependency is the function in b.js
  const deps = side(s.vault).notes['retry-limit'].links[0].deps;
  assert.deepEqual(deps.map((d) => `${d.symbol}@${d.file}`), ['parse@src/b.js']);
  s.write('src/b.js', B.map((l) => l.replace('JSON.parse(s)', 'JSON.parse(s.trim())')));
  assert.equal(check(s.vault)[0].items[0].state, 'dep-changed');
  // the same name defined in a second file: ambiguous, not recorded
  s.write('src/c.js', B);
  s.link();
  assert.equal(side(s.vault).notes['retry-limit'].links[0].deps, undefined);
});

test('relinking after a dependency change clears the note', opts, () => {
  const s = setup();
  s.link();
  s.write('src/a.js', A.map((l) => l.replace('LIMIT = 3', 'LIMIT = 5')));
  assert.equal(check(s.vault)[0].verdict, 'suspect');
  s.link();
  assert.equal(check(s.vault)[0].verdict, 'firm');
});

test('check --write adds dependencies to an older link whose code is held', opts, () => {
  const s = setup();
  s.link();
  const data = side(s.vault);
  delete data.notes['retry-limit'].links[0].deps;
  fs.writeFileSync(path.join(s.vault, '.atlas', 'links.json'), JSON.stringify(data));
  check(s.vault, true);
  assert.equal(side(s.vault).notes['retry-limit'].links[0].deps.length, 2);
});

test('check --write records which notes touch the same code', opts, () => {
  const s = setup();
  s.link();
  fs.writeFileSync(path.join(s.vault, 'wait-note.md'), '---\nname: wait-note\ndescription: a note\nmetadata:\n  type: project\n---\n\nwait sleeps.\n');
  fs.writeFileSync(path.join(s.vault, 'far-note.md'), '---\nname: far-note\ndescription: a note\nmetadata:\n  type: project\n---\n\nelsewhere.\n');
  m.main(['link', s.vault, 'wait-note', s.repo, 'src/a.js', 'wait']);
  m.main(['link', s.vault, 'far-note', s.repo, 'src/b.js', 'parse']);
  check(s.vault, true);
  const notes = side(s.vault).notes;
  assert.deepEqual(notes['retry-limit'].related, [{ slug: 'wait-note', via: 'dependency', symbol: 'wait', file: 'src/a.js' }], 'retry depends on wait, which wait-note describes');
  assert.deepEqual(notes['wait-note'].related.map((r) => r.slug + ':' + r.via), ['retry-limit:dependency']);
  assert.deepEqual(notes['far-note'].related, [], 'another file: nothing in common');
});

test('impact: the notes a change to a file or a symbol would touch', opts, () => {
  const s = setup();
  s.link();
  const out = m.main(['impact', s.vault, s.repo, 'src/a.js', 'LIMIT']);
  assert.match(out, /retry-limit {2}retry depends on LIMIT \(src\/a\.js:1\) · firm/);
  assert.match(m.main(['impact', s.vault, s.repo, 'src/a.js', 'retry']), /linked to retry/);
  assert.match(m.main(['impact', s.vault, s.repo, 'src/b.js']), /^no note is linked to or depends on src\/b\.js$/);
  assert.equal(JSON.parse(m.main(['impact', s.vault, s.repo, 'src/a.js', '--json'])).length, 3);
});

test('locals of other functions and parameters are never dependencies', opts, () => {
  const s = setup();
  s.write('src/a.js', ['function other(list) {', '  const i = 0;', '  const text = "";', '  return list[i] + text;', '}', 'function retry(text, cb) {', '  return [text].map((v, i) => cb(v, i));', '}']);
  s.link();
  assert.equal(side(s.vault).notes['retry-limit'].links[0].deps, undefined);
});

test('loop variables, destructured names and catch parameters are local', opts, () => {
  const s = setup();
  s.write('src/z.js', ['const u = 1, e = 2, k = 3, v = 4, parts = 5;']);
  s.write('src/a.js', ['function retry(list) {', '  const { k, v } = list[0];', '  const [parts] = list;', '  for (const u of list) { try { u(); } catch (e) { return e; } }', '  return k + v + parts;', '}']);
  s.link();
  assert.equal(side(s.vault).notes['retry-limit'].links[0].deps, undefined);
});

test('python: a module constant used by a function is a dependency', opts, () => {
  const s = setup();
  s.write('src/q.py', ['RISK = 0.01', '', 'def size(capital):', '    return capital * RISK']);
  fs.writeFileSync(path.join(s.vault, 'sizing.md'), '---\nname: sizing\ndescription: a note\nmetadata:\n  type: project\n---\n\nA fact.\n');
  const out = m.main(['link', s.vault, 'sizing', s.repo, 'src/q.py', 'size']);
  assert.match(out, /depends on 1: RISK/);
  s.write('src/q.py', ['RISK = 0.01', 'row = 9', '', 'def size(capital):', '    for row in range(3):', '        pass', '    a, b = 1, 2', '    return capital * RISK + a + b']);
  assert.match(m.main(['link', s.vault, 'sizing', s.repo, 'src/q.py', 'size']), /depends on 1: RISK/);
});
