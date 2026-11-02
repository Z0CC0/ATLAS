#!/usr/bin/env node
/**
 * ATLAS — the fixed cost of each build, read from the build itself.
 *
 * No figure is written in here: descriptions come from the frontmatter of each build folder, the rules and
 * the reminder from what the hooks really print. Two rulers, never mixed:
 *   counted: tiktoken o200k_base, the ruler of every earlier figure in the README
 *   billed:  input of a one-turn call with the build on, minus the same call with no plugin
 *
 * Usage:
 *   node costi-fissi.mjs                  counted only, spends nothing
 *   node costi-fissi.mjs --billed         also one call per build and level
 *   node costi-fissi.mjs --model <id>     model of the billed calls (default claude-haiku-5-5)
 *   node costi-fissi.mjs --json
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const BUILDS = ['atlas', 'atlas-min', 'atlas-code', 'atlas-mem', 'atlas-max'];
const argv = process.argv.slice(2);
const opt = (name, fallback) => { const i = argv.indexOf(name); return i < 0 ? fallback : argv[i + 1]; };

/** tiktoken cl100k over many strings in one process. */
function counted(texts) {
  const py = 'import json,sys,tiktoken;e=tiktoken.get_encoding("o200k_base");print(json.dumps([len(e.encode(t,disallowed_special=())) for t in json.loads(sys.stdin.buffer.read().decode("utf8"))]))';
  return JSON.parse(execFileSync('python', ['-c', py], { input: JSON.stringify(texts), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
}

/** name and description as YAML reads them: folded scalars joined, quotes off. */
function frontmatter(file) {
  const m = readFileSync(file, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const lines = m[1].split(/\r?\n/);
  const field = (key) => {
    const i = lines.findIndex((l) => l.startsWith(`${key}:`));
    if (i < 0) return '';
    const head = lines[i].slice(key.length + 1).trim();
    if (!/^[>|]-?$/.test(head)) return head.replace(/^(["'])(.*)\1$/, '$2');
    const body = [];
    for (let j = i + 1; j < lines.length && (/^\s/.test(lines[j]) || !lines[j].trim()); j++) body.push(lines[j].trim());
    return body.join(' ').trim();
  };
  return { name: field('name'), description: field('description') };
}

/** Every described item: what the model is shown in every chat whether or not it is used. */
function items(root) {
  const out = [];
  const skills = join(root, 'skills');
  if (existsSync(skills)) for (const d of readdirSync(skills)) { const f = join(skills, d, 'SKILL.md'); if (existsSync(f)) out.push({ kind: 'skill', id: d, ...frontmatter(f) }); }
  for (const [dir, kind] of [['commands', 'command'], ['agents', 'agent']]) {
    const p = join(root, dir);
    if (existsSync(p)) for (const f of readdirSync(p).filter((x) => x.endsWith('.md'))) out.push({ kind, id: f.slice(0, -3), ...frontmatter(join(p, f)) });
  }
  return out;
}

/** Runs a hook of the build in `env`, and returns what it injects. */
function run(root, script, env, input) {
  const r = spawnSync('node', [join(root, 'hooks', script)], { input: JSON.stringify(input), encoding: 'utf8', env: { ...process.env, CLAUDE_PLUGIN_ROOT: root, ...env } });
  const out = r.stdout.trim();
  try { return JSON.parse(out).hookSpecificOutput?.additionalContext ?? out; } catch { return out; }
}

/** Rules and reminder at a level, switched on as a user does: a fresh install is off and ignores ATLAS_MODE. Private HOME, so no state of the user is touched. */
function injected(root, level) {
  const home = mkdtempSync(join(tmpdir(), 'atlas-costi-'));
  const env = { HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: join(home, '.claude') };
  try {
    run(root, 'atlas-tracker.js', env, { cwd: home, hook_event_name: 'UserPromptSubmit', prompt: `atlas ${level}` });
    return {
      rules: run(root, 'atlas-activate.js', env, { cwd: home, hook_event_name: 'SessionStart', source: 'startup' }),
      reminder: run(root, 'atlas-tracker.js', env, { cwd: home, hook_event_name: 'UserPromptSubmit', prompt: 'ok' }),
    };
  } finally { rmSync(home, { recursive: true, force: true }); }
}

/** Input of one turn, every kind of input token. */
function turn(cwd, model, pluginDir) {
  const args = ['-p', 'ok', '--model', model, '--output-format', 'json', '--setting-sources', 'project', '--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}'];
  if (pluginDir) args.push('--plugin-dir', pluginDir);
  const win = process.platform === 'win32';
  const r = spawnSync('claude', win ? args.map((a) => `"${a.replace(/"/g, '\\"')}"`) : args, { cwd, shell: win, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, env: { ...process.env, CAVEMAN_DEFAULT_MODE: 'off' } });
  const res = JSON.parse(r.stdout);
  // An expired login answers with valid JSON and zero tokens: a difference of zeros looks like data.
  if (res.is_error || !res.usage?.input_tokens && !res.usage?.cache_read_input_tokens) throw new Error(`the call failed: ${String(res.result).slice(0, 200)}. Try: claude auth status`);
  const u = res.usage;
  return u.input_tokens + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
}

const version = JSON.parse(readFileSync(join(REPO, 'atlas', 'package.json'), 'utf8')).version;
const rows = {};
for (const b of BUILDS) {
  const root = join(REPO, b);
  if (!existsSync(root)) throw new Error(`no build folder at ${root}`);
  const it = items(root);
  const empty = it.filter((x) => !x.description).map((x) => x.id);
  const [descOnly, withName] = [it.map((x) => x.description), it.map((x) => `${x.name || x.id}: ${x.description}`)].map((list) => counted(list).reduce((a, n) => a + n, 0));
  const texts = {};
  for (const level of ['low', 'high']) {
    const got = injected(root, level);
    texts[`rules_${level}`] = got.rules;
    texts[`rem_${level}`] = got.reminder;
  }
  const keys = Object.keys(texts);
  const n = counted(keys.map((k) => texts[k]));
  rows[b] = { items: it.length, skills: it.filter((x) => x.kind === 'skill').length, commands: it.filter((x) => x.kind === 'command').length, agents: it.filter((x) => x.kind === 'agent').length, empty, desc: descOnly, descWithName: withName };
  keys.forEach((k, i) => { rows[b][k] = n[i]; });
}

if (argv.includes('--billed')) {
  const model = opt('--model', 'claude-haiku-5-5');
  const cwd = mkdtempSync(join(tmpdir(), 'atlas-billed-'));
  // Not `--settings {"enabledPlugins":{}}`: settings merge, so that leaves every installed plugin on,
  // hooks included. Only leaving the user's settings out gives a call with no plugin at all.
  const none = turn(cwd, model, null);
  rows._billed = { model, none };
  for (const b of BUILDS) {
    const root = join(REPO, b);
    // The state file of this throwaway folder, the only one the switch writes.
    const billed = { off: turn(cwd, model, root) - none };
    for (const level of ['low', 'high']) {
      run(root, 'atlas-tracker.js', {}, { cwd, hook_event_name: 'UserPromptSubmit', prompt: `atlas ${level}` });
      billed[level] = turn(cwd, model, root) - none;
    }
    if (b === 'atlas') {
      for (const level of ['low', 'high']) {
        for (const dials of [['ask'], ['check'], ['ask', 'check']]) {
          run(root, 'atlas-tracker.js', {}, { cwd, hook_event_name: 'UserPromptSubmit', prompt: `atlas ${level}` });
          for (const dial of ['ask', 'check']) run(root, 'atlas-tracker.js', {}, { cwd, hook_event_name: 'UserPromptSubmit', prompt: dials.includes(dial) ? `atlas ${dial}` : `atlas ${dial} off` });
          billed[`${level}-${dials.join('-')}`] = turn(cwd, model, root) - none;
        }
      }
      for (const dial of ['ask', 'check']) run(root, 'atlas-tracker.js', {}, { cwd, hook_event_name: 'UserPromptSubmit', prompt: `atlas ${dial} off` });
    }
    run(root, 'atlas-tracker.js', {}, { cwd, hook_event_name: 'UserPromptSubmit', prompt: 'atlas off' });
    rows._billed[b] = billed;
  }
  rmSync(cwd, { recursive: true, force: true });
}

if (argv.includes('--json')) { console.log(JSON.stringify({ version, rows }, null, 2)); process.exit(0); }
console.log(`ATLAS ${version}, read from the build folders. Counted with tiktoken o200k_base.`);
for (const b of BUILDS) {
  const r = rows[b];
  console.log(`${b.padEnd(12)} ${r.skills} skills ${r.commands} commands ${r.agents} agents | desc ${r.desc} (with names ${r.descWithName}) | rules ${r.rules_low}/${r.rules_high} | reminder ${r.rem_low}/${r.rem_high}${r.empty.length ? ` | EMPTY: ${r.empty}` : ''}`);
}
if (rows._billed) {
  console.log(`\nBilled on ${rows._billed.model}, one turn minus no plugin (${rows._billed.none}):`);
  for (const b of BUILDS) console.log(`${b.padEnd(12)} ${Object.entries(rows._billed[b]).map(([k, v]) => `${k} ${v}`).join(' | ')}`);
}
