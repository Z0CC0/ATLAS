// Does one line at session start make a request in plain words load the skill that holds its
// rules? The same three requests with the profile hook and with it skipped (ATLAS_SKIP_HOOKS).
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir, homedir } from 'node:os';

const plugin = process.argv[2], out = process.argv[3];
const ROUNDS = Number(process.argv[4] || 1);
const MODEL = process.argv[5] || 'claude-sonnet-5-5';
const PROMPTS = [
  ['tests', 'Add tests for the multiply function in src/sum.js.', /atlas-test/],
  ['interface', 'The button in src/App.jsx looks off. Polish it.', /atlas-ui/],
  ['pipeline', 'Look over the CI pipeline before we ship and tell me what is missing.', /atlas-(ship|verify)/],
];

function project() {
  const W = mkdtempSync(join(tmpdir(), 'atlas-pilot-profile-'));
  for (const d of ['src', 'tests', '.github/workflows', '.git']) mkdirSync(join(W, d), { recursive: true });
  writeFileSync(join(W, 'package.json'), JSON.stringify({ name: 'shop', scripts: { test: 'node --test tests/' }, dependencies: { react: '^19.0.0' } }, null, 2));
  writeFileSync(join(W, 'src', 'sum.js'), 'export const sum = (a, b) => a + b;\nexport const multiply = (a, b) => a * b;\n');
  writeFileSync(join(W, 'tests', 'sum.test.js'), "import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { sum } from '../src/sum.js';\ntest('sum adds', () => assert.equal(sum(1, 2), 3));\n");
  writeFileSync(join(W, 'src', 'App.jsx'), "export default function App() {\n  return <button style={{ padding: 3, borderRadius: 2, transition: 'all 1s' }} onClick={() => alert('ok')}>Buy</button>;\n}\n");
  writeFileSync(join(W, '.github', 'workflows', 'ci.yml'), 'name: ci\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - run: npm test\n');
  return W;
}

function claude(args, cwd, env) {
  return new Promise((res) => {
    const p = spawn('claude', args, { cwd, shell: false, env: { ...process.env, ...env } });
    let so = '';
    p.stdout.on('data', (d) => (so += d));
    p.stderr.on('data', () => {});
    p.on('error', () => res(''));
    p.on('close', () => res(so));
  });
}

const base = ['--model', MODEL, '--setting-sources', 'project', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--plugin-dir', plugin, '--dangerously-skip-permissions'];

async function one(id, prompt, want, withHint) {
  const W = project();
  const env = withHint ? {} : { ATLAS_SKIP_HOOKS: 'profile' };
  // turn the dials on for this project, then ask in plain words in the same session
  const first = await claude(['-p', 'atlas low', '--output-format', 'json', ...base], W, env);
  let session = null, cost = 0;
  try { const j = JSON.parse(first); session = j.session_id; cost += j.total_cost_usd || 0; } catch {}
  const stream = await claude(['-p', prompt, '--resume', session, '--output-format', 'stream-json', '--verbose', '--max-turns', '3', ...base], W, env);
  const tools = [];
  let hint = false;
  for (const l of stream.split('\n')) {
    let j; try { j = JSON.parse(l); } catch { continue; }
    if (j.type === 'assistant') for (const b of j.message?.content || []) if (b.type === 'tool_use') tools.push(b.name === 'Skill' ? `Skill:${b.input?.skill}` : b.name);
    if (j.type === 'result') cost = j.total_cost_usd || cost;
    if (/This repository has/.test(l)) hint = true;
  }
  // the state file this run made for its temp project, in the real state folder: remove it
  const dir = join(homedir(), '.claude', 'atlas-state');
  const slug = W.replace(/[^A-Za-z0-9]/g, '-');
  for (const n of existsSync(dir) ? readdirSync(dir) : []) if (n.startsWith(slug)) rmSync(join(dir, n));
  return { id, withHint, loaded: tools.some((t) => t.startsWith('Skill:') && want.test(t)), first: tools[0] || '(no tool)', tools: tools.slice(0, 4), cost, hintSeen: hint };
}

const rows = [];
const jobs = [];
for (let r = 0; r < ROUNDS; r++) for (const [id, p, want] of PROMPTS) for (const h of [true, false]) jobs.push(() => one(id, p, want, h));
// three at a time
for (let i = 0; i < jobs.length; i += 3) rows.push(...await Promise.all(jobs.slice(i, i + 3).map((f) => f())));
writeFileSync(out, JSON.stringify({ model: MODEL, rounds: ROUNDS, rows }, null, 2));
for (const r of rows) console.log(`${r.id.padEnd(10)} ${r.withHint ? 'profile' : 'none   '}  skill loaded: ${r.loaded ? 'yes' : 'no '}  first: ${r.first.padEnd(28)} $${r.cost.toFixed(3)}  ${r.tools.join(', ')}`);
const count = (h) => rows.filter((r) => r.withHint === h && r.loaded).length;
const n = rows.length / 2;
console.log(`\nwith the profile: ${count(true)}/${n}   without: ${count(false)}/${n}   spent $${rows.reduce((a, r) => a + r.cost, 0).toFixed(2)}`);
