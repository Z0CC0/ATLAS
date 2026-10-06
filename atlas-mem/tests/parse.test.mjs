// Tests for the grammar layer: node --test tests/parse.test.mjs
// They need the optional parser (`npm install` in this folder). Without it they are skipped.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const tool = path.join(here, '..', 'tools', 'memcheck.mjs');
const m = await import(pathToFileURL(tool).href);
const p = await import(pathToFileURL(path.join(here, '..', 'tools', 'parse.mjs')).href);

const SAMPLES = {
  'a.js': ['function retry(n) {', '  return n + 1;', '}'],
  'a.ts': ['export async function retry(n: number): Promise<number> {', '  return n + 1;', '}'],
  'a.tsx': ['export const Retry = () => {', '  return <b>again</b>;', '};'],
  'a.py': ['@cached', 'def retry(n):', '    return n + 1'],
  'a.go': ['func retry(n int) int {', '\treturn n + 1', '}'],
  'a.rs': ['pub fn retry(n: u32) -> u32 {', '    n + 1', '}'],
  'a.java': ['class A {', '  int retry(int n) {', '    return n + 1;', '  }', '}'],
  'a.cs': ['class A {', '  public int Retry(int n) {', '    return n + 1;', '  }', '}'],
  'a.cpp': ['int Worker::retry(int n) {', '  return n + 1;', '}'],
  'a.rb': ['def retry(n)', '  n + 1', 'end'],
  'a.php': ['<?php', 'function retry($n) {', '  return $n + 1;', '}'],
  'a.sh': ['retry() {', '  echo again', '}'],
};
const EXPECT = {
  'a.js': ['retry', 1, 3], 'a.ts': ['retry', 1, 3], 'a.tsx': ['Retry', 1, 3], 'a.py': ['retry', 1, 3],
  'a.go': ['retry', 1, 3], 'a.rs': ['retry', 1, 3], 'a.java': ['retry', 2, 4], 'a.cs': ['Retry', 2, 4],
  'a.cpp': ['retry', 1, 3], 'a.rb': ['retry', 1, 3], 'a.php': ['retry', 2, 4], 'a.sh': ['retry', 1, 3],
};

await p.load([...Object.keys(SAMPLES), 'x.mjs']);
const have = p.ready('a.js');
const opts = { skip: have ? false : 'the optional parser is not installed' };

const defs = (file, lines, symbol) => m.parsedDefinitions(lines, symbol, file);

function setup(file, lines) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memparse-'));
  const repo = path.join(root, 'repo');
  const vault = path.join(root, 'vault');
  fs.mkdirSync(repo);
  fs.mkdirSync(vault);
  fs.writeFileSync(path.join(repo, file), lines.join('\n') + '\n');
  fs.writeFileSync(path.join(vault, 'a-note.md'), '---\nname: a-note\ndescription: a note\nmetadata:\n  type: project\n---\n\nA fact.\n');
  return { repo, vault, path: path.join(repo, file) };
}
const side = (vault) => JSON.parse(fs.readFileSync(path.join(vault, '.atlas', 'links.json'), 'utf8'));

for (const [file, lines] of Object.entries(SAMPLES)) {
  test(`a definition and its exact lines: ${file}`, opts, () => {
    const [name, first, last] = EXPECT[file];
    const found = defs(file, lines, name);
    assert.equal(found.length, 1);
    assert.deepEqual([found[0].first, found[0].last], [first, last]);
  });
}

test('a name in a call, a comment or a string is not a definition', opts, () => {
  const lines = ['// retry(n) {', 'const s = "function retry() {";', 'retry(3)', 'obj.retry(3)'];
  assert.deepEqual(defs('x.js', lines, 'retry'), []);
  assert.deepEqual(m.findDefinitions(lines, 'retry', 'x.js'), []);
});

test('definitions spread over several lines get their whole extent', opts, () => {
  const multi = ['export const retry =', '  async (n) => {', '    return n + 1;', '  };'];
  const found = defs('x.ts', multi, 'retry');
  assert.deepEqual([found[0].first, found[0].last], [1, 4]);

  const py = ['def retry(', '    n,', '    wait=2,', '):', '    return n'];
  assert.deepEqual([defs('x.py', py, 'retry')[0].first, defs('x.py', py, 'retry')[0].last], [1, 5]);
});

test('constants, methods and object members are definitions', opts, () => {
  assert.equal(defs('x.py', ['LIMIT = 5'], 'LIMIT').length, 1);
  assert.equal(defs('x.js', ['const LIMIT = 5;'], 'LIMIT').length, 1);
  assert.equal(defs('x.js', ['class A {', '  retry(n) { return n; }', '}'], 'retry').length, 1);
  assert.equal(defs('x.js', ['const api = {', '  retry: (n) => n,', '};'], 'retry').length, 1);
  assert.equal(defs('x.js', ['exports.retry = function (n) { return n; };'], 'retry').length, 1);
  assert.equal(defs('x.py', ['retry(wait=2)'], 'wait').length, 0, 'a keyword argument is not a definition');
});

test('one declaration of two names keeps two extents', opts, () => {
  const lines = ['const a = 1,', '  b = 2;'];
  assert.deepEqual([defs('x.js', lines, 'a')[0].first, defs('x.js', lines, 'a')[0].last], [1, 1]);
  assert.deepEqual([defs('x.js', lines, 'b')[0].first, defs('x.js', lines, 'b')[0].last], [2, 2]);
});

test('no grammar for the language: null, and the text search answers', opts, () => {
  const lines = ['function retry(n)', '  return n + 1', 'end'];
  assert.equal(defs('x.lua', lines, 'retry'), null);
  assert.deepEqual(m.findDefinitions(lines, 'retry', 'x.lua'), [1]);
});

test('a broken file in which the grammar finds nothing falls back to the text search', opts, () => {
  const lines = ['const x = (((', 'function retry(n) {', '  return n;'];
  const found = m.findDefinitions(lines, 'retry', 'x.js');
  assert.ok(found.length >= 1);
});

test('link without a range takes the lines from the grammar', opts, () => {
  const s = setup('a.ts', ['// header', ...SAMPLES['a.ts']]);
  const out = m.main(['link', s.vault, 'a-note', s.repo, 'a.ts', 'retry']);
  assert.match(out, /a\.ts:2-4 \(retry\)/);
  const link = side(s.vault).notes['a-note'].links[0];
  assert.equal(link.lines, '2-4');
  assert.equal(link.anchor, 0);
});

test('link without a range refuses a name defined twice, and an unknown name', opts, () => {
  const s = setup('a.js', ['function retry() {}', 'class A {', '  retry() {}', '}']);
  assert.throws(() => m.main(['link', s.vault, 'a-note', s.repo, 'a.js', 'retry']), /defined 2 times .*1, 3/);
  assert.throws(() => m.main(['link', s.vault, 'a-note', s.repo, 'a.js', 'nothing']), /nothing is not defined in a\.js/);
  assert.match(m.main(['link', s.vault, 'a-note', s.repo, 'a.js', '3', 'retry']), /a\.js:3 \(retry\)/);
});

test('link without a range and without a grammar asks for the range', opts, () => {
  const s = setup('a.lua', ['function retry(n)', 'end']);
  assert.throws(() => m.main(['link', s.vault, 'a-note', s.repo, 'a.lua', 'retry']), /cannot be parsed here .* give the range/);
});

test('check: a definition in an unusual shape that moved is "moved", not "gone"', opts, () => {
  const body = ['export const retry =', '  async (n) => {', '    return n + 1;', '  };'];
  const s = setup('a.ts', body);
  m.main(['link', s.vault, 'a-note', s.repo, 'a.ts', 'retry']);
  fs.writeFileSync(s.path, ['// one', '// two', ...body].join('\n') + '\n');
  const [r] = m.runCheck(s.vault);
  assert.equal(r.items[0].state, 'moved');
  assert.equal(r.verdict, 'firm');

  fs.writeFileSync(s.path, ['// one', '// two', ...body].join('\n').replace('n + 1', 'n + 2') + '\n');
  const [r2] = m.runCheck(s.vault);
  assert.equal(r2.items[0].state, 'changed');
  assert.equal(r2.verdict, 'suspect');
});

test('check: a call left behind after the definition is removed is "gone"', opts, () => {
  const s = setup('a.js', ['function retry(n) {', '  return n;', '}', 'retry(1)']);
  m.main(['link', s.vault, 'a-note', s.repo, 'a.js', 'retry']);
  fs.writeFileSync(s.path, 'retry(1)\n');
  assert.equal(m.runCheck(s.vault)[0].items[0].state, 'gone');
});

test('defs lists a file, one name, and says when there is no grammar', opts, () => {
  const s = setup('a.py', ['LIMIT = 5', '', ...SAMPLES['a.py']]);
  assert.match(m.main(['defs', s.repo, 'a.py']), /^1 +LIMIT {2}\(assignment\)\n3-5 +retry/);
  assert.equal(JSON.parse(m.main(['defs', s.repo, 'a.py', 'retry', '--json']))[0].first, 3);
  assert.throws(() => m.main(['defs', s.repo, 'missing.py']), /file not found/);
});

test('command line: the grammar is loaded before the command runs, and exit codes hold', opts, () => {
  const s = setup('a.ts', SAMPLES['a.ts']);
  const cli = (...a) => spawnSync(process.execPath, [tool, ...a], { encoding: 'utf8' });
  const ok = cli('link', s.vault, 'a-note', s.repo, 'a.ts', 'retry');
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /a\.ts:1-3/);
  assert.equal(cli('check', s.vault).status, 0);
  const bad = cli('link', s.vault, 'a-note', s.repo, 'a.ts', 'nothing');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /nothing is not defined/);
  assert.match(cli('defs', s.repo, 'a.ts').stdout, /1-3 +retry/);
});
