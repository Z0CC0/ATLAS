// organize.mjs: the mechanical part of a tidy-up. These cover the one guarantee a wrong
// plan must never break — nothing outside the source folder is touched — and the round
// trip of a plan that is inside it: dry run, apply, manifest, undo.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const tool = path.join(here, '..', 'tools', 'organize.mjs');

// The tool refuses to work under AppData, Windows or Program Files, and on Windows the
// temp folder is under AppData: the scenes then live beside this file and go at the end.
const FORBIDDEN = /[\\/](AppData|Windows|Program Files|ProgramData)[\\/]/;
const base = FORBIDDEN.test(path.resolve(os.tmpdir())) ? fs.mkdtempSync(path.join(here, 'tmp-organize-')) : os.tmpdir();
after(() => { if (base !== os.tmpdir()) fs.rmSync(base, { recursive: true, force: true }); });

function run(...args) {
  const r = spawnSync(process.execPath, [tool, ...args], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

function scene() {
  const root = fs.mkdtempSync(path.join(base, 'atlas-organize-'));
  const source = path.join(root, 'photos');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'a.jpg'), 'a');
  fs.writeFileSync(path.join(source, 'b.jpg'), 'b');
  fs.writeFileSync(path.join(root, 'outside.txt'), 'never touched');
  const plan = (actions) => {
    const p = path.join(root, 'plan.json');
    fs.writeFileSync(p, JSON.stringify({ source, criterion: 'test', actions }));
    return p;
  };
  return { root, source, plan };
}

test('a file path that escapes the source folder stops the run before anything moves', () => {
  const { root, source, plan } = scene();
  const p = plan([{ file: 'a.jpg', do: 'aside' }, { file: '../outside.txt', do: 'aside' }]);
  const r = run('--plan', p, '--apply');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /outside the source folder/);
  assert.ok(fs.existsSync(path.join(root, 'outside.txt')), 'the outside file is still there');
  assert.ok(fs.existsSync(path.join(source, 'a.jpg')), 'nothing from the plan moved');
  assert.ok(!fs.existsSync(path.join(source, '_set-aside')), 'no set-aside folder was created');
});

test('a destination that contains the source folder is refused', () => {
  const { root, plan } = scene();
  const p = plan([{ file: 'a.jpg', do: 'move', to: root }]);
  const r = run('--plan', p, '--apply');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /contains the source folder/);
});

test('a plan inside the source folder is applied, leaves a manifest, and the manifest undoes it', () => {
  const { root, source, plan } = scene();
  const chosen = path.join(root, 'chosen');
  // a relative destination is resolved against the source folder, not the working directory
  const p = plan([{ file: 'a.jpg', do: 'move', to: path.relative(source, chosen) }, { file: 'b.jpg', do: 'aside' }]);
  const dry = run('--plan', p);
  assert.equal(dry.code, 0, dry.out);
  assert.ok(fs.existsSync(path.join(source, 'a.jpg')), 'without --apply nothing moves');
  const r = run('--plan', p, '--apply');
  assert.equal(r.code, 0, r.out);
  assert.ok(fs.existsSync(path.join(chosen, 'a.jpg')), 'moved to the resolved destination');
  assert.ok(fs.existsSync(path.join(source, '_set-aside', 'b.jpg')));
  const manifest = fs.readdirSync(root).find((f) => f.startsWith('manifest-'));
  assert.ok(manifest, 'a manifest is written next to the plan');
  const u = run('--undo', path.join(root, manifest));
  assert.equal(u.code, 0, u.out);
  assert.ok(fs.existsSync(path.join(source, 'a.jpg')), 'undo puts the moved file back');
  assert.ok(fs.existsSync(path.join(source, 'b.jpg')), 'undo puts the set-aside file back');
});

test('two runs that move the same number of files keep two undos', () => {
  const { root, source, plan } = scene();
  const p1 = plan([{ file: 'a.jpg', do: 'aside' }]);
  assert.equal(run('--plan', p1, '--apply').code, 0);
  const p2 = plan([{ file: 'b.jpg', do: 'aside' }]);
  assert.equal(run('--plan', p2, '--apply').code, 0);
  const manifests = fs.readdirSync(root).filter((f) => f.startsWith('manifest-'));
  assert.equal(manifests.length, 2, manifests.join(', '));
  assert.ok(manifests.every((f) => /^manifest-\d{8}T\d{6}Z-1-files(-\d+)?\.json$/.test(f)), manifests.join(', '));
  for (const m of manifests) assert.equal(run('--undo', path.join(root, m)).code, 0);
  assert.ok(fs.existsSync(path.join(source, 'a.jpg')) && fs.existsSync(path.join(source, 'b.jpg')), 'both undone');
});
