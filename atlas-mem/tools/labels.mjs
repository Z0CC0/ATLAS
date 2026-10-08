#!/usr/bin/env node
/**
 * labels — a small table of verdicts on code, and the lookup that attaches them to a
 * search result. Code is never deleted: it is labelled, and the label travels with every
 * grep that finds the symbol (hooks/atlas-labels.js), so a superseded function cannot be
 * found without the warning on it.
 *
 *   node labels.mjs set    <vault> <symbol> <LABEL> --why "<reason>" [--to <symbol>] [--file <f>] [--project <p>]
 *   node labels.mjs unset  <vault> <symbol> [--file <f>]
 *   node labels.mjs list   <vault> [--json]
 *   node labels.mjs lookup <vault> <text...>          (or the text on stdin)
 *   node labels.mjs vault  [<cwd>]                    where the hook would look
 *
 * Six labels, fixed:
 *   CANONICAL     the reference version across projects; copy from here
 *   PREFERRED     among equivalent variants, this one
 *   SUPERSEDED    replaced by another; needs --to, a SUPERSEDED without a successor is refused
 *   WRONG         tried, does not work; the reason is the value
 *   FRAGILE       works under conditions; read before touching
 *   EXPERIMENTAL  not yet proven in real use
 *
 * The table lives in `<vault>/.atlas/labels.json`. The hook finds the vault through the
 * nearest `.atlas.json` (`"vault": "<path>"`) at or above the working directory, then
 * `~/.claude/atlas.json`, then the Claude Code memory folder of that directory.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LABELS = ['CANONICAL', 'PREFERRED', 'SUPERSEDED', 'WRONG', 'FRAGILE', 'EXPERIMENTAL'];
const SYMBOL = /^[A-Za-z_$][\w$.-]*$/;

const tablePath = (vault) => join(vault, '.atlas', 'labels.json');

function load(vault) {
  const p = tablePath(vault);
  if (!existsSync(p)) return { version: 1, labels: [] };
  try {
    const t = JSON.parse(readFileSync(p, 'utf8'));
    if (!t || !Array.isArray(t.labels)) return { version: 1, labels: [] };
    // a hand-edited row without a symbol or a label is skipped, not a crash
    t.labels = t.labels.filter((e) => e && typeof e.symbol === 'string' && typeof e.label === 'string');
    return t;
  } catch { return { version: 1, labels: [] }; }
}

function save(vault, table) {
  mkdirSync(join(vault, '.atlas'), { recursive: true });
  writeFileSync(tablePath(vault), JSON.stringify(table, null, 2) + '\n');
}

const same = (a, b) => a.symbol === b.symbol && (a.file || '') === (b.file || '');

/** Writes or replaces the label of a symbol. Refuses what would mislead later. */
function set(vault, symbol, label, { why, to, file, project } = {}) {
  if (!SYMBOL.test(symbol || '')) throw new Error(`"${symbol}" is not a symbol name`);
  const L = String(label || '').toUpperCase();
  if (!LABELS.includes(L)) throw new Error(`"${label}" is not a label; the six are ${LABELS.join(', ')}`);
  if (!why || !why.trim()) throw new Error('--why is required: a label without its reason is the first thing to be doubted later');
  if (L === 'SUPERSEDED' && !to) throw new Error('SUPERSEDED needs --to <symbol>: a superseded symbol without its successor is a dead end');
  if (to && !SYMBOL.test(to)) throw new Error(`"${to}" is not a symbol name`);
  const table = load(vault);
  const entry = { symbol, label: L, why: why.trim(), when: new Date().toISOString().slice(0, 10) };
  if (file) entry.file = file.replace(/\\/g, '/');
  if (project) entry.project = project;
  if (to) entry.to = to;
  const i = table.labels.findIndex((e) => same(e, entry));
  if (i >= 0) table.labels[i] = entry; else table.labels.push(entry);
  save(vault, table);
  return `${i >= 0 ? 'replaced' : 'labelled'}  ${describe(entry)}`;
}

function unset(vault, symbol, { file } = {}) {
  const table = load(vault);
  const before = table.labels.length;
  table.labels = table.labels.filter((e) => !same(e, { symbol, file: file ? file.replace(/\\/g, '/') : '' }) && !(e.symbol === symbol && !file));
  if (table.labels.length === before) return `nothing   no label on ${symbol}`;
  save(vault, table);
  return `removed   ${before - table.labels.length} label(s) on ${symbol}`;
}

/** One line a reader can act on: what it is, since when, what to use instead, why. */
function describe(e) {
  const where = [e.project, e.file].filter(Boolean).join(', ');
  const head = `${e.symbol}${where ? ` (${where})` : ''} is ${e.label} since ${e.when}`;
  const next = e.to ? `: use ${e.to} instead` : '';
  return `${head}${next}. Why: ${e.why}`;
}

/** The labelled symbols a text mentions, as whole words, each once. */
function lookup(vault, text) {
  const table = load(vault);
  if (!table.labels.length || !text) return [];
  const hits = [];
  for (const e of table.labels) {
    const re = new RegExp(`(?<![\\w$])${e.symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w$])`);
    if (re.test(text)) hits.push(e);
  }
  return hits;
}

function list(vault) {
  const table = load(vault);
  return table.labels.slice().sort((a, b) => a.label.localeCompare(b.label) || a.symbol.localeCompare(b.symbol));
}

const readJson = (p) => { try { const v = JSON.parse(readFileSync(p, 'utf8')); return v && typeof v === 'object' ? v : null; } catch { return null; } };

/** Where the vault is for a working directory, or null. The same rule the hook follows. */
function vaultFor(cwd = process.cwd()) {
  let dir = resolve(cwd);
  for (;;) {
    const c = readJson(join(dir, '.atlas.json'));
    if (c && typeof c.vault === 'string') return resolve(dir, c.vault);
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const user = readJson(join(homedir(), '.claude', 'atlas.json'));
  if (user && typeof user.vault === 'string') return resolve(user.vault);
  const auto = join(homedir(), '.claude', 'projects', resolve(cwd).replace(/[^A-Za-z0-9]/g, '-'), 'memory');
  return existsSync(auto) ? auto : null;
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const opt = (k) => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : undefined; };
  const pos = rest.filter((a, i) => !a.startsWith('--') && !['--why', '--to', '--file', '--project'].includes(rest[i - 1]));
  switch (cmd) {
    case 'set': return set(pos[0], pos[1], pos[2], { why: opt('--why'), to: opt('--to'), file: opt('--file'), project: opt('--project') });
    case 'unset': return unset(pos[0], pos[1], { file: opt('--file') });
    case 'list': {
      const rows = list(pos[0]);
      if (rest.includes('--json')) return JSON.stringify(rows, null, 2);
      return rows.length ? rows.map(describe).join('\n') : 'no labels';
    }
    case 'lookup': {
      const text = pos.slice(1).join(' ') || readFileSync(0, 'utf8');
      const hits = lookup(pos[0], text);
      return hits.length ? hits.map(describe).join('\n') : 'no labelled symbol in the text';
    }
    case 'vault': return vaultFor(pos[0]) || 'no vault for this directory';
    default: throw new Error('usage: labels.mjs set|unset|list|lookup|vault …');
  }
}

export { LABELS, set, unset, list, lookup, describe, vaultFor, load, tablePath, main };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const out = main(process.argv.slice(2));
    if (out) process.stdout.write(out + '\n');
  } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exitCode = 1;
  }
}
