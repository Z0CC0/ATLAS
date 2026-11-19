// Run with: node --test tests/catalog.test.mjs
// Offline: nothing here touches the network. The sources themselves are tried by hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const tool = path.join(here, '..', 'tools', 'catalog.mjs');
const { parseCsv, matcher, clip, num, SOURCES, assetLine, ASSET_KINDS, byOwner, parseArgs } = await import(pathToFileURL(tool).href);

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
  assert.deepEqual(Object.keys(SOURCES), ['skills', 'mcp', 'plugins', 'extras', 'ui', 'images', 'audio']);
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

test('ui registries: three sources, name-only matching, licence in the note', () => {
  assert.equal(SOURCES.ui.length, 3);
  for (const s of SOURCES.ui) assert.match(s.note, /MIT/);
  assert.deepEqual(SOURCES.ui.map((s) => s.name), ['shadcn/ui', 'Magic UI', 'Aceternity UI']);
});

test('a picture line carries the licence, the file, the page, and the credit a CC BY work needs', () => {
  const by = assetLine({ title: 'Lighthouse', creator: 'K. Moore', license: 'by', license_version: '2.0', width: 664, height: 1000, url: 'https://x/a.jpg', foreign_landing_url: 'https://flickr/p/1', attribution: '"Lighthouse" by K. Moore is licensed under CC BY 2.0.' }, 'images');
  assert.equal(by, 'Lighthouse | K. Moore | CC BY 2.0 | 664x1000 | https://x/a.jpg | page https://flickr/p/1 | credit: "Lighthouse" by K. Moore is licensed under CC BY 2.0.');
  const free = assetLine({ title: 'Sea', creator: '', license: 'cc0', license_version: '1.0', url: 'https://x/b.jpg', foreign_landing_url: 'https://w/2' }, 'images');
  assert.equal(free, 'Sea | unknown author | CC0 | https://x/b.jpg | page https://w/2');
  assert.ok(!free.includes('credit:'));
});

test('a sound line gives its length in seconds', () => {
  const line = assetLine({ title: 'Whoosh', creator: 'fx', license: 'pdm', duration: 1234, url: 'https://x/w.mp3', foreign_landing_url: 'https://f/3' }, 'audio');
  assert.equal(line, 'Whoosh | fx | public domain | 1.2 s | https://x/w.mp3 | page https://f/3');
});

test('pictures and sounds are kinds of their own, asked only for open licences, and not part of `all`', () => {
  assert.deepEqual(ASSET_KINDS, ['images', 'audio']);
  for (const k of ASSET_KINDS) {
    assert.equal(SOURCES[k].length, 1);
    assert.match(SOURCES[k][0].note, /CC0, public domain and CC BY only/);
    assert.match(String(SOURCES[k][0].search), /license=\$\{OPEN_LICENCES\}/);
  }
  const usage = spawnSync(process.execPath, [tool], { encoding: 'utf8' });
  assert.match(usage.stderr, /images\|audio/);
});

test('byOwner keeps one publisher, by the first segment of the source, in any case', () => {
  const list = [{ source: 'anthropics/skills', name: 'pdf' }, { source: 'someone/anthropics-copy', name: 'pdf' }, { source: 'Anthropics/knowledge', name: 'view-pdf' }];
  assert.deepEqual(byOwner(list, 'anthropics').map((s) => s.name), ['pdf', 'view-pdf']);
  assert.equal(byOwner(list, '').length, 3);
  assert.deepEqual(byOwner([{ name: 'no source' }], 'anthropics'), []);
});

test('--owner is read anywhere in the arguments and only for skills', () => {
  assert.deepEqual(parseArgs(['skills', 'pdf', '--owner', 'anthropics']), { kind: 'skills', query: 'pdf', owner: 'anthropics' });
  assert.deepEqual(parseArgs(['skills', '--owner', 'anthropics', 'pdf', 'forms']), { kind: 'skills', query: 'pdf forms', owner: 'anthropics' });
  assert.deepEqual(parseArgs(['mcp', 'postgres']), { kind: 'mcp', query: 'postgres', owner: '' });
  assert.equal(parseArgs(['skills', 'pdf', '--owner']), null);
  assert.equal(parseArgs(['skills', 'pdf', '--owner', '--x']), null);
  assert.equal(parseArgs(['mcp', 'postgres', '--owner', 'acme']), null);
  assert.equal(parseArgs(['skills', '--owner', 'anthropics']), null);
});

test('an owner with no value prints the usage and exits 2', () => {
  const r = spawnSync(process.execPath, [tool, 'skills', 'pdf', '--owner'], { encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--owner <publisher>/);
});

test('the skills search asks for more results when a publisher is named, then keeps eight', async () => {
  const real = globalThis.fetch;
  const asked = [];
  const skills = Array.from({ length: 30 }, (_, i) => ({ source: i % 2 ? 'acme/skills' : 'other/skills', name: 's' + i, installs: 1, id: 'x/' + i }));
  globalThis.fetch = async (url) => { asked.push(String(url)); return { ok: true, json: async () => ({ skills }) }; };
  try {
    const lines = await SOURCES.skills[0].search('pdf', { owner: 'acme' });
    assert.match(asked[0], /limit=100/);
    assert.equal(lines.length, 8);
    assert.ok(lines.every((l) => l.startsWith('acme/skills@')));
    await SOURCES.skills[0].search('pdf');
    assert.match(asked[1], /limit=8(&|$)/);
  } finally {
    globalThis.fetch = real;
  }
});
