#!/usr/bin/env node
/**
 * ATLAS bench — does a memory make the answers better, or only the feeling?
 *
 * A small invented project, and sixteen facts someone told an assistant about it. Then the code
 * changes, so five of those facts become false. A fresh session is asked about them.
 *
 *   recall  the answer is only in the memory. No memory, no answer
 *   stale   the memory says one thing, the code now says another. The code is right
 *   quick   the same five, asked in a hurry, which tempts an answer from the note alone
 *   held    the memory and the code agree
 *
 * Every setup gets the same facts, written beforehand: this measures finding and doubting them, not
 * capturing them. Setups:
 *
 *   none         no memory
 *   claude-md    the facts in the project's CLAUDE.md, the common way, always loaded
 *   builtin      the facts as notes in the project's memory folder, which Claude Code reads by itself
 *   atlas-base   the same notes, with the plain atlas build (compression, no memory) on top: what
 *                atlas-mem costs beyond it is the price of the memory itself
 *   atlas-mem    the same notes, with the plugin's hooks live on top
 *   builtin-big  as builtin, among 300 other notes, in an order fixed beforehand
 *   atlas-big    as atlas-mem, among the same 300
 *
 *   trail        Trail-code, the facts as its learnings, its hooks and tools live
 *   claude-mem   claude-mem, the facts saved through its worker, its hooks and tools live
 *
 * builtin is the fair baseline for the plugin: whatever it gets right, the plugin did not add.
 *
 * The two others run from --rivals <folder>, in their own temporary homes, so they neither read nor
 * change anything of the person running this: see buildRival. claude-mem's own capture needs its
 * observer, which is not started, so its cost per session is not measured here.
 *
 * Each answer runs in its own session with Read, Grep and Glob, so it can check the code. A model
 * told nothing about the setups judges each answer against what is true now. All is saved.
 *
 * Usage:
 *   node memory-bench.mjs --plugin <folder of the atlas-mem build> [--rounds 2] [--only atlas-mem]
 *                         [--model claude-opus-5-5] [--limit 6] [--parallel 3] [--dry-run]
 *   node memory-bench.mjs --only trail --rivals <folder> --file memory-bench.rivals.json
 *   node memory-bench.mjs --report
 */

import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf(name); return i < 0 ? fallback : argv[i + 1]; };
const FILE = join(HERE, opt('--file', 'memory-bench.results.json'));
const RIVALS_FILE = join(HERE, 'memory-bench.rivals.json');
const has = (name) => argv.includes(name);

// ---- the project, before and after the change ------------------------------------------------

const BEFORE = {
  'README.md': '# ledgerlite\n\nInvoices and payments for one small client.\n',
  'src/pay.js': 'const RETRY_LIMIT = 3;\n\nfunction retryPayment(attempt) {\n  return attempt < RETRY_LIMIT;\n}\n\nmodule.exports = { retryPayment, RETRY_LIMIT };\n',
  'src/invoice.js': "function roundAmount(x) {\n  return Math.round(x * 100) / 100;\n}\n\nconst DEFAULT_CURRENCY = 'EUR';\n\nmodule.exports = { roundAmount, DEFAULT_CURRENCY };\n",
  'src/session.js': 'const SESSION_MINUTES = 30;\n\nfunction expired(ageMinutes) {\n  return ageMinutes > SESSION_MINUTES;\n}\n\nmodule.exports = { expired, SESSION_MINUTES };\n',
  'src/mail.js': "const SENDER = 'billing@ledgerlite.example';\n\nfunction sendReceipt(to) {\n  return { from: SENDER, to };\n}\n\nmodule.exports = { sendReceipt, SENDER };\n",
  'src/export.js': "const EXPORT_FORMAT = 'csv';\n\nfunction exportName(day) {\n  return `ledger-${day}.${EXPORT_FORMAT}`;\n}\n\nmodule.exports = { exportName, EXPORT_FORMAT };\n",
  'src/audit.js': 'function auditLine(user, action) {\n  return `${user} ${action}`;\n}\n\nmodule.exports = { auditLine };\n',
  'src/limits.js': 'const MAX_INVOICE_LINES = 200;\n\nfunction tooLong(lines) {\n  return lines > MAX_INVOICE_LINES;\n}\n\nmodule.exports = { tooLong, MAX_INVOICE_LINES };\n',
};
const AFTER = {
  'src/pay.js': BEFORE['src/pay.js'].replace('RETRY_LIMIT = 3', 'RETRY_LIMIT = 2'),
  'src/session.js': BEFORE['src/session.js'].replace('SESSION_MINUTES = 30', 'SESSION_MINUTES = 15'),
  'src/mail.js': BEFORE['src/mail.js'].replace('billing@ledgerlite.example', 'accounts@ledgerlite.example'),
  'src/export.js': BEFORE['src/export.js'].replace("EXPORT_FORMAT = 'csv'", "EXPORT_FORMAT = 'xlsx'"),
  'src/invoice.js': BEFORE['src/invoice.js'].replace("DEFAULT_CURRENCY = 'EUR'", "DEFAULT_CURRENCY = 'CHF'"),
};

// ---- the facts: what a person said, and the question asked later ------------------------------

const FACTS = [
  { id: 'r-database', kind: 'recall', name: 'Why SQLite', fact: 'We chose SQLite over Postgres because the client runs everything on one small office server with nobody to administer it.', q: 'Why did we pick SQLite and not Postgres for this project?', right: 'the client runs it on one small office server with nobody to administer it' },
  { id: 'r-friday', kind: 'recall', name: 'No Friday deploys', fact: 'Never deploy on a Friday: the client closes the books that day and their accountant has no way to reach us.', q: 'Can I ship this release on Friday afternoon?', right: 'no, deploys on Friday are ruled out because the client closes the books that day' },
  { id: 'r-legacy', kind: 'recall', name: 'Auditors read audit.js', fact: 'The output format of `auditLine` in `src/audit.js` must not change, because the external auditors parse those lines with their own script.', q: 'I want to add a timestamp to the audit lines. Any problem?', right: 'yes: the format must not change because the external auditors parse those lines with their own script' },
  { id: 'r-contact', kind: 'recall', name: 'Who to call', fact: 'The person to call about invoice questions at the client is Marta Bianchi, not the owner, who does not read invoices.', q: 'Who should I contact at the client about a wrong invoice?', right: 'Marta Bianchi' },
  { id: 'r-pdf', kind: 'recall', name: 'PDF library rejected', fact: 'We tried the wkhtmltopdf library for invoices and dropped it: it broke the page totals on invoices longer than one page.', q: 'Should we use wkhtmltopdf to print the invoices?', right: 'no, it was tried and dropped because it broke the page totals on invoices longer than one page' },
  { id: 'r-language', kind: 'recall', name: 'Italian only', fact: 'Everything the client sees must be in Italian, including error messages, by their explicit request.', q: 'What language should a new error message for the client be in?', right: 'Italian' },
  { id: 'r-backup', kind: 'recall', name: 'Backups', fact: 'Backups go to the client\'s NAS at 02:00, never to a cloud service, because their contract forbids it.', q: 'Can we move the backups to S3?', right: 'no, the client contract forbids cloud services; backups go to their NAS' },
  { id: 'r-tests', kind: 'recall', name: 'Test data', fact: 'Tests must never use real client names: a real name once ended up in a demo and the client complained.', q: 'Can I copy a few real client names into the test fixtures?', right: 'no, tests must never use real client names' },
  { id: 's-retry', kind: 'stale', name: 'Retry limit', fact: 'The payment retry limit is 3, set by `RETRY_LIMIT` in `src/pay.js`.', q: 'What is the payment retry limit right now?', right: '2', old: '3' },
  { id: 's-session', kind: 'stale', name: 'Session length', fact: 'A session lasts 30 minutes, set by `SESSION_MINUTES` in `src/session.js`.', q: 'How long does a session last before it expires?', right: '15 minutes', old: '30 minutes' },
  { id: 's-sender', kind: 'stale', name: 'Sender address', fact: 'Receipts are sent from billing@ledgerlite.example, set by `SENDER` in `src/mail.js`.', q: 'Which address do receipts go out from?', right: 'accounts@ledgerlite.example', old: 'billing@ledgerlite.example' },
  { id: 's-export', kind: 'stale', name: 'Export format', fact: 'The ledger is exported as csv, set by `EXPORT_FORMAT` in `src/export.js`.', q: 'What file format does the ledger export produce?', right: 'xlsx', old: 'csv' },
  { id: 's-currency', kind: 'stale', name: 'Currency', fact: 'The default currency is EUR, set by `DEFAULT_CURRENCY` in `src/invoice.js`.', q: 'What is the default currency of an invoice?', right: 'CHF', old: 'EUR' },
  { id: 'h-lines', kind: 'held', name: 'Invoice length', fact: 'An invoice can have at most 200 lines, set by `MAX_INVOICE_LINES` in `src/limits.js`.', q: 'How many lines can an invoice have at most?', right: '200' },
  { id: 'h-round', kind: 'held', name: 'Rounding', fact: 'Amounts are rounded to two decimals by `roundAmount` in `src/invoice.js`.', q: 'To how many decimals are amounts rounded?', right: 'two' },
  { id: 'h-expired', kind: 'held', name: 'Expiry check', fact: 'Whether a session has expired is decided by `expired` in `src/session.js`.', q: 'Which function decides whether a session has expired?', right: 'expired, in src/session.js' },
];
const QUICK = FACTS.filter((f) => f.kind === 'stale').map((f) => ({ ...f, id: `q${f.id}`, kind: 'quick', q: `Quick one, from memory, no need to open any files: ${f.q}` }));
const QUESTIONS = [...FACTS, ...QUICK];
const CONFIGS = ['none', 'claude-md', 'builtin', 'atlas-base', 'atlas-mem', 'builtin-big', 'atlas-big', 'trail', 'claude-mem'];
const isRival = (c) => c === 'trail' || c === 'claude-mem';

/** Three hundred notes about other things, and one fixed shuffle of all of them. */
const OTHER = Array.from({ length: 300 }, (_, i) => {
  const topic = ['printer tray', 'office wifi', 'parking badge', 'meeting room', 'coffee supplier', 'desk lamp', 'visitor log', 'fire drill', 'mail room', 'bike rack'][i % 10];
  return { id: `other-${i}`, name: `${topic} ${i}`, fact: `Housekeeping note ${i}: the ${topic} on floor ${(i % 7) + 1} was sorted out with ${['Luca', 'Sara', 'Piero', 'Anna'][i % 4]} in week ${(i % 52) + 1}.` };
});
function shuffled(list) {
  const out = [...list];
  let seed = 20261104;
  for (let i = out.length - 1; i > 0; i -= 1) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const j = seed % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
const DISALLOWED = 'WebSearch,WebFetch,Bash,Edit,Write,NotebookEdit,Task,TodoWrite,Agent';

const git = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { stdio: 'ignore' });
const commit = (dir, msg) => { git(dir, 'add', '-A'); git(dir, '-c', 'user.name=bench', '-c', 'user.email=bench@bench', 'commit', '-q', '-m', msg); };
const put = (dir, files) => { for (const [f, text] of Object.entries(files)) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), text); } };
const claudeDir = () => process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
const vaultOf = (cwd) => join(claudeDir(), 'projects', resolve(cwd).replace(/[^A-Za-z0-9]/g, '-'), 'memory');

/** The project for one setup, with the facts in place and then the code changed under them. */
function buildProject(config, plugin) {
  const dir = mkdtempSync(join(tmpdir(), `atlas-membench-${config}-`));
  put(dir, BEFORE);
  git(dir, 'init', '-q');
  if (config === 'claude-md') writeFileSync(join(dir, 'CLAUDE.md'), `# Project notes\n\n${FACTS.map((f) => `- ${f.fact}`).join('\n')}\n`);
  commit(dir, 'first version');
  if (config !== 'none' && config !== 'claude-md') {
    const vault = vaultOf(dir);
    mkdirSync(vault, { recursive: true });
    const index = [];
    for (const f of shuffled(config.endsWith('-big') ? [...FACTS, ...OTHER] : FACTS)) {
      writeFileSync(join(vault, `${f.id}.md`), `---\nname: ${f.name}\ndescription: ${f.fact.replace(/`/g, '').slice(0, 150)}\nmetadata:\n  type: project\n---\n\n${f.fact}\n`);
      index.push(`- [${f.name}](${f.id}.md)`);
    }
    writeFileSync(join(vault, 'MEMORY.md'), `${index.join('\n')}\n`);
    if (config === 'atlas-mem' || config === 'atlas-big') execFileSync(process.execPath, [join(plugin, 'tools', 'memcheck.mjs'), 'autolink', vault, '--root', dir], { encoding: 'utf8' });
  }
  put(dir, AFTER);
  commit(dir, 'later changes');
  return dir;
}

/** How a rival is run, and its project with the facts in place, before the code changes under them. */
function trailPaths(rivals) { return { bin: join(rivals, 'trail-pkg', 'node_modules', '@trailhq', 'trail-code', 'dist', 'bin', 'trail.js') }; }
function cmemPaths(rivals) {
  const home = join(rivals, 'cmhome');
  const plugin = join(home, '.claude', 'plugins', 'cache', 'thedotmack', 'claude-mem', '15.9.0');
  const path = [join(home, 'lad', 'claude-mem', 'bin'), join(home, '.bun', 'bin'), join(home, '.local', 'bin'), process.env.PATH].join(';');
  return { home, plugin, env: { LOCALAPPDATA: join(home, 'lad'), CLAUDE_MEM_DATA_DIR: join(home, '.claude-mem'), CLAUDE_PLUGIN_ROOT: plugin, CLAUDE_MEM_ONLINE_OPTIN: 'false', DO_NOT_TRACK: '1', PATH: path, Path: path } };
}

async function buildRival(config, rivals) {
  const dir = mkdtempSync(join(tmpdir(), `atlas-membench-${config}-`));
  put(dir, BEFORE);
  git(dir, 'init', '-q');
  commit(dir, 'first version');
  const extra = { env: { DO_NOT_TRACK: '1' }, args: [] };
  if (config === 'trail') {
    const { bin } = trailPaths(rivals);
    const home = mkdtempSync(join(tmpdir(), 'atlas-membench-trailhome-'));
    const env = { ...process.env, HOME: home, USERPROFILE: home, DO_NOT_TRACK: '1' };
    const trail = (...a) => execFileSync(process.execPath, [bin, ...a], { cwd: dir, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    trail('init', '--agents', 'claude', '--yes');
    for (const f of FACTS) {
      const touches = f.fact.match(/`(src\/[^`]+)`/);
      trail('note', '--anyway', '--title', f.name, '-m', f.fact, '--author', 'bench', ...(touches ? ['--touches', touches[1]] : []));
    }
    // what init wrote to the home goes in the project, still pointing its hooks at the temporary home
    const global = JSON.parse(readFileSync(join(home, '.claude', 'settings.json'), 'utf8'));
    for (const groups of Object.values(global.hooks)) for (const g of groups) for (const h of g.hooks) h.command = `HOME="${home.replace(/\\/g, '/')}" USERPROFILE="${home.replace(/\\/g, '/')}" DO_NOT_TRACK=1 ${h.command}`;
    writeFileSync(join(dir, '.claude', 'settings.json'), JSON.stringify({ hooks: global.hooks }, null, 2));
    if (existsSync(join(home, '.claude', 'skills', 'trail'))) cpSync(join(home, '.claude', 'skills', 'trail'), join(dir, '.claude', 'skills', 'trail'), { recursive: true });
    const mcp = join(home, 'mcp.json');
    writeFileSync(mcp, JSON.stringify({ mcpServers: { trail: { command: process.execPath, args: [bin, 'mcp'], env: { HOME: home, USERPROFILE: home, DO_NOT_TRACK: '1' } } } }));
    extra.mcp = mcp;
    extra.cleanup = home;
    commit(dir, 'trail and its learnings');
    put(dir, AFTER);
    commit(dir, 'later changes');
    trail('build');
    return { dir, extra };
  }
  const cm = cmemPaths(rivals);
  for (const f of FACTS) {
    const r = await fetch('http://127.0.0.1:37777/api/memory/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: f.fact, title: f.name, cwd: dir }) });
    if (!r.ok) throw new Error(`claude-mem would not save ${f.id}: ${r.status}`);
  }
  const mcp = join(dir, '..', `${dir.split(/[\\/]/).pop()}-mcp.json`);
  writeFileSync(mcp, readFileSync(join(cm.plugin, '.mcp.json')));
  extra.env = cm.env;
  extra.mcp = mcp;
  extra.args = ['--plugin-dir', cm.plugin];
  extra.cleanup = mcp;
  put(dir, AFTER);
  commit(dir, 'later changes');
  return { dir, extra };
}

function cleanProject(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* left for the OS */ }
  try { rmSync(dirname(vaultOf(dir)), { recursive: true, force: true }); } catch { /* left */ }
}

function call(args, cwd, env = {}) {
  return new Promise((res, rej) => {
    const child = execFile('claude', args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true, timeout: 10 * 60 * 1000, env: { ...process.env, ...env } }, (err, out, stderr) => {
      if (err && !out) return rej(new Error((stderr || err.message).trim().split('\n')[0]));
      try { res(JSON.parse(out)); } catch { rej(new Error(`no JSON: ${(stderr || out).slice(0, 160)}`)); }
    });
    child.stdin?.end();
  });
}

const JUDGE = `You compare an answer with what is true now. Reply with one JSON object and nothing else: {"right":"Y" or "N","old":"Y" or "N","doubt":"Y" or "N"}.
right: Y if the answer gives what is true now, in any wording. N if it gives something else, or says it does not know.
old: Y if the answer presents the outdated value as the current one. N otherwise, including when it mentions it only as what a note used to say.
doubt: Y if the answer says a note, memory or document disagrees with the code or may be out of date. N otherwise.`;

async function judge(fact, answer, model, dir) {
  const user = `QUESTION\n${fact.q}\n\nTRUE NOW\n${fact.right}\n${fact.old ? `\nOUTDATED VALUE\n${fact.old}\n` : ''}\nANSWER\n${answer}`;
  const file = join(dir, 'judge.md');
  writeFileSync(file, JUDGE);
  const j = await call(['-p', user, '--model', model, '--output-format', 'json', '--setting-sources', 'project', '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--disable-slash-commands', '--system-prompt-file', file], dir);
  return { ...JSON.parse(String(j.result).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')), cost: j.total_cost_usd || 0 };
}

async function run() {
  const plugin = opt('--plugin');
  const rounds = Number(opt('--rounds', 2));
  const model = opt('--model', 'claude-opus-5-5');
  const judgeModel = opt('--judge', 'claude-sonnet-5-5');
  const configs = opt('--only') ? [opt('--only')] : CONFIGS;
  if (configs.includes('atlas-base') && !existsSync(join(opt('--base-plugin', '.'), 'hooks'))) { console.error('--base-plugin <folder of the atlas build> is required for atlas-base'); process.exit(2); }
  if (configs.some((c) => c === 'atlas-mem' || c === 'atlas-big') && (!plugin || !existsSync(join(plugin, 'tools', 'memcheck.mjs')))) { console.error('--plugin <folder of the atlas-mem build> is required'); process.exit(2); }
  const store = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { answers: {} };
  const facts = QUESTIONS.slice(0, Number(opt('--limit', QUESTIONS.length)));
  const jobs = [];
  for (const config of configs) for (let r = 1; r <= rounds; r += 1) for (const f of facts) if (!store.answers[`${config}.${f.id}.${r}`]) jobs.push({ config, f, r });
  if (has('--dry-run')) { console.log(`${jobs.length} answers to make, model ${model}.`); return; }
  store.meta = { date: new Date().toISOString().slice(0, 10), model, judge: judgeModel };
  const projects = new Map();
  const extras = new Map();
  for (const config of new Set(jobs.map((j) => j.config))) {
    if (isRival(config)) {
      const { dir, extra } = await buildRival(config, opt('--rivals'));
      projects.set(config, dir);
      extras.set(config, extra);
    } else projects.set(config, buildProject(config, plugin));
  }
  const judgeDir = mkdtempSync(join(tmpdir(), 'atlas-membench-judge-'));
  const queue = [...jobs];
  let done = 0, cost = 0, inARow = 0;
  await Promise.all(Array.from({ length: Number(opt('--parallel', 3)) }, async () => {
    while (queue.length && inARow < 3) {
      const { config, f, r } = queue.shift();
      const dir = projects.get(config);
      const extra = extras.get(config);
      const args = ['-p', `${f.q} Answer in one or two sentences.`, '--model', model, '--output-format', 'json', '--setting-sources', 'project', '--disallowed-tools', DISALLOWED, '--strict-mcp-config', '--mcp-config', extra?.mcp || '{"mcpServers":{}}', '--dangerously-skip-permissions', ...(extra?.args || [])];
      if (config === 'atlas-base') args.push('--plugin-dir', opt('--base-plugin'));
      else if (config.startsWith('atlas')) args.push('--plugin-dir', plugin);
      try {
        const j = await call(args, dir, extra?.env);
        if (j.is_error) throw new Error(String(j.result).slice(0, 160));
        const v = await judge(f, String(j.result), judgeModel, judgeDir);
        const u = j.usage || {};
        store.answers[`${config}.${f.id}.${r}`] = { config, id: f.id, kind: f.kind, round: r, answer: String(j.result), right: v.right === 'Y', old: v.old === 'Y', doubt: v.doubt === 'Y', input: (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0), output: u.output_tokens || 0, turns: j.num_turns || 0, cost: j.total_cost_usd || 0 };
        cost += (j.total_cost_usd || 0) + v.cost;
        done += 1;
        inARow = 0;
        writeFileSync(FILE, JSON.stringify(store, null, 1));
        if (done % 12 === 0) console.log(`${done}/${jobs.length}, reported cost $${cost.toFixed(2)}`);
      } catch (e) {
        inARow += 1;
        console.log(`FAILED ${config} ${f.id} ${r}: ${e.message}`);
      }
    }
  }));
  for (const dir of projects.values()) cleanProject(dir);
  for (const extra of extras.values()) if (extra.cleanup) rmSync(extra.cleanup, { recursive: true, force: true });
  cleanProject(judgeDir);
  console.log(`${done} answers, reported cost $${cost.toFixed(2)}.`);
}

function report() {
  const store = JSON.parse(readFileSync(FILE, 'utf8'));
  const rows = Object.values(store.answers);
  if (existsSync(RIVALS_FILE)) rows.push(...Object.values(JSON.parse(readFileSync(RIVALS_FILE, 'utf8')).answers));
  const by = (config, kind) => rows.filter((r) => r.config === config && (!kind || r.kind === kind));
  const out = { meta: store.meta, configs: {} };
  for (const config of CONFIGS) {
    const all = by(config);
    if (!all.length) continue;
    const pct = (list, f) => (list.length ? `${list.filter(f).length} of ${list.length}` : '-');
    const sum = (k) => all.reduce((a, r) => a + r[k], 0);
    out.configs[config] = { recall: pct(by(config, 'recall'), (r) => r.right), stale: pct(by(config, 'stale'), (r) => r.right), staleOld: pct(by(config, 'stale'), (r) => r.old), staleDoubt: pct(by(config, 'stale'), (r) => r.doubt), quick: pct(by(config, 'quick'), (r) => r.right), quickOld: pct(by(config, 'quick'), (r) => r.old), quickDoubt: pct(by(config, 'quick'), (r) => r.doubt), held: pct(by(config, 'held'), (r) => r.right), input: Math.round(sum('input') / all.length), output: Math.round(sum('output') / all.length), turns: Number((sum('turns') / all.length).toFixed(1)), cost: Number((sum('cost') / all.length).toFixed(3)) };
  }
  if (has('--json')) { console.log(JSON.stringify(out, null, 2)); return; }
  console.log(`${store.meta.date}, ${store.meta.model}, judged by ${store.meta.judge}`);
  console.log('setup       | recall | stale right | stale gave old | noticed | quick right | quick gave old | quick noticed | held | input | output | turns | $ per answer');
  for (const [c, r] of Object.entries(out.configs)) console.log(`${c.padEnd(11)} | ${r.recall} | ${r.stale} | ${r.staleOld} | ${r.staleDoubt} | ${r.quick} | ${r.quickOld} | ${r.quickDoubt} | ${r.held} | ${r.input} | ${r.output} | ${r.turns} | ${r.cost}`);
}

/** With no tokens spent: what the hooks would say to each question. */
function probe() {
  const plugin = opt('--plugin');
  for (const config of ['atlas-mem', 'atlas-big']) {
    const dir = buildProject(config, plugin);
    const vault = vaultOf(dir);
    const started = Date.now();
    const fresh = execFileSync(process.execPath, [join(plugin, 'tools', 'memcheck.mjs'), 'fresh', vault, '--root', dir, '--json'], { encoding: 'utf8' });
    console.log(`${config}: at session start, in ${Date.now() - started} ms: ${JSON.parse(fresh).map((n) => n.slug).join(', ') || 'nothing'}`);
    const session = `probe-${Date.now()}`;
    for (const f of FACTS) {
      const t = Date.now();
      const out = spawnSync(process.execPath, [join(plugin, 'hooks', 'atlas-recall.js')], { input: JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: f.q, cwd: dir, session_id: `${session}-${f.id}` }), encoding: 'utf8' }).stdout;
      const said = out ? JSON.parse(out).hookSpecificOutput.additionalContext : '';
      const found = OTHER.concat(FACTS).filter((n) => said.includes(`${n.id}`)).map((n) => n.id);
      console.log(`  ${f.id.padEnd(11)} ${found.includes(f.id) ? 'FOUND' : 'miss '} ${String(Date.now() - t).padStart(4)} ms  ${found.join(' ') || '-'}`);
    }
    cleanProject(dir);
  }
}

if (has('--report')) report(); else if (has('--probe')) probe(); else await run();
