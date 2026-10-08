#!/usr/bin/env node
// atlas-labels — PostToolUse on Grep and Read. When a result names a symbol that
// carries a label (SUPERSEDED, WRONG, CANONICAL, …), the label is attached to the
// result as additional context. It never removes or changes a result: the point is
// not to hide the old code but to make it impossible to find without the warning.
//
// The labels live in `<vault>/.atlas/labels.json`, written by `tools/labels.mjs`.
// The vault is found the same way that tool finds it: the nearest `.atlas.json`
// with `"vault"` at or above the working directory, then `~/.claude/atlas.json`,
// then the Claude Code memory folder of the working directory. No vault, no
// labels: the hook is silent and costs one failed stat.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_LINES = 8;

function readJson(file) {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function vaultFor(cwd) {
  let dir = path.resolve(cwd || process.cwd());
  for (;;) {
    const c = readJson(path.join(dir, '.atlas.json'));
    if (c && typeof c.vault === 'string') return path.resolve(dir, c.vault);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const user = readJson(path.join(os.homedir(), '.claude', 'atlas.json'));
  if (user && typeof user.vault === 'string') return path.resolve(user.vault);
  const auto = path.join(os.homedir(), '.claude', 'projects', path.resolve(cwd || process.cwd()).replace(/[^A-Za-z0-9]/g, '-'), 'memory');
  return fs.existsSync(auto) ? auto : null;
}

// The text a result carries, whatever shape the tool gave it.
function textOf(value, depth) {
  if (typeof value === 'string') return value;
  if (!value || depth > 4) return '';
  if (Array.isArray(value)) return value.map((v) => textOf(v, depth + 1)).join('\n');
  if (typeof value === 'object') return Object.values(value).map((v) => textOf(v, depth + 1)).join('\n');
  return '';
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function describe(e) {
  const where = [e.project, e.file].filter(Boolean).join(', ');
  const head = `${e.symbol}${where ? ` (${where})` : ''} is ${e.label} since ${e.when}`;
  return `${head}${e.to ? `: use ${e.to} instead` : ''}. Why: ${e.why}`;
}

function respond(input) {
  if (input.tool_name !== 'Grep' && input.tool_name !== 'Read') return null;
  const vault = vaultFor(input.cwd);
  if (!vault) return null;
  const table = readJson(path.join(vault, '.atlas', 'labels.json'));
  if (!table || !Array.isArray(table.labels) || !table.labels.length) return null;
  const text = textOf(input.tool_response, 0) + '\n' + textOf(input.tool_input, 0);
  const hits = [];
  for (const e of table.labels) {
    if (!e || typeof e.symbol !== 'string') continue;
    if (new RegExp(`(?<![\\w$])${escape(e.symbol)}(?![\\w$])`).test(text)) hits.push(e);
  }
  if (!hits.length) return null;
  const lines = hits.slice(0, MAX_LINES).map(describe);
  if (hits.length > MAX_LINES) lines.push(`… and ${hits.length - MAX_LINES} more labelled symbols in this result`);
  return {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext: `ATLAS labels on this result:\n${lines.join('\n')}`,
    },
  };
}

function main() {
  if (process.stdin.isTTY) return;
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { raw += chunk; });
  process.stdin.on('end', () => {
    let input;
    try { input = JSON.parse(raw); } catch { return; }
    let out = null;
    try { out = respond(input || {}); } catch { return; }
    if (out) process.stdout.write(JSON.stringify(out));
  });
}

if (require.main === module) main();
module.exports = { respond, vaultFor };
