#!/usr/bin/env node
// ATLAS — SessionStart hook.
//
// Reads the active state, injects only the rules that apply to it, and stops.
// Nothing else: no nudges, no requests, no messages sent on the plugin's behalf
// through the assistant's voice.

const fs = require('fs');
const path = require('path');
const cfg = require('./atlas-config');

/**
 * Keeps the blocks marked for `active` and removes every other marked block.
 * Markers look like <!-- level:full --> ... <!-- /level:full -->.
 * Unmarked text always survives.
 */
function filterBlocks(text, kind, active) {
  const re = new RegExp(`<!--\\s*${kind}:([a-z]+)\\s*-->([\\s\\S]*?)<!--\\s*/${kind}:\\1\\s*-->\\n?`, 'g');
  return text.replace(re, (_, name, body) => (name === active ? body : ''));
}

// Rules that only exist to protect a level from its own aggression should not be
// paid for by a level that is not aggressive. `<!-- from:high -->` injects a block
// at that level and every harder one, so light compression carries light rules.
const ORDER = ['off', 'low', 'high'];

function filterByLevelFloor(text, active) {
  const rank = ORDER.indexOf(active);
  // Same construction as filterBlocks above, deliberately: a regex literal with a
  // backreference has been mangled by tooling more than once in this file.
  const re = new RegExp(`<!--\\s*from:([a-z]+)\\s*-->([\\s\\S]*?)<!--\\s*/from:\\1\\s*-->\\n?`, 'g');
  return text.replace(re, (_, floor, body) => (rank >= ORDER.indexOf(floor) ? body : ''));
}

function stripFrontmatter(text) {
  return text.replace(/^---[\s\S]*?\n---\s*/, '');
}

function findSkill() {
  const candidates = [];
  if (process.env.CLAUDE_PLUGIN_ROOT) {
    candidates.push(path.join(process.env.CLAUDE_PLUGIN_ROOT, 'skills', 'atlas', 'SKILL.md'));
  }
  candidates.push(
    path.join(__dirname, '..', 'skills', 'atlas', 'SKILL.md'),
    path.join(__dirname, 'skills', 'atlas', 'SKILL.md')
  );
  for (const c of candidates) {
    try {
      return fs.readFileSync(c, 'utf8');
    } catch (e) { /* try next */ }
  }
  return null;
}

function build(state) {
  const raw = findSkill();
  if (!raw) {
    // No fallback ruleset written into the code. A silently degraded ruleset is
    // worse than none: it looks like it is working. Say what is wrong instead.
    return 'ATLAS installed but skills/atlas/SKILL.md was not found. Rules are NOT active. Reinstall the plugin.';
  }

  let body = stripFrontmatter(raw);

  // Compression off but another dial on: only that dial's rules go in. The rest
  // of the file is the compression ruleset, and injecting it under a header that
  // says "compression: off" told the model two things at once.
  if (state.level === 'off') {
    const gated = /<!--\s*(rigour|check|silent):([a-z]+)\s*-->([\s\S]*?)<!--\s*\/\1:\2\s*-->/g;
    body = '';
    for (const m of raw.matchAll(gated)) {
      if (state[m[1]] === m[2]) body += m[3] + '\n';
    }
  }

  body = filterBlocks(body, 'level', state.level);
  body = filterByLevelFloor(body, state.level);
  body = filterBlocks(body, 'rigour', state.rigour);
  body = filterBlocks(body, 'check', state.check || 'off');
  body = filterBlocks(body, 'silent', state.silent || 'off');
  // `beyond-compression` marks the sections the minimal build strips at package
  // time. At runtime they are ordinary rules, so only the markers go.
  body = body.replace(/<!--\s*\/?beyond-compression\s*-->\n?/g, '');
  body = body.replace(/\n{3,}/g, '\n\n').trim();

  const header =
    `ATLAS ACTIVE — compression: ${state.level} · rigour: ${state.rigour} · check: ${state.check || 'off'} · silent: ${state.silent || 'off'}\n` +
    `Switch with atlas <low|high>, atlas ask, atlas check, atlas silent, atlas off.\n\n`;

  const terms = cfg.readTerms();
  const termBlock = terms.length
    ? `\n\n## Untouchable terms\n\nNever compressed, never translated, never abbreviated:\n${terms.map((t) => `\`${t}\``).join(' · ')}\n`
    : '';

  return header + body + termBlock;
}

// Shown once, on the first session after installing, and never again: the state
// file it writes is `off`, so the next session takes the silent path below.
const FIRST_RUN =
  'ATLAS is installed and doing nothing yet. It stays off until you switch it on:\n' +
  '`atlas low` shorter answers · `atlas high` half the words · `atlas help` the full card.';

function main() {
  const state = cfg.readState();

  // No state file means OFF, not "on at the default".
  //
  // It used to mean the default, and that was wrong in both directions. A fresh
  // install started rewriting every answer before anyone asked it to — the one
  // thing a plugin that changes how you are spoken to must not do. And `atlas
  // off` cleared the file, so switching it off lasted exactly until the next
  // restart, when the absent file was read as the default again and it came
  // back on by itself.
  if (!state) {
    cfg.writeState({ level: 'off', rigour: 'off', check: 'off', silent: 'off' });
    process.stdout.write(FIRST_RUN);
    return;
  }

  if (cfg.isAllOff(state)) {
    process.stdout.write('');
    return;
  }

  process.stdout.write(build(state));
}

if (require.main === module) main();

module.exports = { filterBlocks, filterByLevelFloor, stripFrontmatter, build };
