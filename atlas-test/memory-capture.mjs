#!/usr/bin/env node
/**
 * The other half of a memory: does it keep what was said? memory-bench.mjs hands every setup the
 * same notes, already written. Here nobody writes them: a person works with the assistant for six
 * turns on the same invented project and says six things about the client in passing. Then a new
 * session is asked about each of them.
 *
 *   passing  the six things are said in passing and nobody asks to keep them
 *   asked    the same, and the last turn asks to keep what was said about the client
 *
 * Setups, each on top of Claude Code's own memory folder, which is always there:
 *
 *   builtin     Claude Code alone
 *   atlas-mem   the plugin as it ships: notes written when the work decides, no automatic writes
 *   atlas-auto  the plugin with `atlas memory auto on` at its default of five turns. The switch
 *               lives in the person's own atlas.json, so the bench runs a copy of the build whose
 *               hook reads it from ATLAS_BENCH_AUTO instead; nothing else in the copy changes
 *   trail       Trail-code, initialised in a temporary home, its hooks and tools live
 *
 * claude-mem is not here: its observer needs a login of its own (see memory-bench.mjs).
 *
 *   node memory-capture.mjs --plugin <folder of the atlas-mem build> --rivals <folder> [--rounds 2]
 *                           [--only builtin] [--mode passing] [--parallel 3] [--dry-run]
 *   node memory-capture.mjs --report
 */

import { execFile, execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf(name); return i < 0 ? fallback : argv[i + 1]; };
const has = (name) => argv.includes(name);
const FILE = join(HERE, opt('--file', 'memory-capture.results.json'));

const PROJECT = {
  'README.md': '# ledgerlite\n\nInvoices and payments for one small client.\n',
  'src/pay.js': 'const RETRY_LIMIT = 3;\n\nfunction retryPayment(attempt) {\n  return attempt < RETRY_LIMIT;\n}\n\nmodule.exports = { retryPayment, RETRY_LIMIT };\n',
  'src/session.js': 'const SESSION_MINUTES = 30;\n\nfunction expired(ageMinutes) {\n  return ageMinutes > SESSION_MINUTES;\n}\n\nmodule.exports = { expired, SESSION_MINUTES };\n',
  'src/export.js': "const EXPORT_FORMAT = 'csv';\n\nfunction exportName(day) {\n  return `ledger-${day}.${EXPORT_FORMAT}`;\n}\n\nmodule.exports = { exportName, EXPORT_FORMAT };\n",
  'src/audit.js': 'function auditLine(user, action) {\n  return `${user} ${action}`;\n}\n\nmodule.exports = { auditLine };\n',
  'src/limits.js': 'const MAX_INVOICE_LINES = 200;\n\nfunction tooLong(lines) {\n  return lines > MAX_INVOICE_LINES;\n}\n\nmodule.exports = { tooLong, MAX_INVOICE_LINES };\n',
};

// what the person says, a small question about the code each time with something about the client on the side
const TURNS = [
  'Can you look at src/pay.js and tell me what retryPayment does? For context, anything about invoices at the client goes to Marta Bianchi, not the owner, who does not read them.',
  'OK. Which file sets how long a session lasts? We never deploy on a Friday, by the way: the client closes the books that day.',
  'Where is the export file name built? We tried wkhtmltopdf for the invoice PDFs once and dropped it, it broke the page totals on invoices longer than one page.',
  'Is there anything in src/limits.js that caps how long an invoice can be? Backups go to the client\'s NAS at 02:00, never to a cloud service, their contract forbids it.',
  'What does auditLine return? Everything the client sees has to be in Italian, error messages included, and tests must never use real client names, one ended up in a demo once.',
];
const LAST = {
  passing: 'Thanks, that is all for today.',
  asked: 'Thanks, that is all for today. Keep what I told you about the client for next time.',
};
const FACTS = [
  { id: 'contact', q: 'Who should I contact at the client about a wrong invoice?', right: 'Marta Bianchi' },
  { id: 'friday', q: 'Can I ship this release on Friday afternoon?', right: 'no, deploys on Friday are ruled out because the client closes the books that day' },
  { id: 'pdf', q: 'Should we use wkhtmltopdf to print the invoices?', right: 'no, it was tried and dropped because it broke the page totals on invoices longer than one page' },
  { id: 'backup', q: 'Can we move the backups to S3?', right: 'no, the client contract forbids cloud services; backups go to their NAS' },
  { id: 'language', q: 'What language should a new error message for the client be in?', right: 'Italian' },
  { id: 'tests', q: 'Can I copy a few real client names into the test fixtures?', right: 'no, tests must never use real client names' },
];
const CONFIGS = ['builtin', 'atlas-mem', 'atlas-auto', 'trail'];
const MODES = ['passing', 'asked'];
const ASK_DISALLOWED = 'WebSearch,WebFetch,Bash,Edit,Write,NotebookEdit,Task,TodoWrite,Agent';
const WORK_DISALLOWED = 'WebSearch,WebFetch,NotebookEdit,Task,Agent';

const git = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { stdio: 'ignore' });
const commit = (dir, msg) => { git(dir, 'add', '-A'); git(dir, '-c', 'user.name=bench', '-c', 'user.email=bench@bench', 'commit', '-q', '-m', msg); };
const put = (dir, files) => { for (const [f, text] of Object.entries(files)) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), text); } };
const claudeDir = () => process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
const vaultOf = (cwd) => join(claudeDir(), 'projects', resolve(cwd).replace(/[^A-Za-z0-9]/g, '-'), 'memory');
const notesIn = (dir) => { try { return readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'MEMORY.md').length; } catch { return 0; } };

/** A copy of the build whose automatic memory is switched on from the environment, for this bench only. */
function autoCopy(plugin) {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-capture-build-'));
  cpSync(plugin, dir, { recursive: true });
  const hook = join(dir, 'hooks', 'atlas-auto.js');
  const text = readFileSync(hook, 'utf8');
  const from = 'everyOf(userConfig().memoryAuto)';
  if (!text.includes(from)) throw new Error('atlas-auto.js no longer reads userConfig().memoryAuto: update the bench');
  writeFileSync(hook, text.replace(from, 'everyOf(process.env.ATLAS_BENCH_AUTO ? Number(process.env.ATLAS_BENCH_AUTO) : userConfig().memoryAuto)'));
  return dir;
}

/** The project for one conversation, and how the assistant is started in it. */
function project(config, plugin, auto, rivals) {
  const dir = mkdtempSync(join(tmpdir(), `atlas-capture-${config}-`));
  put(dir, PROJECT);
  git(dir, 'init', '-q');
  commit(dir, 'first version');
  const extra = { env: { DO_NOT_TRACK: '1' }, args: [], mcp: '{"mcpServers":{}}', learnings: [] };
  if (config === 'atlas-mem') extra.args = ['--plugin-dir', plugin];
  if (config === 'atlas-auto') { extra.args = ['--plugin-dir', auto]; extra.env.ATLAS_BENCH_AUTO = '5'; }
  if (config === 'trail') {
    const bin = join(rivals, 'trail-pkg', 'node_modules', '@trailhq', 'trail-code', 'dist', 'bin', 'trail.js');
    const home = mkdtempSync(join(tmpdir(), 'atlas-capture-trailhome-'));
    const env = { ...process.env, HOME: home, USERPROFILE: home, DO_NOT_TRACK: '1' };
    execFileSync(process.execPath, [bin, 'init', '--agents', 'claude', '--yes'], { cwd: dir, env, stdio: 'ignore' });
    // what init wrote to the home goes in the project, still pointing its hooks at the temporary home
    const global = JSON.parse(readFileSync(join(home, '.claude', 'settings.json'), 'utf8'));
    const prefix = `HOME="${home.replace(/\\/g, '/')}" USERPROFILE="${home.replace(/\\/g, '/')}" DO_NOT_TRACK=1`;
    for (const groups of Object.values(global.hooks)) for (const g of groups) for (const h of g.hooks) h.command = `${prefix} ${h.command}`;
    mkdirSync(join(dir, '.claude'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'settings.json'), JSON.stringify({ hooks: global.hooks }, null, 2));
    if (existsSync(join(home, '.claude', 'skills', 'trail'))) cpSync(join(home, '.claude', 'skills', 'trail'), join(dir, '.claude', 'skills', 'trail'), { recursive: true });
    // the agent saves a learning with the trail command: put it on the path, in the temporary home
    const shim = join(home, 'bin');
    mkdirSync(shim, { recursive: true });
    writeFileSync(join(shim, 'trail'), `#!/bin/sh\n${prefix} exec "${process.execPath.replace(/\\/g, '/')}" "${bin.replace(/\\/g, '/')}" "$@"\n`, { mode: 0o755 });
    writeFileSync(join(shim, 'trail.cmd'), `@set HOME=${home}\r\n@set USERPROFILE=${home}\r\n@set DO_NOT_TRACK=1\r\n@"${process.execPath}" "${bin}" %*\r\n`);
    const path = `${shim};${process.env.PATH}`;
    extra.env = { ...extra.env, PATH: path, Path: path };
    extra.mcp = join(home, 'mcp.json');
    writeFileSync(extra.mcp, JSON.stringify({ mcpServers: { trail: { command: process.execPath, args: [bin, 'mcp'], env: { HOME: home, USERPROFILE: home, DO_NOT_TRACK: '1' } } } }));
    extra.learnings = [join(dir, '.trail', 'learnings'), join(home, '.trail', 'learnings')];
    extra.cleanup = home;
    commit(dir, 'trail');
    try { execFileSync(process.execPath, [bin, 'build'], { cwd: dir, env, stdio: 'ignore' }); } catch { /* the map is not what is measured */ }
  }
  return { dir, extra };
}

function clean(dir) {
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

const JUDGE = `You compare an answer with what is true. Reply with one JSON object and nothing else: {"right":"Y" or "N"}.
right: Y if the answer gives what is true, in any wording. N if it gives something else, or says it does not know.`;

async function judge(fact, answer, model, dir) {
  const file = join(dir, 'judge.md');
  writeFileSync(file, JUDGE);
  const j = await call(['-p', `QUESTION\n${fact.q}\n\nTRUE\n${fact.right}\n\nANSWER\n${answer}`, '--model', model, '--output-format', 'json', '--setting-sources', 'project', '--tools', '', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}', '--disable-slash-commands', '--system-prompt-file', file], dir);
  return { ...JSON.parse(String(j.result).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')), cost: j.total_cost_usd || 0 };
}

const usage = (j) => { const u = j.usage || {}; return (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0); };

/** One conversation, then a new session per fact. */
async function one(config, mode, round, ctx) {
  const { dir, extra } = project(config, ctx.plugin, ctx.auto, ctx.rivals);
  const base = ['--model', ctx.model, '--output-format', 'json', '--setting-sources', 'project', '--strict-mcp-config', '--mcp-config', extra.mcp, '--dangerously-skip-permissions', ...extra.args];
  const out = { config, mode, round, work: { cost: 0, input: 0, turns: 0 }, answers: {} };
  try {
    let session = null;
    for (const said of [...TURNS, LAST[mode]]) {
      const j = await call(['-p', said, ...(session ? ['--resume', session] : []), '--disallowed-tools', WORK_DISALLOWED, ...base], dir, extra.env);
      if (j.is_error) throw new Error(String(j.result).slice(0, 160));
      session = j.session_id;
      out.work.cost += j.total_cost_usd || 0;
      out.work.input += usage(j);
      out.work.turns += j.num_turns || 0;
    }
    out.notes = notesIn(vaultOf(dir)) + extra.learnings.reduce((n, d) => n + notesIn(d), 0);
    for (const f of FACTS) {
      const j = await call(['-p', `${f.q} Answer in one or two sentences.`, '--disallowed-tools', ASK_DISALLOWED, ...base], dir, extra.env);
      if (j.is_error) throw new Error(String(j.result).slice(0, 160));
      const v = await judge(f, String(j.result), ctx.judge, ctx.judgeDir);
      out.answers[f.id] = { answer: String(j.result), right: v.right === 'Y', cost: j.total_cost_usd || 0, input: usage(j) };
      ctx.spent += (j.total_cost_usd || 0) + v.cost;
    }
    ctx.spent += out.work.cost;
    return out;
  } finally {
    clean(dir);
    if (extra.cleanup) rmSync(extra.cleanup, { recursive: true, force: true });
  }
}

async function run() {
  const plugin = opt('--plugin');
  const rivals = opt('--rivals');
  const configs = opt('--only') ? [opt('--only')] : CONFIGS;
  const modes = opt('--mode') ? [opt('--mode')] : MODES;
  if (configs.some((c) => c.startsWith('atlas')) && (!plugin || !existsSync(join(plugin, 'hooks', 'atlas-auto.js')))) { console.error('--plugin <folder of the atlas-mem build> is required'); process.exit(2); }
  if (configs.includes('trail') && (!rivals || !existsSync(join(rivals, 'trail-pkg')))) { console.error('--rivals <folder with trail-pkg> is required'); process.exit(2); }
  const store = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { runs: {} };
  const jobs = [];
  for (const config of configs) for (const mode of modes) for (let r = 1; r <= Number(opt('--rounds', 2)); r += 1) if (!store.runs[`${config}.${mode}.${r}`]) jobs.push({ config, mode, r });
  if (has('--dry-run')) { console.log(`${jobs.length} conversations of ${TURNS.length + 1} turns, then ${FACTS.length} questions each.`); return; }
  const ctx = { plugin, rivals, model: opt('--model', 'claude-opus-5-5'), judge: opt('--judge', 'claude-sonnet-5-5'), spent: 0, judgeDir: mkdtempSync(join(tmpdir(), 'atlas-capture-judge-')) };
  if (configs.includes('atlas-auto')) ctx.auto = autoCopy(plugin);
  store.meta = { date: new Date().toISOString().slice(0, 10), model: ctx.model, judge: ctx.judge };
  const queue = [...jobs];
  await Promise.all(Array.from({ length: Number(opt('--parallel', 3)) }, async () => {
    while (queue.length) {
      const { config, mode, r } = queue.shift();
      try {
        store.runs[`${config}.${mode}.${r}`] = await one(config, mode, r, ctx);
        writeFileSync(FILE, JSON.stringify(store, null, 1));
        console.log(`${config} ${mode} ${r}: ${Object.values(store.runs[`${config}.${mode}.${r}`].answers).filter((a) => a.right).length} of ${FACTS.length}, reported cost so far $${ctx.spent.toFixed(2)}`);
      } catch (e) {
        console.log(`FAILED ${config} ${mode} ${r}: ${e.message}`);
      }
    }
  }));
  clean(ctx.judgeDir);
  if (ctx.auto) rmSync(ctx.auto, { recursive: true, force: true });
  console.log(`reported cost $${ctx.spent.toFixed(2)}`);
}

function report() {
  const store = JSON.parse(readFileSync(FILE, 'utf8'));
  const runs = Object.values(store.runs);
  console.log(`${store.meta.date}, ${store.meta.model}, judged by ${store.meta.judge}`);
  console.log('setup      | mode    | kept      | notes written | $ for the six turns | $ per later answer');
  for (const config of CONFIGS) for (const mode of MODES) {
    const list = runs.filter((r) => r.config === config && r.mode === mode);
    if (!list.length) continue;
    const answers = list.flatMap((r) => Object.values(r.answers));
    const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
    console.log(`${config.padEnd(10)} | ${mode.padEnd(7)} | ${answers.filter((a) => a.right).length} of ${answers.length} | ${avg(list.map((r) => r.notes)).toFixed(1)} | ${avg(list.map((r) => r.work.cost)).toFixed(3)} | ${avg(answers.map((a) => a.cost)).toFixed(3)}`);
  }
}

if (has('--report')) report(); else await run();
