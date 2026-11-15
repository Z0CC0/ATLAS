// End to end: a real session, two reads of one file, a /compact with the hook on.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const plugin = process.argv[2], flag = process.argv[3] || '';
const W = mkdtempSync(join(tmpdir(), 'atlas-prune-e2e-'));
writeFileSync(join(W, 'big.txt'), Array.from({ length: 400 }, (_, i) => `line ${i + 1}: alpha${i} beta${i} gamma${i} delta${i}`).join('\n'));
const base = ['--model', 'claude-haiku-5-5', '--output-format', 'json', '--setting-sources', 'project', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--plugin-dir', plugin, '--allowed-tools', 'Read'];
let session = null, spent = 0;
function turn(prompt, env = {}, extra = []) {
  const r = spawnSync('claude', ['-p', prompt, ...(session ? ['--resume', session] : []), ...base, ...extra], { cwd: W, encoding: 'utf8', env: { ...process.env, ...env }, shell: false });
  let j = null; try { j = JSON.parse(r.stdout); } catch {}
  if (j) { session = j.session_id || session; spent += j.total_cost_usd || 0; }
  return { j, err: (r.stderr || '').slice(0, 600), out: j ? String(j.result).slice(0, 400) : (r.stdout || '').slice(0, 400) };
}
const env = flag === 'switch' ? { CLAUDE_CODE_ENABLE_FUNCTION_HOOKS: '1' } : {};
console.log('1', turn('The client is Marta Rinaldi and the release is on a Thursday. Read big.txt in full with the Read tool. Then read big.txt in full a second time. Then reply: done.', env).out);
for (const w of ['A', 'B', 'C']) console.log(w, turn(`Reply with just the letter ${w}.`, env).out);
const log = join(W, 'debug.log');
const c = turn('/compact', { ...env, ATLAS_PRUNE: process.argv[4] === 'summary' ? '0' : '1' }, ['--debug-file', log]);
console.log('compact', JSON.stringify(c).slice(0, 700));
if (existsSync(log)) console.log('debug lines:\n' + readFileSync(log, 'utf8').split('\n').filter((l) => /atlas|prune|function hook|hooks module|session\.compact|compact/i.test(l)).slice(0, 25).join('\n'));
const q = turn('Without any tool: who is the client, what day is the release, and what does line 3 of big.txt say? If you cannot see the file content any more, say so.', env);
console.log('after', q.out, '| input tokens', q.j && q.j.usage ? JSON.stringify(q.j.usage).slice(0, 300) : '');
console.log('session', session, 'dir', W, 'spent $' + spent.toFixed(4));
