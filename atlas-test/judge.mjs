#!/usr/bin/env node
/**
 * ATLAS bench — step 2: the judge of lost details.
 *
 * The detail check looks for substrings. It has produced false losses more than once:
 * "9 hours and 15" marked absent because the model had written `9h15`, "reaches a
 * recommendation" marked absent because the recommendation was there in other words.
 * A check that marks as lost what is present is worse than no check, because it
 * looks like data. Widening the list of accepted forms by hand does not close the
 * problem: the possible forms never end, and whoever picks them decides the result.
 *
 * Here every detail the substring check marked absent is re-judged, one by one, by a
 * separate call with no plugin active. The judge sees only the answer and the detail,
 * is told nothing about what is being measured, and replies YES or NO. It runs only on
 * what the automatic check flagged: a detail found by substring is present by
 * definition and needs no judgment.
 *
 * The prompt says explicitly what counts as present — abbreviations, symbols,
 * numerals, paraphrase. A first version asked whether the text "states" the detail
 * and was read narrowly: it said NO to `Mon` when asked about `Monday`. That error is
 * not neutral: it punishes whoever compresses more, because compressed text uses
 * compact forms. Every verdict is saved, so it is reusable and, above all,
 * contestable: which answer and which detail produced which judgment stays written.
 *
 * Usage:
 *   node judge.mjs --dry-run
 *   node judge.mjs
 *   node judge.mjs --cases cases/compression.it.json
 *
 * Run after generation is finished: it changes the plugins' state files the way
 * generate.mjs does, so the two cannot run together.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ATLAS_STATE = join(homedir(), '.claude', '.atlas-state');
const CAVEMAN_STATE = join(homedir(), '.claude', '.caveman-active');
const SAVED = join(HERE, '.user-state-judge.json');
const DISALLOWED = 'WebSearch,WebFetch,Bash,Read,Edit,Write,Glob,Grep,Task,TodoWrite,Agent';

const flat = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '');
const present = (t, forms) => forms.some((f) => flat(t).includes(flat(f)));

function args(argv) {
  const o = { cases: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--cases') o.cases = argv[++i];
    else if (argv[i] === '--dry-run') o.dryRun = true;
  }
  return o;
}

/**
 * The judge's prompt does not name the plugin, does not say a compression is being
 * measured, and leaves no room for an articulated answer: whoever judges must not know
 * what it would be convenient to answer.
 */
function judgePrompt(answer, detail, language) {
  const t = language === 'it'
    ? {
        intro: 'Qui sotto c e un testo, poi un informazione.', text: 'TESTO', info: 'INFORMAZIONE',
        question: 'Un lettore ricava quell informazione dal testo?',
        rules: [
          'Conta come presente comunque sia formulata. In particolare conta quando il testo usa:',
          '- un abbreviazione standard (lun per lunedi, set per settembre, min per minimo)',
          '- un simbolo o una cifra al posto di una parola (24 per ventiquattro, % per per cento)',
          '- un sinonimo, una parafrasi, o una formulazione piu corta',
          '- un unita o un formato equivalente (9h15 per 9 ore e 15 minuti)',
          'NON conta se il testo nomina solo l argomento senza affermare il fatto.',
        ],
        close: 'Rispondi con una parola sola: SI oppure NO. Nient altro.',
      }
    : {
        intro: 'Below is a text, then a piece of information.', text: 'TEXT', info: 'INFORMATION',
        question: 'Does a reader learn that information from the text?',
        rules: [
          'It counts as present in any wording. In particular it counts when the text uses:',
          '- a standard abbreviation (Mon for Monday, Sept for September, min for minimum)',
          '- a symbol or numeral instead of a word (24 for twenty-four, % for per cent, > for more than)',
          '- a synonym, a paraphrase, or a shorter phrasing',
          '- a different but equivalent unit or format (9h15 for 9 hours and 15 minutes)',
          'It does NOT count if the text merely mentions the same topic without stating the fact.',
        ],
        close: 'Answer with one word: YES or NO. Nothing else.',
      };
  return [t.intro, '', `--- ${t.text} ---`, answer, `--- end ${t.text} ---`, '', `${t.info}: ${detail}`, '', t.question, '', ...t.rules, '', t.close].join('\n');
}

function main() {
  const o = args(process.argv.slice(2));
  const casesFile = o.cases || join(HERE, 'cases', 'compression.en.json');
  const label = basename(casesFile).replace(/\.json$/, '');
  const DIR = join(HERE, 'generated', label);
  const VERDICTS = join(HERE, `verdicts.${label}.json`);
  if (!existsSync(DIR)) { console.error(`Nothing to judge in ${DIR}.`); process.exit(1); }
  const raw = JSON.parse(readFileSync(casesFile, 'utf8'));
  const language = raw._language || 'en';
  const cases = Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith('_')));
  const done = existsSync(VERDICTS) ? JSON.parse(readFileSync(VERDICTS, 'utf8')) : {};

  // One judgment per answer-detail pair, and only where the automatic check marked
  // absent. Stable key, so a resumed run buys nothing twice.
  const jobs = [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith('.txt'))) {
    const name = f.split('.')[0];
    const c = cases[name];
    if (!c) continue;
    const text = readFileSync(join(DIR, f), 'utf8').trim();
    for (const forms of c.facts) {
      if (present(text, forms)) continue;
      const key = `${f}::${forms[0]}`;
      if (key in done) continue;
      jobs.push({ key, text, detail: forms[0], f });
    }
  }
  if (o.dryRun) {
    console.log(`${jobs.length} judgments to make (${Object.keys(done).length} already on file).`);
    console.log('They run only on the details the substring check marked absent.');
    return;
  }
  if (!jobs.length) { console.log('Nothing to judge: every flagged detail already has a verdict.'); return; }

  // The judge must wear no plugin, or it would judge with one contender's rules in its head.
  const saved = {
    atlas: existsSync(ATLAS_STATE) ? readFileSync(ATLAS_STATE, 'utf8') : null,
    caveman: existsSync(CAVEMAN_STATE) ? readFileSync(CAVEMAN_STATE, 'utf8') : null,
  };
  writeFileSync(SAVED, JSON.stringify(saved));
  const restore = () => {
    for (const [k, p] of [['atlas', ATLAS_STATE], ['caveman', CAVEMAN_STATE]]) {
      if (saved[k] === null) { if (existsSync(p)) unlinkSync(p); continue; }
      for (let i = 0; i < 3; i++) { writeFileSync(p, saved[k]); if (readFileSync(p, 'utf8') === saved[k]) break; }
    }
    try { if (existsSync(SAVED)) unlinkSync(SAVED); } catch (e) { /* nothing to remove */ }
  };
  process.on('exit', restore);
  process.on('SIGINT', () => { restore(); process.exit(130); });
  writeFileSync(ATLAS_STATE, 'off:off:off');
  writeFileSync(CAVEMAN_STATE, 'off');

  let n = 0, found = 0;
  for (const j of jobs) {
    n++;
    process.stdout.write(`[${String(n).padStart(4)}/${jobs.length}] ${j.f} — ${j.detail} ... `);
    try {
      const out = execFileSync('claude', ['-p', judgePrompt(j.text, j.detail, language), '--disallowed-tools', DISALLOWED], {
        encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, env: { ...process.env, CAVEMAN_DEFAULT_MODE: 'off' },
      }).trim();
      const yes = /^\s*(si|sì|yes)\b/i.test(out);
      done[j.key] = { present: yes, answer: out.slice(0, 40) };
      if (yes) found++;
      console.log(yes ? 'PRESENT (false loss)' : 'absent');
    } catch (e) {
      console.log('FAILED');
    }
    if (n % 25 === 0) writeFileSync(VERDICTS, JSON.stringify(done, null, 2));
  }
  writeFileSync(VERDICTS, JSON.stringify(done, null, 2));
  restore();
  console.log(`\n${found} of ${jobs.length} losses were false: the detail was there, said otherwise.`);
  console.log(`Verdicts in ${VERDICTS}. measure.mjs reads them from there.`);
}

main();
