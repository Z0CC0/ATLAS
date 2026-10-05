// Run with: node --test tests/catalog.test.mjs
// Offline: nothing here touches the network. The sources themselves are tried by hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const tool = path.join(here, '..', 'tools', 'catalog.mjs');
const { parseCsv, matcher, clip, num, SOURCES } = await import(pathToFileURL(tool).href);

test('importing the tool starts no search', () => {
  // Reaching this line is the test: the import above returned without a network call
  // and without exiting on missing arguments.
  assert.equal(typeof parseCsv, 'function');
});

test('parseCsv reads quoted fields, doubled quotes and newlines inside quotes', () => {
  const rows = parseCsv('a,b,c\r\n1,"two, with comma","say ""hi"""\n4,"line\nbreak",6\n');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['1', 'two, with comma', 'say "hi"'], ['4', 'line\nbreak', '6']]);
});

test('parseCsv keeps a last row that has no newline', () => {
  assert.deepEqual(parseCsv('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
});

test('matcher needs every word, in any case and any order', () => {
  const hit = matcher('Code review');
  assert.ok(hit('Automated REVIEW of your code'));
  assert.ok(!hit('code formatting'));
  assert.ok(matcher('  postgres ')('PostgreSQL toolkit'));
});

test('clip flattens whitespace and shortens with an ellipsis', () => {
  assert.equal(clip('a\n\n  b'), 'a b');
  assert.equal(clip('x'.repeat(200), 10).length, 10);
  assert.equal(clip(null), '');
});

test('num shortens counts the way the indexes print them', () => {
  assert.equal(num(950), '950');
  assert.equal(num(12400), '12.4K');
  assert.equal(num(1100000), '1.1M');
});

test('every kind has at least one source with a name, a note and a search', () => {
  assert.deepEqual(Object.keys(SOURCES), ['skills', 'mcp', 'plugins', 'extras']);
  for (const list of Object.values(SOURCES)) {
    assert.ok(list.length >= 1);
    for (const s of list) {
      assert.equal(typeof s.name, 'string');
      assert.equal(typeof s.note, 'string');
      assert.equal(typeof s.search, 'function');
    }
  }
});

test('no source installs anything: the tool has no write, spawn or install call', async () => {
  const { readFileSync } = await import('node:fs');
  const text = readFileSync(tool, 'utf8');
  for (const banned of ['child_process', 'writeFile', 'appendFile', 'skills add', 'execSync', 'spawn(']) {
    assert.ok(!text.includes(banned), `found ${banned}`);
  }
});

test('missing or unknown arguments print the usage and exit 2', () => {
  for (const args of [[], ['skills'], ['nonsense', 'x']]) {
    const r = spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8' });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /usage: node catalog\.mjs/);
    assert.equal(r.stdout, '');
  }
});
