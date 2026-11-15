#!/usr/bin/env node
// atlas-doctor — what is wrong with this install, read off the machine and never guessed.
//
//   `atlas doctor`   the checks below, one line each, `ok` or `WARN`
//   at session start each build writes its name in a small file of the session; a second
//                    build finding the first there says so once, because two builds inject
//                    the rules and the reminder twice and every turn pays double
//
// The checks: the builds loaded in this session; where this one runs from and how old its
// files are; a config file that cannot be parsed (a switch typed then is refused); `prune` on
// without the variable that lets it load; hooks of ATLAS left by hand in a settings file, which
// run beside the plugin's; a usage count that cannot be read; dials on in other projects, which
// outlive an uninstall. Nothing is changed and nothing is sent.
//
// The idea of a command that diagnoses its own install after Yeachan-Heo/oh-my-claudecode
// (MIT, `omc-doctor`). The checks and the code are ours.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const cfg = require('./atlas-config');

const ROOT = path.join(__dirname, '..');
const KEEP_MS = 2 * 24 * 3600 * 1000;
const marker = (session) => path.join(os.tmpdir(), `atlas-builds-${String(session).replace(/[^A-Za-z0-9-]/g, '')}.txt`);

function manifest(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8')); } catch (e) { return {}; }
}

/** The builds that started in this session, this one included: `[{ name, version, root }]`. */
function mark(session, root = ROOT) {
  if (!session) return [];
  const file = marker(session);
  const m = manifest(root);
  const mine = [m.name || 'atlas', m.version || '?', path.resolve(root)].join('\t');
  let lines = [];
  try { lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean); } catch (e) { lines = []; }
  if (!lines.includes(mine)) {
    try { fs.appendFileSync(file, mine + '\n'); lines.push(mine); } catch (e) { /* no marker, no check */ }
    sweep();
  }
  return builds(lines);
}

function builds(lines) {
  const seen = new Map();
  for (const l of lines) { const [name, version, root] = l.split('\t'); if (root && !seen.has(root)) seen.set(root, { name, version, root }); }
  return [...seen.values()];
}

function loaded(session) {
  if (!session) return [];
  try { return builds(fs.readFileSync(marker(session), 'utf8').split('\n').filter(Boolean)); } catch (e) { return []; }
}

// Markers of sessions long over: removed here, so the temp folder holds a few and not all.
function sweep(now = Date.now()) {
  try {
    for (const n of fs.readdirSync(os.tmpdir())) {
      if (!/^atlas-builds-[A-Za-z0-9-]*\.txt$/.test(n)) continue;
      const f = path.join(os.tmpdir(), n);
      try { if (now - fs.statSync(f).mtimeMs > KEEP_MS) fs.unlinkSync(f); } catch (e) { /* someone else's, or gone */ }
    }
  } catch (e) { /* nothing to sweep */ }
}

/** What the last build to arrive says at session start; '' when it is alone, or not the last. */
function twice(list, root = ROOT) {
  if (list.length < 2 || list[list.length - 1].root !== path.resolve(root)) return '';
  const names = list.map((b) => `${b.name} ${b.version}`).join(' and ');
  return `[ATLAS] ${list.length} ATLAS builds are loaded in this session: ${names}. Each injects the rules and the ` +
    'per-turn reminder, so every turn pays for them more than once. Tell the user this once, in one line, before ' +
    'anything else: keep one build (atlas-max holds everything the others do) and uninstall the rest; `atlas doctor` shows where each runs from.';
}

function parses(file) {
  if (!fs.existsSync(file)) return null;
  try { const v = JSON.parse(fs.readFileSync(file, 'utf8')); return v && typeof v === 'object' && !Array.isArray(v) ? v : false; } catch (e) { return false; }
}

function newest(dir) {
  let t = 0;
  try { for (const n of fs.readdirSync(dir)) { const s = fs.statSync(path.join(dir, n)); if (s.isFile() && s.mtimeMs > t) t = s.mtimeMs; } } catch (e) { /* unknown */ }
  return t ? new Date(t).toISOString().slice(0, 10) : 'unknown';
}

/** The lines `atlas doctor` prints. */
function report(input = {}, root = ROOT, env = process.env) {
  const out = [];
  const ok = (s) => out.push(`ok    ${s}`);
  const warn = (s) => out.push(`WARN  ${s}`);
  const m = manifest(root);

  const list = loaded(input.session_id);
  if (list.length > 1) warn(`${list.length} builds loaded together, the rules are injected ${list.length} times: ${list.map((b) => `${b.name} ${b.version} (${b.root})`).join('; ')}. Keep one`);
  else ok(`one build loaded: ${m.name || 'atlas'} ${m.version || '?'}`);
  ok(`runs from ${path.resolve(root)}, hook files last changed ${newest(path.join(root, 'hooks'))}, node ${process.versions.node}`);

  const user = path.join(cfg.claudeDir(), 'atlas.json');
  const u = parses(user);
  if (u === false) warn(`${user} cannot be parsed: a switch typed now is refused, and its settings are ignored`);
  else ok(u ? `${user} reads` : 'no ~/.claude/atlas.json (every switch off)');
  if (u && u.prune === true) {
    if (env.CLAUDE_CODE_ENABLE_FUNCTION_HOOKS === '1') ok('prune is on and function hooks are enabled');
    else warn('prune is on but CLAUDE_CODE_ENABLE_FUNCTION_HOOKS is not 1 here: the module is not loaded and a compaction stays a summary');
  }
  for (let dir = path.resolve(input.cwd || process.cwd()); ; dir = path.dirname(dir)) {
    const p = path.join(dir, '.atlas.json');
    if (fs.existsSync(p)) { if (parses(p) === false) warn(`${p} cannot be parsed: the project's defaults are ignored`); else ok(`${p} reads`); break; }
    if (path.dirname(dir) === dir) break;
  }

  // Hooks of ATLAS written by hand into a settings file run beside the plugin's own.
  const settings = [path.join(cfg.claudeDir(), 'settings.json'), path.join(path.resolve(input.cwd || process.cwd()), '.claude', 'settings.json'), path.join(path.resolve(input.cwd || process.cwd()), '.claude', 'settings.local.json')];
  const stray = settings.filter((f) => { try { return /atlas-(activate|tracker|guard|usage)\.js/.test(JSON.stringify(JSON.parse(fs.readFileSync(f, 'utf8')).hooks || {})); } catch (e) { return false; } });
  if (stray.length) warn(`ATLAS hooks are also registered by hand in ${stray.join(', ')}: they run a second time beside the plugin's`);
  else ok('no ATLAS hook registered by hand in a settings file');

  try {
    const usage = require('./atlas-usage');
    if (fs.existsSync(usage.file()) && !usage.read()) warn(`${usage.file()} cannot be read: nothing is counted until it is deleted`);
  } catch (e) { /* this build has no count */ }

  // Dials outlive an uninstall: the states live outside the plugin.
  let on = [];
  try {
    for (const n of fs.readdirSync(cfg.stateDir())) {
      if (!n.endsWith('.state')) continue;
      const s = cfg.parseState(fs.readFileSync(path.join(cfg.stateDir(), n), 'utf8'));
      if (s && !cfg.isAllOff(s)) on.push(n.slice(0, -6));
    }
  } catch (e) { on = []; }
  ok(on.length ? `dials are on in ${on.length} project${on.length === 1 ? '' : 's'} (they outlive an uninstall): ${on.slice(0, 8).join(', ')}${on.length > 8 ? ', …' : ''}` : 'no project has a dial on');
  if (fs.existsSync(cfg.legacyFlagPath())) warn(`${cfg.legacyFlagPath()} is a state file from an old layout and is no longer read: it can be deleted`);

  const n = out.filter((l) => l.startsWith('WARN')).length;
  out.push(n ? `${n} thing${n === 1 ? '' : 's'} to fix` : 'nothing to fix');
  return out.join('\n');
}

module.exports = { mark, loaded, twice, report, marker, sweep };
