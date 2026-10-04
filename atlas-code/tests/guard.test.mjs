// Run with: node --test tests/guard.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const hook = path.join(here, '..', 'hooks', 'atlas-guard.js');
const { matchCommand, isInside, decide } = createRequire(import.meta.url)(hook);

const ASK = [
  'rm -rf build',
  'rm -fr /tmp/x',
  'rm -Rf node_modules',
  'rm -r -f dist',
  'sudo rm -rf /',
  'Remove-Item -Recurse -Force .\\dist',
  'Remove-Item .\\dist -Force -Recurse',
  'rd /s /q build',
  'git push --force',
  'git push origin main -f',
  'git reset --hard HEAD~1',
  'git checkout .',
  'git checkout -- .',
  'git restore .',
  'git clean -fd',
  'git branch -D feature',
  'git commit --no-verify -m x',
  'psql -c "DROP TABLE users"',
  'mysql -e "truncate table orders"',
  'docker system prune -a',
  'docker volume rm data',
  'kubectl delete pod web-1',
  'terraform destroy -auto-approve',
  'chmod -R 777 .',
  'npm publish',
  'cargo publish',
  'dd if=/dev/zero of=/dev/sda',
];

const PASS = [
  'rm file.txt',
  'rm -r build',
  'rm -f file.txt',
  'git push',
  'git push --force-with-lease',
  'git push origin feature',
  'git reset --soft HEAD~1',
  'git checkout main',
  'git checkout -- src/a.ts',
  'git restore src/a.ts',
  'git branch -d merged',
  'git clean -n',
  'npm run publish-docs',
  'chmod 755 run.sh',
  'ls -rf',
  'grep -rf patterns.txt .',
  'echo "drop the table of contents"',
  'kubectl get pods',
  'docker ps',
];

test('destructive commands are matched', () => {
  for (const c of ASK) assert.ok(matchCommand(c), `should ask: ${c}`);
});

test('ordinary commands are not matched', () => {
  for (const c of PASS) assert.equal(matchCommand(c), null, `should pass: ${c}`);
});

test('isInside', () => {
  const root = path.join(os.tmpdir(), 'proj', 'src', 'api');
  assert.ok(isInside(path.join(root, 'a.ts'), root));
  assert.ok(isInside(root, root));
  assert.ok(!isInside(path.join(root, '..', 'web', 'a.ts'), root));
  assert.ok(!isInside(path.join(root + '-old', 'a.ts'), root));
});

function project(config) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-guard-'));
  if (config) fs.writeFileSync(path.join(dir, '.atlas.json'), JSON.stringify(config));
  fs.mkdirSync(path.join(dir, 'src', 'api'), { recursive: true });
  return dir;
}

function run(input, home) {
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  const r = spawnSync(process.execPath, [hook], { input: JSON.stringify(input), encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout ? JSON.parse(r.stdout) : null;
}

test('off by default: no config, nothing is asked', () => {
  const dir = project(null);
  const home = project(null);
  assert.equal(run({ tool_name: 'Bash', tool_input: { command: 'rm -rf build' }, cwd: dir }, home), null);
});

test('guard on: a destructive command is answered with ask', () => {
  const dir = project({ guard: true });
  const out = run({ tool_name: 'Bash', tool_input: { command: 'git reset --hard' }, cwd: dir }, project(null));
  assert.equal(out.hookSpecificOutput.permissionDecision, 'ask');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /discards uncommitted work/);
});

test('guard on: an ordinary command passes in silence', () => {
  const dir = project({ guard: true });
  assert.equal(run({ tool_name: 'Bash', tool_input: { command: 'git status' }, cwd: dir }, project(null)), null);
});

test('the config is found from a subfolder', () => {
  const dir = project({ guard: true });
  const out = run({ tool_name: 'PowerShell', tool_input: { command: 'Remove-Item -Recurse -Force x' }, cwd: path.join(dir, 'src', 'api') }, project(null));
  assert.equal(out.hookSpecificOutput.permissionDecision, 'ask');
});

test('freeze: a write outside the directory is asked, inside passes', () => {
  const dir = project({ guard: true, freeze: 'src/api' });
  const home = project(null);
  const outside = run({ tool_name: 'Write', tool_input: { file_path: path.join(dir, 'README.md') }, cwd: dir }, home);
  assert.equal(outside.hookSpecificOutput.permissionDecision, 'ask');
  const inside = run({ tool_name: 'Edit', tool_input: { file_path: path.join(dir, 'src', 'api', 'a.ts') }, cwd: dir }, home);
  assert.equal(inside, null);
});

test('freeze without guard does nothing', () => {
  const dir = project({ freeze: 'src/api' });
  assert.equal(run({ tool_name: 'Write', tool_input: { file_path: path.join(dir, 'README.md') }, cwd: dir }, project(null)), null);
});

test('broken input and broken config never crash the hook', () => {
  const dir = project(null);
  fs.writeFileSync(path.join(dir, '.atlas.json'), '{ not json');
  const r = spawnSync(process.execPath, [hook], { input: 'not json', encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.equal(run({ tool_name: 'Bash', tool_input: { command: 'rm -rf x' }, cwd: dir }, project(null)), null);
});

test('the user file turns it on when the project has none', () => {
  const dir = project(null);
  const home = project(null);
  fs.mkdirSync(path.join(home, '.claude'));
  fs.writeFileSync(path.join(home, '.claude', 'atlas.json'), JSON.stringify({ guard: true }));
  const out = run({ tool_name: 'Bash', tool_input: { command: 'npm publish' }, cwd: dir }, home);
  assert.equal(out.hookSpecificOutput.permissionDecision, 'ask');
});

test('decide ignores tools it does not cover', () => {
  const dir = project({ guard: true, freeze: 'src/api' });
  assert.equal(decide({ tool_name: 'Read', tool_input: { file_path: path.join(dir, 'x') }, cwd: dir }), null);
});

// --- gate -------------------------------------------------------------------

const { matchUnfinished, gatePath } = createRequire(import.meta.url)(hook);
let sessions = 0;
const newSession = () => `test-${process.pid}-${Date.now()}-${sessions += 1}`;

test('gate: off by default', () => {
  const dir = project({ guard: true });
  fs.writeFileSync(path.join(dir, 'a.ts'), 'x');
  assert.equal(run({ tool_name: 'Edit', tool_input: { file_path: path.join(dir, 'a.ts') }, cwd: dir, session_id: newSession() }, project(null)), null);
});

test('gate: first edit of a file is turned back once, the second passes', () => {
  const dir = project({ gate: true });
  const home = project(null);
  const file = path.join(dir, 'a.ts');
  fs.writeFileSync(file, 'x');
  const session = newSession();
  const input = { tool_name: 'Edit', tool_input: { file_path: file }, cwd: dir, session_id: session };
  const first = run(input, home);
  assert.equal(first.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(first.hookSpecificOutput.permissionDecisionReason, /imports or calls it/);
  assert.equal(run(input, home), null);
  fs.rmSync(gatePath(session), { force: true });
});

test('gate: a new file gets the other question; another file is gated on its own', () => {
  const dir = project({ gate: true });
  const home = project(null);
  const session = newSession();
  const out = run({ tool_name: 'Write', tool_input: { file_path: path.join(dir, 'new.ts') }, cwd: dir, session_id: session }, home);
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /does not exist yet/);
  const other = run({ tool_name: 'Write', tool_input: { file_path: path.join(dir, 'other.ts') }, cwd: dir, session_id: session }, home);
  assert.equal(other.hookSpecificOutput.permissionDecision, 'deny');
  fs.rmSync(gatePath(session), { force: true });
});

test('gate: a new session starts again; no session id leaves the gate open', () => {
  const dir = project({ gate: true });
  const home = project(null);
  const file = path.join(dir, 'a.ts');
  fs.writeFileSync(file, 'x');
  const a = newSession();
  const b = newSession();
  run({ tool_name: 'Edit', tool_input: { file_path: file }, cwd: dir, session_id: a }, home);
  const again = run({ tool_name: 'Edit', tool_input: { file_path: file }, cwd: dir, session_id: b }, home);
  assert.equal(again.hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(run({ tool_name: 'Edit', tool_input: { file_path: file }, cwd: dir }, home), null);
  fs.rmSync(gatePath(a), { force: true });
  fs.rmSync(gatePath(b), { force: true });
});

test('gate does not touch shell commands or reads', () => {
  const dir = project({ gate: true });
  const home = project(null);
  assert.equal(run({ tool_name: 'Bash', tool_input: { command: 'ls' }, cwd: dir, session_id: newSession() }, home), null);
  assert.equal(run({ tool_name: 'Read', tool_input: { file_path: path.join(dir, 'a') }, cwd: dir, session_id: newSession() }, home), null);
});

test('guard asks before the gate turns back', () => {
  const dir = project({ guard: true, gate: true, freeze: 'src/api' });
  const session = newSession();
  const out = run({ tool_name: 'Write', tool_input: { file_path: path.join(dir, 'README.md') }, cwd: dir, session_id: session }, project(null));
  assert.equal(out.hookSpecificOutput.permissionDecision, 'ask');
  fs.rmSync(gatePath(session), { force: true });
});

// --- finish -----------------------------------------------------------------

test('unfinished phrases are matched, finished ones are not', () => {
  for (const t of [
    'I skipped the tests for now.',
    'Two tests are still failing.',
    'That is a pre-existing failure, unrelated.',
    'I left it as a TODO.',
    'This should now work.',
    "I couldn't run the suite here.",
    'I have not verified it in a browser.',
  ]) assert.ok(matchUnfinished(t).length, `should match: ${t}`);
  for (const t of [
    'All 214 tests passed.',
    'Build and lint are green.',
    'I ran the suite: 57 passed.',
    'The TODO list in the README was updated.',
    'The workshop is on Friday.',
  ]) assert.equal(matchUnfinished(t).length, 0, `should not match: ${t}`);
});

function transcript(dir, ...texts) {
  const file = path.join(dir, 'transcript.jsonl');
  const lines = [{ type: 'user', message: { content: 'go' } }];
  for (const t of texts) lines.push({ type: 'assistant', message: { content: [{ type: 'text', text: t }] } });
  lines.push({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: {} }] } });
  fs.writeFileSync(file, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  return file;
}

test('finish: off by default', () => {
  const dir = project({ guard: true });
  const t = transcript(dir, 'This should work.');
  assert.equal(run({ hook_event_name: 'Stop', transcript_path: t, cwd: dir }, project(null)), null);
});

test('finish: warns the user about the last answer and never blocks', () => {
  const dir = project({ finish: true, diskWarnGb: 0 });
  const t = transcript(dir, 'All tests passed.', 'Done. Two tests are still failing, a pre-existing issue.');
  const out = run({ hook_event_name: 'Stop', transcript_path: t, cwd: dir }, project(null));
  assert.match(out.systemMessage, /still failing/);
  assert.match(out.systemMessage, /pre-existing/);
  assert.equal(out.decision, undefined);
  assert.equal(out.hookSpecificOutput, undefined);
});

test('finish: a clean last answer says nothing, an earlier one is not read', () => {
  const dir = project({ finish: true, diskWarnGb: 0 });
  const t = transcript(dir, 'This should work.', 'I ran the suite: 57 passed.');
  assert.equal(run({ hook_event_name: 'Stop', transcript_path: t, cwd: dir }, project(null)), null);
});

test('finish: silent when already continuing, and with no transcript', () => {
  const dir = project({ finish: true, diskWarnGb: 0 });
  const t = transcript(dir, 'This should work.');
  assert.equal(run({ hook_event_name: 'Stop', transcript_path: t, cwd: dir, stop_hook_active: true }, project(null)), null);
  assert.equal(run({ hook_event_name: 'Stop', transcript_path: path.join(dir, 'missing.jsonl'), cwd: dir }, project(null)), null);
});

test('finish: low disk space is reported', () => {
  const dir = project({ finish: true, diskWarnGb: 1e9 });
  const t = transcript(dir, 'I ran the suite: 57 passed.');
  const out = run({ hook_event_name: 'Stop', transcript_path: t, cwd: dir }, project(null));
  assert.match(out.systemMessage, /GB free/);
});
