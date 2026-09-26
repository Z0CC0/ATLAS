#!/usr/bin/env node
// ATLAS — shared state and configuration.
//
// Two independent dials, deliberately not one scale:
//   level  : off | low | high          — how compressed the output is
//   rigour : off | ask                   — whether the goal is clarified before starting
//   check  : off | on                    — how hard a claim is tested before it is stated
//   silent : off | on                    — whether the work is handed over without a report
//
// All persist until changed. `ask` inherits whatever level is active, so no
// command ever needs more than two words and no combined names exist.
//
// `silent` is a dial and not only a skill on purpose. A skill has to be invoked
// on the turn it is named, and a mode that depends on being remembered is a mode
// that will be answered "on" and then not applied. A dial is written to the flag
// file and re-stated every turn by the tracker, so it holds at turn fifty.
//
// State lives in one flag file, "<level>:<rigour>:<check>:<silent>" (e.g.
// "high:ask:on:off"). Shorter values from older versions still read, with the
// missing dials defaulting to off.
//
// Everything here fails silently. A hook that throws must never break a session.

const fs = require('fs');
const path = require('path');
const os = require('os');

const LEVELS = ['off', 'low', 'high'];
const RIGOURS = ['off', 'ask'];
const CHECKS = ['off', 'on'];
const SILENTS = ['off', 'on'];

// What a command that names no dial means: `atlas` alone, "enable atlas".
// `low` keeps sentences whole, so switching on without saying how far is the
// gentle step. A fresh install is not this — it is off until told otherwise.
const DEFAULT_STATE = { level: 'low', rigour: 'off', check: 'off', silent: 'off' };

// Longest legitimate value is "high:ask:on:on" (14 bytes). 64 leaves slack
// without turning the flag into a channel for arbitrary content — see readState.
const MAX_FLAG_BYTES = 64;

function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

function flagPath() {
  return path.join(claudeDir(), '.atlas-state');
}

function termsPath() {
  return path.join(claudeDir(), 'atlas-terms.txt');
}

// ---------------------------------------------------------------------------
// The state file.
//
// Its content is read on every turn and reaches the model, so two rules apply
// to it and to nothing else in this plugin. The content is never trusted: it
// is matched against a fixed vocabulary and anything else reads as "no state".
// And the path is never followed through a link: a state file that is itself a
// link, or that sits in a directory resolving outside the user's own home, is
// treated as absent. Otherwise whoever can plant a link there decides what the
// model is told each turn.
// ---------------------------------------------------------------------------

// The directory the state file lives in, resolved, or null when it resolves to
// somewhere that is not the current user's. A linked ~/.claude is a normal
// setup (another drive, a shared config) and is allowed when the target is
// theirs: same uid where uids exist, under the home directory on Windows.
function ownedDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const real = fs.realpathSync(dir);
    const st = fs.statSync(real);
    if (!st.isDirectory()) return null;
    if (real === path.resolve(dir)) return real;
    if (typeof process.getuid === 'function') return st.uid === process.getuid() ? real : null;
    const home = path.resolve(os.homedir()).toLowerCase();
    const r = real.toLowerCase();
    return r === home || r.startsWith(home + path.sep) ? real : null;
  } catch (e) {
    return null;
  }
}

// True for a regular file that is not a link and not larger than `limit`.
// A missing file is false, so callers need no separate existence check.
function isPlainFile(p, limit) {
  try {
    const st = fs.lstatSync(p);
    return st.isFile() && (limit === undefined || st.size <= limit);
  } catch (e) {
    return false;
  }
}

const NOFOLLOW = fs.constants.O_NOFOLLOW || 0;

function writeFlag(content) {
  const dir = ownedDir(path.dirname(flagPath()));
  if (!dir) return false;
  const target = path.join(dir, path.basename(flagPath()));
  if (fs.existsSync(target) && !isPlainFile(target)) return false;

  // Written beside the target and renamed over it: a reader on another turn
  // sees the old state or the new one, never a half-written file. `wx` refuses
  // to open anything that already exists at the temporary path, link included.
  const temp = `${target}.${process.pid}.new`;
  try {
    fs.writeFileSync(temp, String(content), { flag: 'wx', mode: 0o600 });
    fs.renameSync(temp, target);
    return true;
  } catch (e) {
    try { fs.unlinkSync(temp); } catch (e2) { /* nothing to clean */ }
    return false;
  }
}

function readFlagRaw() {
  const p = flagPath();
  if (!isPlainFile(p, MAX_FLAG_BYTES)) return null;
  try {
    return fs.readFileSync(p, { encoding: 'utf8', flag: fs.constants.O_RDONLY | NOFOLLOW });
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function parseState(raw) {
  if (typeof raw !== 'string') return null;
  const [l0, r, c, s] = raw.trim().toLowerCase().split(':');
  const l = l0;
  if (!LEVELS.includes(l)) return null;
  return {
    level: l,
    rigour: RIGOURS.includes(r) ? r : 'off',
    check: CHECKS.includes(c) ? c : 'off',
    silent: SILENTS.includes(s) ? s : 'off',
  };
}

function formatState(state) {
  return `${state.level}:${state.rigour}:${state.check || 'off'}:${state.silent || 'off'}`;
}

// True when no dial is on. The one place this is decided: the tracker asked
// "are the first three off" while the fourth was being switched on, and turned
// `atlas silent` from a cold start into `atlas off`.
function isAllOff(state) {
  return !state
    || (state.level === 'off' && state.rigour === 'off' && state.check === 'off' && state.silent !== 'on');
}

/** Current state, or null when ATLAS has never been set in this profile. */
function readState() {
  return parseState(readFlagRaw());
}

function writeState(state) {
  return writeFlag(formatState(state));
}

function clearState() {
  try {
    fs.unlinkSync(flagPath());
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * State to use when the flag is absent: project config, then user config,
 * then the built-in default. Env var wins over everything, for scripted runs.
 */
function defaultState() {
  const env = parseState(process.env.ATLAS_MODE || '');
  if (env) return env;

  const fromProject = readConfigFile(findProjectConfig(process.cwd()));
  if (fromProject) return fromProject;

  const fromUser = readConfigFile(path.join(claudeDir(), 'atlas.json'));
  if (fromUser) return fromUser;

  return { ...DEFAULT_STATE };
}

function readConfigFile(p) {
  if (!p) return null;
  try {
    const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
    const raw = String(cfg.level).toLowerCase();
    const level = LEVELS.includes(raw) ? raw : null;
    const rigour = RIGOURS.includes(String(cfg.rigour).toLowerCase()) ? String(cfg.rigour).toLowerCase() : 'off';
    const check = CHECKS.includes(String(cfg.check).toLowerCase()) ? String(cfg.check).toLowerCase() : 'off';
    const silent = SILENTS.includes(String(cfg.silent).toLowerCase()) ? String(cfg.silent).toLowerCase() : 'off';
    return level ? { level, rigour, check, silent } : null;
  } catch (e) {
    return null;
  }
}

// The nearest .atlas.json at or above `start`, so a project can pin its own
// default without touching anyone's user config. Every ancestor is listed
// first and then checked, which keeps the loop finite whatever the mounts do.
function findProjectConfig(start) {
  let here;
  try { here = path.resolve(start || process.cwd()); } catch (e) { return null; }
  const ancestors = [here];
  while (path.dirname(ancestors[ancestors.length - 1]) !== ancestors[ancestors.length - 1] && ancestors.length < 64) {
    ancestors.push(path.dirname(ancestors[ancestors.length - 1]));
  }
  const found = ancestors.map((d) => path.join(d, '.atlas.json')).find((p) => isPlainFile(p));
  return found || null;
}

/**
 * User-defined untouchable terms, one per line. Ships empty on purpose: the
 * published plugin must not carry anyone's project names. Lines starting with
 * # are comments.
 */
function readTerms() {
  try {
    return fs
      .readFileSync(termsPath(), 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .slice(0, 200); // a runaway file must not flood the context
  } catch (e) {
    return [];
  }
}

module.exports = {
  LEVELS,
  RIGOURS,
  CHECKS,
  SILENTS,
  DEFAULT_STATE,
  claudeDir,
  flagPath,
  termsPath,
  parseState,
  formatState,
  isAllOff,
  readState,
  writeState,
  clearState,
  defaultState,
  readTerms,
};
