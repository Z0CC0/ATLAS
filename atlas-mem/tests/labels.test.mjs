// Labels: the table, its refusals, the lookup, and the hook that attaches a label to a
// Grep or Read result. Temporary folders only.
// node --test tests/labels.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const tool = path.join(here, '..', 'tools', 'labels.mjs');
const hook = path.join(here, '..', 'hooks', 'atlas-labels.js');
const L = await import(pathToFileURL(tool).href);

const vault = () => fs.mkdtempSync(path.join(os.tmpdir(), 'labels-'));

test('set, list, replace, unset', () => {
  const v = vault();
  assert.match(L.set(v, 'calcola_spread', 'SUPERSEDED', { to: 'spread_with_fees', why: 'ignored transaction costs', project: 'LAB' }), /^labelled {2}calcola_spread \(LAB\) is SUPERSEDED since \d{4}-\d\d-\d\d: use spread_with_fees instead\. Why: ignored transaction costs$/);
  assert.match(L.set(v, 'spread_with_fees', 'canonical', { why: 'the one the others copy' }), /^labelled {2}spread_with_fees is CANONICAL/);
  assert.match(L.set(v, 'calcola_spread', 'WRONG', { why: 'changed my mind' }), /^replaced/);
  assert.equal(L.list(v).length, 2);
  assert.equal(L.list(v)[0].label, 'CANONICAL', 'sorted by label');
  assert.match(L.unset(v, 'calcola_spread'), /^removed {3}1/);
  assert.match(L.unset(v, 'calcola_spread'), /^nothing/);
  assert.ok(fs.existsSync(path.join(v, '.atlas', 'labels.json')));
});

test('refusals: unknown label, no reason, SUPERSEDED without successor, not a symbol', () => {
  const v = vault();
  assert.throws(() => L.set(v, 'f', 'OLD', { why: 'x' }), /not a label/);
  assert.throws(() => L.set(v, 'f', 'WRONG', {}), /--why is required/);
  assert.throws(() => L.set(v, 'f', 'SUPERSEDED', { why: 'x' }), /needs --to/);
  assert.throws(() => L.set(v, 'not a name', 'WRONG', { why: 'x' }), /not a symbol name/);
  assert.equal(L.list(v).length, 0, 'nothing written');
});

test('lookup matches whole words only, each symbol once', () => {
  const v = vault();
  L.set(v, 'spread', 'SUPERSEDED', { to: 'spread_with_fees', why: 'costs' });
  L.set(v, 'atr', 'FRAGILE', { why: 'needs 14 bars' });
  const hits = L.lookup(v, 'x = spread(a)\ny = spread_with_fees(b)\nz = atr(c) + atr(d)');
  assert.deepEqual(hits.map((h) => h.symbol), ['spread', 'atr']);
  assert.equal(L.lookup(v, 'myspread = 1').length, 0, 'part of a longer word is not the symbol');
});

test('the hook attaches labels to a Grep result and stays silent otherwise', () => {
  const v = vault();
  L.set(v, 'calcola_spread', 'SUPERSEDED', { to: 'spread_with_fees', why: 'ignored costs', file: 'engine/old.py' });
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-'));
  fs.writeFileSync(path.join(cwd, '.atlas.json'), JSON.stringify({ vault: v }));
  const run = (input) => spawnSync(process.execPath, [hook], { input: JSON.stringify(input), encoding: 'utf8' });
  const grep = run({ hook_event_name: 'PostToolUse', tool_name: 'Grep', cwd, tool_input: { pattern: 'spread' }, tool_response: { content: 'engine/old.py:41:def calcola_spread(x):' } });
  assert.equal(grep.status, 0);
  const out = JSON.parse(grep.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(out.hookSpecificOutput.additionalContext, /calcola_spread \(engine\/old\.py\) is SUPERSEDED since \d{4}-\d\d-\d\d: use spread_with_fees instead\. Why: ignored costs/);
  const clean = run({ hook_event_name: 'PostToolUse', tool_name: 'Grep', cwd, tool_input: { pattern: 'x' }, tool_response: 'nothing here' });
  assert.equal(clean.stdout, '', 'no labelled symbol: no output');
  const other = run({ hook_event_name: 'PostToolUse', tool_name: 'Bash', cwd, tool_response: 'calcola_spread' });
  assert.equal(other.stdout, '', 'other tools are not looked at');
  const noVault = run({ hook_event_name: 'PostToolUse', tool_name: 'Read', cwd: fs.mkdtempSync(path.join(os.tmpdir(), 'nov-')), tool_response: 'calcola_spread' });
  assert.equal(noVault.stdout, '', 'no vault for the directory: silent');
});

test('vault resolution: .atlas.json above the directory, then the memory folder of the path', () => {
  const v = vault();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-'));
  fs.mkdirSync(path.join(root, 'a', 'b'), { recursive: true });
  fs.writeFileSync(path.join(root, '.atlas.json'), JSON.stringify({ vault: v }));
  assert.equal(L.vaultFor(path.join(root, 'a', 'b')), path.resolve(v));
  assert.equal(L.vaultFor(fs.mkdtempSync(path.join(os.tmpdir(), 'none-'))), null);
});

test('the hook file stays under the 10 KB ceiling', () => {
  assert.ok(fs.statSync(hook).size < 10 * 1024, `${fs.statSync(hook).size} bytes`);
});
