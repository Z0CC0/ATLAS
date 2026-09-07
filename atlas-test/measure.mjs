#!/usr/bin/env node
/**
 * ATLAS bench — step 3: measure the answers produced by generate.mjs.
 *
 * Two columns, and the second is worth more than the first: how much was saved, and
 * how many details disappeared to get there. Without the second, the first rewards
 * whoever throws away the most.
 *
 * Tokens are the API's own counts written beside every answer, not a tokenizer's
 * estimate. The answer's number is output_tokens minus thinking_tokens: the reasoning
 * is cost, but it is not text the user reads.
 *
 * With several rounds per case it prints the median, minimum and maximum. The median
 * because one odd round in ten moves the mean and not the median. Minimum and maximum
 * because they say what actually matters: in the worst case how much is saved, and in
 * the best.
 *
 * Usage:
 *   node measure.mjs
 *   node measure.mjs --cases cases/compression.it.json
 *   node measure.mjs --json
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const ORDER = [
  'none',
  'atlas-low', 'atlas-high',
  'low-ask', 'low-check', 'low-ask-check',
  'high-ask', 'high-check', 'high-ask-check',
  'atlasmin-low', 'atlasmin-high',
  'caveman-lite', 'caveman-full', 'caveman-ultra',
];

function args(argv) {
  const o = { cases: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--cases') o.cases = argv[++i];
    else if (argv[i] === '--json') o.json = true;
  }
  return o;
}

const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};

// The comparison ignores case, accents and apostrophes: we look for the detail, not
// its spelling. A keyboard difference must not count as a loss.
const flat = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '');
const present = (text, forms) => forms.some((f) => flat(text).includes(flat(f)));
const words = (t) => t.split(/\s+/).filter(Boolean).length;

// With `ask` on, the model sometimes asks instead of answering, which is what that
// dial exists to do: on "choose the database" it asked what scale we are at, which
// changes the recommendation. The bench would count that question as a total loss of
// every detail of the case, and in the first measurement it produced 42 lost details
// on a configuration that had lost none.
//
// An answer that asks is recognised like this: short, and ending with a question. It
// is counted separately and left out of the loss count, because measuring the
// fidelity of an answer never given means nothing.
const isQuestion = (t) => words(t) <= 80 && t.trim().slice(-200).includes('?');

function main() {
  const o = args(process.argv.slice(2));
  const casesFile = o.cases || join(HERE, 'cases', 'compression.en.json');
  const label = basename(casesFile).replace(/\.json$/, '');
  const DIR = join(HERE, 'generated', label);
  if (!existsSync(DIR)) { console.error(`Nothing to measure in ${DIR}. First: node generate.mjs --cases ${casesFile}`); process.exit(1); }
  const raw = JSON.parse(readFileSync(casesFile, 'utf8'));
  const cases = Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith('_')));
  const files = readdirSync(DIR);

  // The judge's verdicts, if any. The substring check marks as absent what is there
  // in other words; judge.mjs re-judges those cases and here the false losses are
  // taken out of the count. Without the file the automatic check alone is used, and
  // the number of lost details is an upper bound instead of a measurement.
  const verdictsFile = join(HERE, `verdicts.${label}.json`);
  const verdicts = existsSync(verdictsFile) ? JSON.parse(readFileSync(verdictsFile, 'utf8')) : {};
  const nVerdicts = Object.keys(verdicts).length;
  const wasFalse = (f, detail) => verdicts[`${f}::${detail}`]?.present === true;

  // One total per round for each configuration: the round is the unit of repetition,
  // not the single case. Summing case-by-case minima would give a minimum no round
  // ever produced.
  const data = {};
  for (const cfg of ORDER) {
    const rounds = new Map();
    for (const [name, c] of Object.entries(cases)) {
      const pref = `${name}.${cfg}.`;
      for (const f of files.filter((x) => x.startsWith(pref) && x.endsWith('.txt'))) {
        const r = f.slice(pref.length, -4);
        const text = readFileSync(join(DIR, f), 'utf8').trim();
        const metaFile = join(DIR, f.replace(/\.txt$/, '.json'));
        const u = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')) : {};
        if (!rounds.has(r)) rounds.set(r, { tokens: 0, words: 0, lost: [], total: 0, cases: 0, thinking: 0, questions: 0 });
        const row = rounds.get(r);
        row.tokens += (u.output_tokens ?? 0) - (u.thinking_tokens ?? 0);
        row.thinking += u.thinking_tokens ?? 0;
        row.words += words(text);
        row.cases += 1;
        // An answer that asks has no details to lose: it enters neither numerator nor denominator.
        if (isQuestion(text)) { row.questions += 1; continue; }
        row.total += c.facts.length;
        for (const forms of c.facts) {
          if (present(text, forms)) continue;
          if (wasFalse(f, forms[0])) continue;
          row.lost.push(`${name}:${forms[0]}`);
        }
      }
    }
    // An incomplete round would skew the total downwards: only rounds with every case count.
    const complete = [...rounds.entries()].filter(([, r]) => r.cases === Object.keys(cases).length);
    if (complete.length) data[cfg] = complete.map(([r, v]) => ({ r, ...v }));
  }

  if (!data.none) {
    console.error('The no-plugin row is missing: without it what the model leaves out on its own cannot be');
    console.error('subtracted, and every configuration would carry those omissions as its own.');
    process.exit(1);
  }

  const base = { tokens: median(data.none.map((r) => r.tokens)), words: median(data.none.map((r) => r.words)) };
  const lostBase = new Set(data.none.flatMap((r) => r.lost));

  const rows = [];
  for (const cfg of ORDER) {
    const g = data[cfg];
    if (!g) continue;
    const tk = g.map((r) => r.tokens);
    const wd = g.map((r) => r.words);
    const saving = (t) => ((base.tokens - t) / base.tokens) * 100;
    // Lost details are counted per round, then the median is taken: a detail gone in
    // one round out of ten is not the same as one gone every time.
    const lostPerRound = g.map((r) => r.lost.filter((x) => !lostBase.has(x)).length);
    rows.push({
      cfg,
      rounds: g.length,
      tokens: { med: median(tk), min: Math.min(...tk), max: Math.max(...tk) },
      saving: { med: saving(median(tk)), min: saving(Math.max(...tk)), max: saving(Math.min(...tk)) },
      words: { med: median(wd) },
      wordSaving: ((base.words - median(wd)) / base.words) * 100,
      lost: { med: median(lostPerRound), min: Math.min(...lostPerRound), max: Math.max(...lostPerRound) },
      questions: median(g.map((r) => r.questions)),
      thinking: median(g.map((r) => r.thinking)),
      totalFacts: g[0].total,
    });
  }

  if (o.json) { console.log(JSON.stringify({ base, rows }, null, 2)); return; }

  const n = rows[0]?.rounds ?? 0;
  console.log(`\n${label} — ${Object.keys(cases).length} cases, ${n} complete rounds per configuration`);
  console.log(`Reference with no plugin: ${base.tokens} tokens, ${base.words} words (median of rounds)\n`);
  const F = (x) => x.toFixed(1).padStart(6);
  console.log('configuration    rounds  tokens   saving     worst    best    words   details lost   asked');
  console.log('-'.repeat(92));
  for (const r of rows) {
    console.log(
      r.cfg.padEnd(17) + String(r.rounds).padStart(5) + String(r.tokens.med).padStart(8) +
      F(r.saving.med) + '%' + F(r.saving.min) + '%' + F(r.saving.max) + '%' + F(r.wordSaving) + '%' +
      `   ${r.lost.med} of ${r.totalFacts}  (${r.lost.min}-${r.lost.max})`.padStart(18) + String(r.questions).padStart(8)
    );
  }
  console.log('-'.repeat(92));
  console.log('Saving: median of rounds. Worst and best: the round that saved least and the one that');
  console.log('saved most, that is the band the real fluctuation sits in.');
  console.log(`Details lost: only those the no-plugin answer kept. The no-plugin row loses ${lostBase.size} of`);
  console.log(`${rows[0]?.totalFacts ?? 0} on its own, and compression does not take those away.`);
  console.log("Tokens: the API's counts, thinking removed. Not another tokenizer's estimate.");
  console.log(nVerdicts
    ? `Details re-judged one by one by a call with no plugin: ${nVerdicts} verdicts.`
    : 'WARNING: no judge verdicts. Lost details are an upper bound, because the substring check\nmarks as absent what is said in other words. Run: node judge.mjs');
}

main();
