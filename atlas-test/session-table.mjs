#!/usr/bin/env node
/**
 * ATLAS bench — what a session costs against no plugin, in visible tokens.
 *
 * Nothing measured here, only arithmetic over two files that were: the first turn as billed
 * from fixed-costs.<version>.json, the saving per answer and the reminder from results.opus.json.
 *   cost = first turn + turns x reminder - turns x answer x saving
 * read as a share of turns x answer. A 500-token answer with no plugin; 40 turns and 295, the
 * average of the real transcripts this was tuned on. Negative is cheaper.
 *
 * Usage: node session-table.mjs [fixed-costs.0.1.0.json]
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ANSWER = 500;
const TURNS = [40, 295];
const file = process.argv[2] || readdirSync(HERE).filter((f) => /^fixed-costs\..*\.json$/.test(f)).sort().pop();
const fixed = JSON.parse(readFileSync(join(HERE, file), 'utf8'));
const results = JSON.parse(readFileSync(join(HERE, 'results.opus.json'), 'utf8'));
const billed = fixed.rows._billed;
const saving = (k) => (results.saving.en[k] + results.saving.it[k]) / 200;
const pct = (first, rem, s, n) => { const v = ((first + n * rem - n * ANSWER * s) / (n * ANSWER)) * 100; const r = Math.round(v); return `${r > 0 ? '+' : ''}${r === 0 ? 0 : r}%`; };

console.log(`Fixed costs: ${file}, ATLAS ${fixed.version}, billed on ${billed.model}. Savings: ${results.date}, ${results.rules}.\n`);
console.log('`atlas`\n\n| setup | 40 turns | 295 turns |\n|---|---|---|');
const SETUPS = [['low', 'atlas-low'], ['high', 'atlas-high'], ['low-ask', 'low-ask'], ['low-check', 'low-check'], ['low-ask-check', 'low-ask-check'], ['high-ask', 'high-ask'], ['high-check', 'high-check'], ['high-ask-check', 'high-ask-check']];
for (const [k, r] of SETUPS) console.log(`| \`${k.replace(/-/g, '` + `')}\` | ${TURNS.map((n) => pct(billed.atlas[k], results.rem[r], saving(r), n)).join(' | ')} |`);

for (const b of ['atlas-min', 'atlas-code', 'atlas-mem', 'atlas-video', 'atlas-max']) {
  console.log(`\n\`${b}\`\n\n| setup | 40 turns | 295 turns |\n|---|---|---|`);
  const min = b === 'atlas-min';
  for (const [level, r, rem] of [['low', min ? 'atlasmin-low' : 'atlas-low', fixed.rows[b].rem_low], ['high', min ? 'atlasmin-high' : 'atlas-high', fixed.rows[b].rem_high]]) {
    console.log(`| \`${level}\` | ${TURNS.map((n) => pct(billed[b][level], rem, saving(r), n)).join(' | ')} |`);
  }
}
