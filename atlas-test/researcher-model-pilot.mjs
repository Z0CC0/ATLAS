// The researcher's role on two models: same rules, same questions, cost and answer side by side.
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const agent = process.argv[2], out = process.argv[3];
const QUESTIONS = [
  ['vite', 'What is the latest stable version of Vite, when was it released, and which Node.js versions does it require? Answer shape. Skip the video search.'],
  ['openverse', 'What rate limits does the Openverse API apply to anonymous requests, and what is the largest page size it allows them? Answer shape. Skip the video search.'],
];
const MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5'];

function run(model, q) {
  return new Promise((res) => {
    const W = mkdtempSync(join(tmpdir(), 'atlas-pilot-model-'));
    const args = ['-p', q, '--model', model, '--output-format', 'json', '--setting-sources', 'project',
      '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--append-system-prompt-file', agent,
      '--tools', 'WebSearch,WebFetch', '--allowed-tools', 'WebSearch,WebFetch'];
    const p = spawn('claude', args, { cwd: W, shell: false });
    let so = '';
    p.stdout.on('data', (d) => (so += d));
    p.stderr.on('data', () => {});
    p.on('error', () => res({}));
    p.on('close', () => { let j = {}; try { j = JSON.parse(so); } catch { j = { raw: so.slice(0, 300) }; } res(j); });
  });
}

const rows = [];
await Promise.all(QUESTIONS.flatMap(([id, q]) => MODELS.map(async (m) => {
  const j = await run(m, q);
  rows.push({ id, model: m, cost: j.total_cost_usd, turns: j.num_turns, ms: j.duration_ms, answer: String(j.result || j.raw || ''), error: j.is_error });
})));
rows.sort((a, b) => a.id.localeCompare(b.id) || a.model.localeCompare(b.model));
writeFileSync(out, JSON.stringify(rows, null, 2));
for (const r of rows) {
  console.log(`${r.id.padEnd(10)} ${r.model.padEnd(18)} $${(r.cost || 0).toFixed(3)}  ${r.turns} turns  ${Math.round((r.ms || 0) / 1000)} s`);
  console.log(r.answer.slice(0, 560).replace(/\n+/g, ' | '));
  console.log();
}
