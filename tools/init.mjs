#!/usr/bin/env node
/**
 * ATLAS — write the terse-answer rule into other agents' config files.
 *
 * ATLAS itself only works inside Claude Code. This puts an equivalent rule where
 * Cursor, Windsurf, Cline, Copilot and AGENTS.md-compatible agents will read it,
 * so a repository answers the same way whoever is working in it.
 *
 * Dry run by default: it prints what it would change and touches nothing.
 *
 * Usage:
 *   node tools/init.mjs               show what would change
 *   node tools/init.mjs --write       do it
 *   node tools/init.mjs --write --only cursor
 *   node tools/init.mjs --remove      take the block out again
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';

const BEGIN = '<!-- atlas:begin -->';
const END = '<!-- atlas:end -->';

// Kept deliberately short. This lands in files people already maintain, and a
// long block in someone else's config is an imposition, not a feature.
const RULE = `${BEGIN}
## Answering style

Say the substance, drop the packaging. Technical accuracy never yields to brevity.

The first line answers the question. One word when one word answers, then stop.
Nothing that greets, softens, hedges or restates the question. Answer what was asked, not what
sits next to it.
One item per line with no list marker; a heading only when there are three or more sections;
no tables unless the request names the shape.
No invented shorthand: a cut word costs the same tokens as the whole one and has to be decoded.
The word that flips a claim — not, never, only, unless — always stays.
Code, error strings, names, paths, numbers and units stay exactly as they are.
Code, commit messages, pull request bodies, docs and anything else that persists outside the
chat are written normally, never compressed.
Plain prose, always, for security warnings, credentials and anything irreversible.
Say when something is unverified. Disagree when warranted, with a reason and an alternative.
${END}`;

const TARGETS = [
  { id: 'cursor', file: '.cursorrules' },
  { id: 'windsurf', file: '.windsurfrules' },
  { id: 'cline', file: '.clinerules' },
  { id: 'copilot', file: join('.github', 'copilot-instructions.md') },
  { id: 'agents', file: 'AGENTS.md' },
];

function parseArgs(argv) {
  const o = { write: false, remove: false, only: null, dir: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--write') o.write = true;
    else if (argv[i] === '--remove') o.remove = true;
    else if (argv[i] === '--only') o.only = argv[++i];
    else if (argv[i] === '--dir') o.dir = argv[++i];
  }
  return o;
}

/** Replace an existing block, or append one. Never duplicates, never reorders. */
function apply(existing, remove) {
  const start = existing.indexOf(BEGIN);
  const stop = existing.indexOf(END);
  const has = start !== -1 && stop !== -1 && stop > start;

  if (remove) {
    if (!has) return { text: existing, action: 'nothing to remove' };
    const before = existing.slice(0, start).replace(/\n+$/, '\n');
    const after = existing.slice(stop + END.length).replace(/^\n+/, '');
    return { text: (before + after).trim() + '\n', action: 'removed' };
  }

  if (has) {
    const current = existing.slice(start, stop + END.length);
    if (current === RULE) return { text: existing, action: 'already current' };
    return { text: existing.slice(0, start) + RULE + existing.slice(stop + END.length), action: 'updated' };
  }
  return { text: existing ? existing.replace(/\n*$/, '\n\n') + RULE + '\n' : RULE + '\n', action: 'added' };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const targets = args.only ? TARGETS.filter((t) => t.id === args.only) : TARGETS;
  if (!targets.length) {
    console.error(`Unknown target. Known: ${TARGETS.map((t) => t.id).join(', ')}`);
    process.exit(1);
  }

  console.log(args.write ? '' : '\nDry run. Nothing written. Add --write to apply.\n');

  for (const t of targets) {
    const path = join(args.dir, t.file);
    const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
    // With --write the file is created even where the repository does not use that
    // agent: the simplest way to switch it on everywhere in one go. The guard below
    // applies only to --remove, where taking a rule out of a file that does not
    // exist makes no sense. Whoever does not want all five files uses --only.
    if (!existing && args.remove) {
      console.log(`${t.id.padEnd(9)} ${t.file.padEnd(34)} absent`);
      continue;
    }
    const { text, action } = apply(existing, args.remove);
    console.log(`${t.id.padEnd(9)} ${t.file.padEnd(34)} ${action}`);
    if (args.write && text !== existing) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text);
    }
  }
  console.log('');
}

main();
