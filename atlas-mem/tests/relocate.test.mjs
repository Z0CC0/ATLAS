// Tests for slice 2: a symbol found again in another file, or under another name.
// node --test tests/relocate.test.mjs — needs the optional parser; skipped without it.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const m = await import(pathToFileURL(path.join(here, '..', 'tools', 'memcheck.mjs')).href);
const p = await import(pathToFileURL(path.join(here, '..', 'tools', 'parse.mjs')).href);

await p.load(['x.ts', 'x.py']);
const opts = { skip: p.ready('x.ts') ? false : 'the optional parser is not installed' };

const RETRY = ['export async function retry(n: number): Promise<number> {', '  if (n > 3) throw new Error("too many");', '  return n + 1;', '}'];
const OTHER = ['export function other() {', '  return 1;', '}'];

function setup({ git = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memreloc-'));
  const repo = path.join(root, 'repo');
  const vault = path.join(root, 'vault');
  fs.mkdirSync(path.join(repo, 'src', 'net'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'node_modules', 'dep'), { recursive: true });
  fs.mkdirSync(vault);
  const write = (rel, lines) => fs.writeFileSync(path.join(repo, rel), lines.join('\n') + '\n');
  write('src/a.ts', ['// a', ...RETRY, ...OTHER]);
  write('src/net/b.ts', OTHER);
  write('node_modules/dep/index.ts', RETRY);
  if (git) {
    const g = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], { stdio: 'ignore' });
    g('init', '-q'); g('add', '-A'); g('commit', '-q', '-m', 'init');
  }
  fs.writeFileSync(path.join(vault, 'retry-limit.md'), '---\nname: retry-limit\ndescription: a note\nmetadata:\n  type: project\n---\n\nretry gives up after three attempts.\n');
  m.main(['link', vault, 'retry-limit', repo, 'src/a.ts', 'retry']);
  return { repo, vault, write, rm: (rel) => fs.rmSync(path.join(repo, rel)) };
}
const side = (vault) => JSON.parse(fs.readFileSync(path.join(vault, '.atlas', 'links.json'), 'utf8'));
const first = (vault, write = false) => m.runCheck(vault, { write });

test('a link records a body fingerprint beside the full one', opts, () => {
  const s = setup();
  const link = side(s.vault).notes['retry-limit'].links[0];
  assert.match(link.body, /^sha256:[0-9a-f]{16}$/);
  assert.notEqual(link.body, link.fingerprint);
});

test('the same code in another file is "moved", and --write records the new file', opts, () => {
  const s = setup();
  s.write('src/a.ts', ['// a', ...OTHER]);
  s.write('src/net/b.ts', ['// moved here', ...OTHER, '', ...RETRY]);
  const [r] = first(s.vault);
  assert.equal(r.items[0].state, 'moved');
  assert.equal(r.items[0].file, 'src/net/b.ts');
  assert.equal(r.verdict, 'firm');
  first(s.vault, true);
  const link = side(s.vault).notes['retry-limit'].links[0];
  assert.equal(link.file, 'src/net/b.ts');
  assert.equal(link.lines, '6-9');
  assert.equal(first(s.vault)[0].items[0].state, 'held');
});

test('a deleted file whose code went to another file is "moved", not "missing"', opts, () => {
  const s = setup();
  s.rm('src/a.ts');
  s.write('src/net/b.ts', [...RETRY, ...OTHER]);
  const [r] = first(s.vault);
  assert.equal(r.items[0].state, 'moved');
  assert.equal(r.items[0].file, 'src/net/b.ts');
});

test('a deleted file whose code is nowhere else is "missing"', opts, () => {
  const s = setup();
  s.rm('src/a.ts');
  const [r] = first(s.vault);
  assert.equal(r.items[0].state, 'missing');
  assert.match(r.items[0].reason, /nowhere else/);
});

test('the same body under another name is "renamed" and makes the note suspect', opts, () => {
  const s = setup();
  s.write('src/a.ts', ['// a', ...RETRY.map((l) => l.replace('function retry(', 'function retryOnce(')), ...OTHER]);
  const [r] = first(s.vault);
  assert.equal(r.items[0].state, 'renamed');
  assert.equal(r.items[0].to, 'retryOnce');
  assert.equal(r.verdict, 'suspect');
  assert.match(r.items[0].reason, /retry seems renamed to retryOnce in src\/a\.ts:2-5/);
  // linking again under the new name is the way back to firm
  m.main(['link', s.vault, 'retry-limit', s.repo, 'src/a.ts', 'retryOnce']);
  m.main(['unlink', s.vault, 'retry-limit', 'retry']);
  assert.equal(first(s.vault)[0].verdict, 'firm');
});

test('renamed and moved to another file is still "renamed"', opts, () => {
  const s = setup();
  s.write('src/a.ts', ['// a', ...OTHER]);
  s.write('src/net/b.ts', [...OTHER, ...RETRY.map((l) => l.replace('function retry(', 'function retryOnce('))]);
  const [r] = first(s.vault);
  assert.equal(r.items[0].state, 'renamed');
  assert.equal(r.items[0].file, 'src/net/b.ts');
});

test('renamed with a changed body is "gone": nothing to pin it on', opts, () => {
  const s = setup();
  s.write('src/a.ts', ['// a', ...RETRY.map((l) => l.replace('function retry(', 'function retryOnce(').replace('n > 3', 'n > 5')), ...OTHER]);
  assert.equal(first(s.vault)[0].items[0].state, 'gone');
});

test('a link without a body fingerprint cannot see a rename', opts, () => {
  const s = setup();
  const data = side(s.vault);
  delete data.notes['retry-limit'].links[0].body;
  fs.writeFileSync(path.join(s.vault, '.atlas', 'links.json'), JSON.stringify(data));
  s.write('src/a.ts', ['// a', ...RETRY.map((l) => l.replace('function retry(', 'function retryOnce(')), ...OTHER]);
  assert.equal(first(s.vault)[0].items[0].state, 'gone');
});

test('check --write adds the body fingerprint to an older link whose code is held', opts, () => {
  const s = setup();
  const data = side(s.vault);
  const body = data.notes['retry-limit'].links[0].body;
  delete data.notes['retry-limit'].links[0].body;
  fs.writeFileSync(path.join(s.vault, '.atlas', 'links.json'), JSON.stringify(data));
  first(s.vault, true);
  assert.equal(side(s.vault).notes['retry-limit'].links[0].body, body);
});

test('node_modules is never searched, in git and outside it', opts, () => {
  for (const git of [true, false]) {
    const s = setup({ git });
    s.write('src/a.ts', ['// a', ...OTHER]);
    // the only other copy of retry is under node_modules
    const [r] = first(s.vault);
    assert.equal(r.items[0].state, 'gone', `git=${git}`);
  }
});

test('a definition that moved within its file still reads "moved", with the body kept', opts, () => {
  const s = setup();
  s.write('src/a.ts', ['// a', '// b', '// c', ...RETRY, ...OTHER]);
  const [r] = first(s.vault);
  assert.equal(r.items[0].state, 'moved');
  assert.equal(r.items[0].file, undefined);
});
