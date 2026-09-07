#!/usr/bin/env node
/**
 * ATLAS — what the memory files cost, and what they would cost in English.
 *
 * Memory files load at every session. `MEMORY.md` is loaded by the environment before
 * any command can intervene: the only way to spend less there is for it to be written
 * in a cheaper language, not to put a translation beside it.
 *
 * The rates below were measured with the API's own token counts, not estimated: the
 * same technical text translated faithfully into each language, counted three times
 * per language, median. Languages that were not measured get no number, because
 * `tiktoken` — the only free alternative — got the sign wrong on Turkish and missed
 * Spanish by fifteen points. An invented number is worse than none.
 *
 * Usage:
 *   node tools/memory.mjs
 *   node tools/memory.mjs --dir <path>
 *   node tools/memory.mjs --json
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';

// Tokens per character, measured with the API's counts on the same translated text.
// They estimate what a file costs without sending it anywhere.
const RATE = {
  en: { name: 'English', perChar: 0.290 },
  zh: { name: 'Chinese', perChar: 1.000 },
  es: { name: 'Spanish', perChar: 0.375 },
  it: { name: 'Italian', perChar: 0.409 },
  ja: { name: 'Japanese', perChar: 0.836 },
  tr: { name: 'Turkish', perChar: 0.507 },
};

// Frequent words that do not occur in the other listed languages. Detection need not
// be perfect: it has to tell "this memory is not in English" from "it already is", and
// confusing two unmeasured languages does not change the advice.
const MARKERS = {
  it: ['che', 'non', 'per', 'della', 'sono', 'come', 'quando', 'perche', 'perché', 'anche', 'questo'],
  en: ['the', 'and', 'that', 'with', 'from', 'this', 'when', 'because', 'which', 'about'],
  es: ['que', 'para', 'como', 'pero', 'cuando', 'porque', 'este', 'desde', 'sobre'],
  fr: ['que', 'pour', 'dans', 'avec', 'cette', 'quand', 'parce', 'mais', 'sont'],
  de: ['und', 'der', 'die', 'das', 'nicht', 'wenn', 'weil', 'aber', 'auch'],
  pt: ['que', 'para', 'como', 'quando', 'porque', 'este', 'sobre', 'nao', 'não'],
};

function detect(text) {
  // Non-Latin scripts are recognised by their characters, not by words.
  if (/[一-鿿]/.test(text)) return 'zh';
  if (/[぀-ヿ]/.test(text)) return 'ja';
  if (/[가-힯]/.test(text)) return 'ko';
  if (/[؀-ۿ]/.test(text)) return 'ar';
  if (/[Ѐ-ӿ]/.test(text)) return 'ru';
  if (/[ऀ-ॿ]/.test(text)) return 'hi';

  const words = text.toLowerCase().match(/[a-zàèéìòùáíóúâêôãõçäöüñ]+/g) || [];
  const count = {};
  for (const [lang, markers] of Object.entries(MARKERS)) {
    count[lang] = words.filter((w) => markers.includes(w)).length;
  }
  const ranked = Object.entries(count).sort((a, b) => b[1] - a[1]);
  // No marker found, or a tie: better to say nothing than to guess.
  if (!ranked[0][1] || ranked[0][1] === ranked[1][1]) return null;
  return ranked[0][0];
}

function parseArgs(argv) {
  const o = { dir: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dir') o.dir = argv[++i];
    else if (argv[i] === '--json') o.json = true;
  }
  return o;
}

/** The memory folders that actually exist. */
function findFolders(explicit) {
  if (explicit) return existsSync(explicit) ? [explicit] : [];
  const root = join(homedir(), '.claude', 'projects');
  if (!existsSync(root)) return [];
  const found = [];
  for (const p of readdirSync(root)) {
    const m = join(root, p, 'memory');
    if (existsSync(m) && statSync(m).isDirectory()) found.push(m);
  }
  return found;
}

const fmt = (n) => Math.round(n).toLocaleString('en-US');

function main() {
  const args = parseArgs(process.argv.slice(2));
  const folders = findFolders(args.dir);
  if (!folders.length) {
    console.log('No memory folder found. Nothing to say.');
    return;
  }

  const results = [];
  for (const folder of folders) {
    const files = readdirSync(folder).filter((f) => f.endsWith('.md'));
    if (!files.length) continue;
    let chars = 0, text = '';
    const detail = [];
    for (const f of files) {
      const t = readFileSync(join(folder, f), 'utf8');
      chars += t.length;
      text += t + '\n';
      // MEMORY.md is the only one the environment loads by itself at every start; the
      // others are paid for only when needed. The distinction changes the advice.
      detail.push({ file: f, chars: t.length, always: f.toLowerCase() === 'memory.md' });
    }
    const lang = detect(text);
    const known = lang && RATE[lang];
    const current = known ? Math.round(chars * RATE[lang].perChar) : null;
    // In English the same content takes roughly the same number of characters: the
    // saving comes from the tokenizer, not from length.
    const inEnglish = Math.round(chars * RATE.en.perChar);
    results.push({ folder, files: detail, chars, lang, known: !!known, current, inEnglish });
  }

  if (args.json) { console.log(JSON.stringify(results, null, 2)); return; }

  for (const r of results) {
    console.log(`\n${basename(join(r.folder, '..'))} — ${r.files.length} files, ${fmt(r.chars)} characters`);
    const always = r.files.filter((f) => f.always);
    if (always.length) {
      const c = always.reduce((n, f) => n + f.chars, 0);
      console.log(`  of which ${always.map((f) => f.file).join(', ')}: ${fmt(c)} characters, loaded at every start`);
    }
    if (!r.lang) {
      console.log('  language: not recognised. No estimate.');
      continue;
    }
    const name = RATE[r.lang]?.name || r.lang;
    if (r.lang === 'en') {
      console.log(`  language: ${name}. Already the cheapest measured: nothing to gain here.`);
      continue;
    }
    if (!r.known) {
      console.log(`  language: ${name}. Not measured, so no number.`);
      console.log('  English is almost certainly cheaper, but by how much is unknown and will not be invented.');
      continue;
    }
    const saving = r.current - r.inEnglish;
    const pct = ((saving / r.current) * 100).toFixed(0);
    console.log(`  language: ${name}, about ${fmt(r.current)} tokens`);
    console.log(`  in English: about ${fmt(r.inEnglish)} tokens — ${fmt(saving)} fewer, ${pct}%`);
  }

  console.log('\nWhy English costs less: the tokenizer learned on text that is overwhelmingly English,');
  console.log('so English words fit in one token while other languages split into two or three.');
  console.log('It is not about length: Japanese writes half the characters of Italian and costs 7% more.');
  console.log('\nRates measured with the API\'s counts on faithfully translated text, not estimated with');
  console.log('someone else\'s tokenizer. Languages not in the list get no number.');
  console.log('\nMEMORY.md is loaded by the environment at every start: the only way to spend less there');
  console.log('is to write it in English directly. A translation beside it would arrive too late.');
}

main();
