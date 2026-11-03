#!/usr/bin/env node
/**
 * ATLAS bench — gathers what was measured into results.opus.json and the plugin's figures.json.
 * Saving from measure.mjs, notes lost from judge-notes.mjs, costs from fixed-costs.<version>.json.
 *
 * Usage: node results.mjs [<figures.json to write>]
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const node = (script, ...args) => JSON.parse(execFileSync('node', [join(HERE, script), ...args], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, cwd: HERE }));
const old = JSON.parse(readFileSync(join(HERE, 'results.opus.json'), 'utf8'));
const out = { date: new Date().toISOString().slice(0, 10), model: null, judge: null, saving: {}, lost: {}, noneLost: {}, controls: {}, planted: {}, billedOutput: {}, rem: old.rem, cavemanNew: process.env.CAVEMAN_NEW || old.cavemanNew || null };

for (const lang of ['en', 'it']) {
  const cases = `cases/opus.${lang}.json`;
  const m = node('measure.mjs', '--cases', cases, '--json');
  out.saving[lang] = Object.fromEntries(m.rows.map((r) => [r.cfg, r.saving.med]));
  out.billedOutput[lang] = billed(lang);
  const j = node('judge-notes.mjs', '--cases', cases, '--report', '--json');
  out.lost[lang] = Object.fromEntries(j.rows.filter((r) => r.rounds).map((r) => [r.cfg, [r.lost, r.total, r.min, r.max]]));
  out.noneLost[lang] = j.base;
  out.controls[lang] = j.controls;
  out.judge = j.meta?.model ?? out.judge;
  const planted = JSON.parse(readFileSync(join(HERE, `planted.opus.${lang}.json`), 'utf8'));
  out.planted[lang] = { removed: planted.length, removedSaidPresent: planted.filter((r) => r.removedSaidPresent).length, kept: planted.filter((r) => r.kept).length, keptSaidAbsent: planted.filter((r) => r.kept && !r.keptSaidPresent).length };
}

/** Output as billed, thinking included, summed per setup, against no plugin. */
function billed(lang) {
  const dir = join(HERE, 'generated', `opus.${lang}`);
  const sum = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const cfg = f.split('.')[1];
    const j = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    sum[cfg] = (sum[cfg] || 0) + (j.output_tokens || 0);
    out.model = j.model || out.model;
  }
  return Object.fromEntries(Object.entries(sum).map(([k, v]) => [k, ((v - sum.none) / sum.none) * 100]));
}

writeFileSync(join(HERE, 'results.opus.json'), JSON.stringify(out, null, 2) + '\n');
const file = readdirSync(HERE).filter((f) => /^fixed-costs\..*\.json$/.test(f)).sort().pop();
const fixed = JSON.parse(readFileSync(join(HERE, file), 'utf8'));
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify({ fixed, results: out }, null, 1) + '\n');
console.log(`results.opus.json written: ${out.date}, ${out.model}, judge ${out.judge}.`);
