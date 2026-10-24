// atlas-signals: the Stop hook that asks, at most three times a session, whether one sign in
// the transcript is worth a note. Pure function tested on crafted transcripts; the hook itself
// run once end to end through stdin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const hook = path.join(here, '..', 'hooks', 'atlas-signals.js');
const { signals, ask, MAX_ASKS } = createRequire(import.meta.url)(hook);

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'sig-'));
fs.mkdirSync(path.join(repo, 'vault'));
fs.writeFileSync(path.join(repo, '.atlas.json'), JSON.stringify({ vault: 'vault' }));

let n = 0;
const U = (text) => JSON.stringify({ type: 'user', uuid: 'u' + (n += 1), message: { content: text } });
const A = (text) => JSON.stringify({ type: 'assistant', uuid: 'a' + (n += 1), message: { content: [{ type: 'text', text }] } });
const T = (name, input, id) => JSON.stringify({ type: 'assistant', uuid: 't' + (n += 1), message: { content: [{ type: 'tool_use', id, name, input }] } });
const R = (id, text, error = false) => JSON.stringify({ type: 'user', uuid: 'r' + (n += 1), message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: error, content: text }] } });
const lines = (...xs) => xs.join('\n') + '\n';

test('fixed: a check that failed, then passed after an edit, is the first sign', () => {
  const j = lines(U('run the tests'), A('ok'),
    T('Bash', { command: 'npm test' }, 'c1'), R('c1', '3 failed, 10 passed', true),
    T('Edit', { file_path: path.join(repo, 'src', 'a.ts') }, 'e1'), R('e1', 'ok'),
    T('Bash', { command: 'npm test' }, 'c2'), R('c2', '0 failed, 13 passed'));
  const { out } = signals(j, repo);
  assert.equal(out[0].kind, 'fixed');
  assert.match(out[0].what, /npm test.*failed once.*src\/a\.ts/);
  assert.match(ask(out[0]), /^\[atlas signal fixed#/);
});

test('a check that only passed, or failed with no edit between, is not a sign', () => {
  const pass = lines(U('x'), A('ok'), T('Bash', { command: 'npm test' }, 'c1'), R('c1', '0 failed'));
  assert.equal(signals(pass, repo).out.length, 0);
  const noEdit = lines(U('x'), A('ok'), T('Bash', { command: 'npm test' }, 'c1'), R('c1', 'FAIL', true), T('Bash', { command: 'npm test' }, 'c2'), R('c2', 'ok'));
  assert.equal(noEdit.length > 0 && signals(noEdit, repo).out.length, 0);
});

test('corrected: an Italian or English correction followed by code work; a question is not one', () => {
  const it = lines(U('fai la cosa'), A('fatto'), U('no, usa il poll-worker invece di spawn'), A('ok'), T('Edit', { file_path: path.join(repo, 'main.js') }, 'e1'), R('e1', 'ok'));
  assert.equal(signals(it, repo).out[0].kind, 'corrected');
  const en = lines(U('do it'), A('done'), U("that's not how we do it, we always use the queue"), A('ok'), T('Write', { file_path: path.join(repo, 'q.js') }, 'e1'), R('e1', 'ok'));
  assert.equal(signals(en, repo).out[0].kind, 'corrected');
  const q = lines(U('do it'), A('done'), U('no wait, intendevo il file di config?'), A('ok'), T('Edit', { file_path: path.join(repo, 'c.js') }, 'e1'), R('e1', 'ok'));
  assert.equal(signals(q, repo).out.length, 0);
  // an edit inside the vault or .atlas is not work on the repo
  const vaultOnly = lines(U('do it'), A('done'), U('no, non così'), A('ok'), T('Write', { file_path: path.join(repo, 'memory', 'x.md') }, 'e1'), R('e1', 'ok'));
  assert.equal(signals(vaultOnly, repo).out.length, 0);
});

test('undone and chose are recognised', () => {
  const undo = lines(U('x'), A('ok'), T('Bash', { command: 'git restore src/a.ts' }, 'b1'), R('b1', ''));
  assert.equal(signals(undo, repo).out[0].kind, 'undone');
  const chose = lines(U('how?'), A('Two ways:\n1. keep the cache\n2. drop it\nWhich?'), U('la seconda'), A('ok'), T('Edit', { file_path: path.join(repo, 'a.js') }, 'e1'), R('e1', 'ok'));
  assert.equal(signals(chose, repo).out[0].kind, 'chose');
});

test('an earlier ask is counted, its sign is not asked twice, and the cap holds', () => {
  const one = lines(U('x'), A('ok'), T('Bash', { command: 'git restore a' }, 'b1'), R('b1', ''));
  const first = signals(one, repo).out[0];
  const again = one + lines(U(`Stop hook feedback:\n${ask(first)}`), A('nothing worth keeping'));
  assert.equal(signals(again, repo).out.length, 0, 'same sign, already asked');
  let capped = '';
  for (let i = 0; i < MAX_ASKS; i += 1) capped += lines(U(`Stop hook feedback:\n[atlas signal undone#k${i}] x`));
  capped += lines(U('x'), A('ok'), T('Bash', { command: 'git restore b' }, 'b9'), R('b9', ''));
  assert.equal(signals(capped, repo).out.length, 0, 'three asks spent');
});

test('the hook blocks with a reason on a sign, and is silent with no vault or while answering a stop hook', () => {
  const t = path.join(repo, 't.jsonl');
  fs.writeFileSync(t, lines(U('x'), A('ok'), T('Bash', { command: 'git restore a' }, 'b1'), R('b1', '')));
  const run = (input) => spawnSync(process.execPath, [hook], { input: JSON.stringify(input), encoding: 'utf8' });
  const hit = run({ hook_event_name: 'Stop', cwd: repo, transcript_path: t });
  assert.equal(hit.status, 0);
  const j = JSON.parse(hit.stdout);
  assert.equal(j.decision, 'block');
  assert.match(j.reason, /\[atlas signal undone#/);
  assert.equal(run({ hook_event_name: 'Stop', cwd: repo, transcript_path: t, stop_hook_active: true }).stdout, '');
  assert.equal(run({ hook_event_name: 'Stop', cwd: fs.mkdtempSync(path.join(os.tmpdir(), 'nov-')), transcript_path: t }).stdout, '');
  assert.ok(fs.statSync(hook).size <= 10 * 1024, 'hook under 10 KB');
});
