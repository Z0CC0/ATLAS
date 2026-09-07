#!/usr/bin/env node
/**
 * ATLAS — runs a tidy-up plan, and knows how to undo it.
 *
 * The judgment about which files to select is not here: the model does that, by
 * looking at the files and writing a plan. This is only the mechanical part, and it is
 * mechanical on purpose — moving files is the one place where a mistake does not
 * correct itself, so it must not depend on how a command happened to be typed.
 *
 * Three guarantees, and they are why this file exists instead of a series of
 * improvised `mv` commands:
 *
 *   - nothing moves before what would move has been printed
 *   - every applied run leaves a manifest, and the manifest undoes it
 *   - nothing is ever actually deleted: system Recycle Bin or a set-aside folder
 *
 * The third is not excessive caution. The selector is a model looking at images and
 * sometimes getting it wrong; a wrong selection followed by deletion destroys a photo
 * for good, and no accuracy figure justifies that.
 *
 * Plan format:
 *   {
 *     "source": "C:/Users/you/Desktop/photos",
 *     "criterion": "keep the photos showing a person",
 *     "actions": [
 *       { "file": "a.jpg", "do": "copy", "to": "C:/.../chosen" },
 *       { "file": "b.jpg", "do": "move", "to": "C:/.../chosen" },
 *       { "file": "c.jpg", "do": "aside" },
 *       { "file": "d.jpg", "do": "bin" }
 *     ]
 *   }
 *
 * Usage:
 *   node organize.mjs --plan plan.json            print, touch nothing
 *   node organize.mjs --plan plan.json --apply    run it, write the manifest
 *   node organize.mjs --undo manifest.json        put everything back
 */

import {
  readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, copyFileSync,
  unlinkSync, readdirSync, rmdirSync,
} from 'node:fs';
import { join, dirname, basename, extname, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';

// The plan is written by the model from the skill, not typed by the user: nobody keeps
// an old one around. So the keys are English and nothing else, with no aliases — an
// alias here would be code no request can reach.
const ACTIONS = ['copy', 'move', 'aside', 'bin'];

// Folders this never works on. Not a complete safety list — the minimum that stops a
// typo pointing the tidy-up at a drive root or at the whole user profile.
function protectedReason(p) {
  const r = resolve(p);
  const home = resolve(homedir());
  const parts = r.split(sep).filter(Boolean);
  if (parts.length <= 1) return 'it is the root of a drive';
  if (r === home) return 'it is the whole user folder';
  const forbidden = ['Windows', 'Program Files', 'Program Files (x86)', 'ProgramData', 'System32', 'AppData'];
  for (const f of forbidden) if (parts.includes(f)) return `it contains ${f}`;
  return null;
}

/** A free name in the destination folder: nothing gets overwritten. */
function freeName(dir, name) {
  if (!existsSync(join(dir, name))) return name;
  const ext = extname(name);
  const base = basename(name, ext);
  for (let i = 2; i < 10000; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (!existsSync(join(dir, candidate))) return candidate;
  }
  throw new Error(`too many files named like ${name}`);
}

/** System Recycle Bin, not deletion. On Windows this goes through PowerShell. */
function toRecycleBin(file) {
  if (process.platform !== 'win32') {
    throw new Error('the system Recycle Bin is implemented only on Windows here; use "aside"');
  }
  const ps = `Add-Type -AssemblyName Microsoft.VisualBasic; ` +
    `[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(` +
    `'${file.replace(/'/g, "''")}',` +
    `'OnlyErrorDialogs','SendToRecycleBin')`;
  execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { stdio: 'pipe' });
}

function readPlan(p) {
  const plan = JSON.parse(readFileSync(p, 'utf8'));
  if (!plan.source) throw new Error('the plan does not say which folder is the source');
  if (!Array.isArray(plan.actions) || !plan.actions.length) throw new Error('the plan contains no actions');
  const why = protectedReason(plan.source);
  if (why) throw new Error(`refusing to work on ${plan.source}: ${why}`);
  for (const a of plan.actions) {
    if (!a.file) throw new Error('an action with no file');
    if (!ACTIONS.includes(a.do)) throw new Error(`unknown action: ${a.do}`);
    if ((a.do === 'copy' || a.do === 'move') && !a.to) {
      throw new Error(`${a.file}: ${a.do} with no destination`);
    }
  }
  return plan;
}

function countByAction(plan) {
  const per = {};
  for (const a of plan.actions) per[a.do] = (per[a.do] || 0) + 1;
  return per;
}

function printPlan(plan) {
  const per = countByAction(plan);
  console.log(`\nsource: ${plan.source}`);
  if (plan.criterion) console.log(`criterion: ${plan.criterion}`);
  console.log(`${plan.actions.length} files\n`);
  for (const [action, n] of Object.entries(per)) console.log(`  ${action.padEnd(8)} ${n}`);

  // A sample per action: counts do not reveal a wrong criterion, names do.
  console.log('\nexamples:');
  for (const action of Object.keys(per)) {
    const sample = plan.actions.filter((a) => a.do === action).slice(0, 3).map((a) => a.file);
    console.log(`  ${action.padEnd(8)} ${sample.join(', ')}${per[action] > 3 ? ` ... and ${per[action] - 3} more` : ''}`);
  }
  const missing = plan.actions.filter((a) => !existsSync(join(plan.source, a.file)));
  if (missing.length) {
    console.log(`\n${missing.length} files in the plan do not exist in the source:`);
    for (const a of missing.slice(0, 5)) console.log(`  ${a.file}`);
  }
  return missing;
}

function apply(plan, planPath) {
  const done = [];
  const aside = join(plan.source, '_set-aside');
  let errors = 0;

  for (const a of plan.actions) {
    const from = join(plan.source, a.file);
    if (!existsSync(from)) { console.log(`  skipped, does not exist: ${a.file}`); continue; }
    try {
      if (a.do === 'copy' || a.do === 'move') {
        mkdirSync(a.to, { recursive: true });
        const to = join(a.to, freeName(a.to, basename(a.file)));
        if (a.do === 'copy') copyFileSync(from, to);
        else renameSync(from, to);
        done.push({ action: a.do, from, to });
      } else if (a.do === 'aside') {
        mkdirSync(aside, { recursive: true });
        const to = join(aside, freeName(aside, basename(a.file)));
        renameSync(from, to);
        done.push({ action: 'aside', from, to });
      } else if (a.do === 'bin') {
        toRecycleBin(from);
        // The Recycle Bin is not undone from here: files are recovered from the Bin itself.
        done.push({ action: 'bin', from, to: null });
      }
    } catch (e) {
      errors++;
      console.log(`  ERROR on ${a.file}: ${e.message}`);
    }
  }

  const manifest = join(dirname(resolve(planPath)), `manifest-${done.length}-files.json`);
  writeFileSync(manifest, JSON.stringify({
    source: plan.source,
    criterion: plan.criterion || null,
    operations: done,
  }, null, 2));

  console.log(`\n${done.length} operations applied, ${errors} errors.`);
  console.log(`manifest: ${manifest}`);
  const binned = done.filter((d) => d.action === 'bin').length;
  if (binned) console.log(`${binned} files in the system Recycle Bin: recover them from there, not from here.`);
  console.log(`to undo the rest:\n  node organize.mjs --undo "${manifest}"`);
}

function undo(manifestPath) {
  const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
  let undone = 0, skipped = 0;
  // In reverse: if two files ended up on the same name, the last one goes back first.
  for (const op of [...m.operations].reverse()) {
    if (op.action === 'bin') { skipped++; continue; }
    if (!op.to || !existsSync(op.to)) { skipped++; continue; }
    try {
      if (op.action === 'copy') {
        unlinkSync(op.to); // the copy goes, the original was never touched
      } else {
        mkdirSync(dirname(op.from), { recursive: true });
        renameSync(op.to, existsSync(op.from) ? join(dirname(op.from), freeName(dirname(op.from), basename(op.from))) : op.from);
      }
      undone++;
    } catch (e) {
      skipped++;
      console.log(`  not undone: ${op.to} — ${e.message}`);
    }
  }
  // Folders this created and left empty go; folders with something in them stay.
  const aside = join(m.source, '_set-aside');
  try { if (existsSync(aside) && !readdirSync(aside).length) rmdirSync(aside); } catch { /* leave it */ }

  console.log(`\n${undone} operations undone, ${skipped} not.`);
  const binned = m.operations.filter((o) => o.action === 'bin').length;
  if (binned) console.log(`${binned} files had gone to the system Recycle Bin: recover them from there.`);
}

function main() {
  const argv = process.argv.slice(2);
  const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };

  const manifest = arg('--undo');
  if (manifest) return undo(manifest);

  const planPath = arg('--plan');
  if (!planPath) {
    console.error('needs --plan <file.json>, or --undo <manifest.json>');
    process.exit(1);
  }
  const plan = readPlan(planPath);
  printPlan(plan);

  if (!argv.includes('--apply')) {
    console.log('\nNothing was touched. To run it, add --apply.');
    return;
  }
  console.log('\napplying:');
  apply(plan, planPath);
}

try { main(); } catch (e) { console.error(`\n${e.message}`); process.exit(1); }
