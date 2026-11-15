// The compression-only switch of atlas-min: build.mjs sets COMPRESSION_ONLY to true in that
// build's atlas-config.js. Here the same line is flipped in a copy of the hooks, and the copy is
// run the way Claude Code runs it, so what the minimal build does is tested in every build.
// node --test tests/min.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const hooks = path.join(here, '..', 'hooks');

function minHooks() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-min-hooks-'));
  for (const f of ['atlas-config.js', 'atlas-tracker.js']) fs.copyFileSync(path.join(hooks, f), path.join(dir, f));
  const cfg = path.join(dir, 'atlas-config.js');
  const text = fs.readFileSync(cfg, 'utf8');
  assert.equal(text.split('const COMPRESSION_ONLY = false;').length, 2, 'the line build.mjs rewrites is there once');
  fs.writeFileSync(cfg, text.replace('const COMPRESSION_ONLY = false;', 'const COMPRESSION_ONLY = true;'));
  return dir;
}

const conf = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-min-conf-'));
const project = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-min-proj-'));
fs.mkdirSync(path.join(project, '.git'));
const env = { ...process.env, CLAUDE_CONFIG_DIR: conf };
delete env.ATLAS_MODE;

function say(dir, prompt) {
  const r = spawnSync(process.execPath, [path.join(dir, 'atlas-tracker.js')], { input: JSON.stringify({ prompt, cwd: project }), encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : '';
}

function stateFile() {
  const d = path.join(conf, 'atlas-state');
  const f = fs.existsSync(d) ? fs.readdirSync(d).find((x) => x.endsWith('.state')) : null;
  return f ? fs.readFileSync(path.join(d, f), 'utf8') : null;
}

test('in the minimal build ask, check and silent are not dials, and the reminder never names them', () => {
  const dir = minHooks();
  assert.match(say(dir, 'atlas high'), /^atlas high:/);
  assert.equal(stateFile(), 'high:off:off:off');
  for (const p of ['atlas ask', 'atlas check', 'atlas silent', 'enable atlas ask', '/atlas-min:atlas check']) {
    const ctx = say(dir, p);
    assert.doesNotMatch(ctx, /ask:|check:|silent:/, p);
    assert.equal(stateFile(), 'high:off:off:off', `${p} changed the state`);
  }
  assert.doesNotMatch(say(dir, 'atlas guard on'), /written to/, 'no switch is written');
  assert.ok(!fs.existsSync(path.join(conf, 'atlas.json')), 'atlas guard on wrote no user file');
});

test('a state written by a fuller install reads with only its level in the minimal build', () => {
  const dir = minHooks();
  const d = path.join(conf, 'atlas-state');
  const f = fs.readdirSync(d).find((x) => x.endsWith('.state'));
  fs.writeFileSync(path.join(d, f), 'low:ask:on:on');
  const ctx = say(dir, 'fix the parser');
  assert.match(ctx, /^atlas low:/);
  assert.doesNotMatch(ctx, /ask:|check:|silent:/);
  assert.equal(say(dir, 'atlas status').trim().split('\n').pop(), 'atlas low on');
  // the same file in a full build keeps all four
  assert.match(say(hooks, 'fix the parser'), /ask: .*check: .*silent: /);
});
