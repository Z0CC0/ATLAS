#!/usr/bin/env node
/**
 * ATLAS bench — the judge of kept information, with no substring anywhere.
 *
 * judge.mjs only re-judges what the substring check marked absent. What that check marks
 * present is never looked at, and it is often wrong: run over the facts of ANOTHER question,
 * which by construction are not in the answer, it "finds" 3.1% of them in English and 3.4% in
 * Italian, 11-15% when the shortest accepted form is three letters or fewer, and 89-96% for the
 * fact written as "no". Every such error hides a loss, and it hides more of them where the
 * answer is short or the facts are few. "Fact" also means a word there, not a statement.
 *
 * Here every answer is read against the sheet of notes its question came with: the same input
 * every configuration received, written before any answer existed. One lean call per answer,
 * with no plugin and no project loaded, and no state file touched, so it can run beside a
 * live session. The judge is told nothing about what is measured and sees no configuration
 * name.
 *
 * Two controls go in each call, shuffled among the notes, so the judge is measured as well:
 *   foreign:  a note of another question whose long words are not in the answer. Must be NO.
 *   verbatim: a sentence copied from the answer itself. Must be YES.
 * Every verdict is saved with its model and prompt hash, so it can be contested and resumed.
 *
 * Without the question the first pass marks `14:20.` as losing "it is 14:20 local time in London"
 * when the question was the time in London: the shortest right answers are charged most. So
 * --second reads every note the first pass marked absent again, in every configuration, with the
 * question beside the answer and the foreign control still in the list. The first verdict stays
 * in the file under `first`.
 *
 * Usage:
 *   node judge-notes.mjs --cases cases/opus.en.json --dry-run
 *   node judge-notes.mjs --cases cases/opus.en.json [--only none,atlas-low] [--limit 20]
 *                        [--parallel 3] [--model claude-sonnet-5-5] [--verdicts file]
 *   node judge-notes.mjs --cases cases/opus.en.json --second
 *   node judge-notes.mjs --cases cases/opus.en.json --planted 60
 *   node judge-notes.mjs --cases cases/opus.en.json --report [--json]
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const sha = (s) => createHash('sha256').update(s).digest('hex');
const words = (t) => t.split(/\s+/).filter(Boolean).length;
// The same rule as measure.mjs: an answer that asks has no information to lose.
const isQuestion = (t) => words(t) <= 80 && t.trim().slice(-200).includes('?');
const flat = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

const SYSTEM = `You compare a text with a numbered list of statements. For each statement, decide whether a reader of the text learns that information from it.

Y: the text gives the information, in any wording: an abbreviation, a symbol or numeral, a synonym, a paraphrase, a shorter phrasing, an equivalent unit or format.
N: the text does not give it. A text that only mentions the same topic without stating the fact is N. A text that states something different is N.

Judge each statement alone. Do not use anything you know from outside the text.
Reply with one JSON object and nothing else, one key per statement number: {"1":"Y","2":"N"}.`;

const SECOND = `You compare an answer with a numbered list of statements. The text is the answer to the question shown. For each statement, decide whether the person who asked learns that information from the answer.

Y: the answer gives the information, in any wording: an abbreviation, a symbol or numeral, a synonym, a paraphrase, a shorter phrasing, an equivalent unit or format. What the question itself establishes, such as the place or the subject, counts as given when the answer relies on it.
N: the answer does not give it. An answer that only mentions the same topic without stating the fact is N. An answer that states something different is N.

Judge each statement alone. Do not use anything you know from outside the question and the answer.
Reply with one JSON object and nothing else, one key per statement number: {"1":"Y","2":"N"}.`;

function args(argv) {
  const o = { cases: null, only: null, limit: Infinity, parallel: 3, model: 'claude-sonnet-5-5', verdicts: null, dry: false, report: false, second: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--cases') o.cases = argv[++i];
    else if (a === '--only') o.only = new Set(argv[++i].split(','));
    else if (a === '--limit') o.limit = Number(argv[++i]);
    else if (a === '--parallel') o.parallel = Number(argv[++i]);
    else if (a === '--model') o.model = argv[++i];
    else if (a === '--verdicts') o.verdicts = argv[++i];
    else if (a === '--dry-run') o.dry = true;
    else if (a === '--report') o.report = true;
    else if (a === '--second') o.second = true;
    else if (a === '--planted') o.planted = Number(argv[++i]);
    else if (a === '--json') o.json = true;
  }
  return o;
}

/** A shuffle fixed by the seed: a resumed or repeated run shows the same list. */
function shuffled(items, seed) {
  const out = [...items];
  let h = seed;
  for (let i = out.length - 1; i > 0; i--) {
    h = sha(h);
    const j = parseInt(h.slice(0, 8), 16) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A note of another question that cannot be in this answer: none of its long words is. */
function foreignNote(text, name, cases, seed) {
  const t = flat(text);
  const others = shuffled(Object.entries(cases).filter(([k]) => k !== name).flatMap(([, c]) => c.notes), seed);
  return others.find((n) => {
    const long = flat(n).match(/[\p{L}\p{N}]{5,}/gu) || [];
    return long.length >= 2 && !long.some((w) => t.includes(w));
  }) || null;
}

/** The longest sentence of the answer, markdown off: a reader certainly learns this one. */
function verbatimSentence(text) {
  const clean = text.replace(/```[\s\S]*?```/g, ' ').replace(/[*_`#>|]/g, ' ');
  const parts = clean.split(/(?<=[.!?:;])\s+|\n+/).map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => s.length >= 25 && s.length <= 200);
  return parts.sort((a, b) => b.length - a.length)[0] || null;
}

let DIR = null;
function callDir() {
  if (!DIR) {
    DIR = mkdtempSync(join(tmpdir(), 'atlas-judge-'));
    writeFileSync(join(DIR, 'mcp.json'), '{"mcpServers":{}}', { mode: 0o600 });
    writeFileSync(join(DIR, 'system.md'), SYSTEM, { mode: 0o600 });
    writeFileSync(join(DIR, 'second.md'), SECOND, { mode: 0o600 });
    process.once('exit', () => { try { rmSync(DIR, { recursive: true, force: true }); } catch { /* left for the OS */ } });
  }
  return DIR;
}

/**
 * One headless call with nothing of the session loaded. The user's settings stay out through
 * --setting-sources: `--settings {"enabledPlugins":{}}` merges, so it leaves every installed plugin
 * on, and their hooks would inject one contender's rules into the judge. Runs in a private folder,
 * so there is no project to read either.
 */
function callModel(user, model, prompt = 'system.md') {
  const dir = callDir();
  const win = process.platform === 'win32';
  if (!/^[\w.:@-]+$/.test(model)) return Promise.reject(new Error(`bad model name "${model}"`));
  const argv = ['-p', '--model', model, '--output-format', 'json', '--setting-sources', 'project', '--tools', win ? '""' : '', '--strict-mcp-config', '--mcp-config', join(dir, 'mcp.json'), '--disable-slash-commands', '--system-prompt-file', join(dir, prompt)];
  return new Promise((res, rej) => {
    const child = win
      ? spawn('claude', argv.map((a) => (/[\s&|<>^()%!"]/.test(a) && a !== '""' ? `"${a}"` : a)), { shell: true, windowsHide: true, cwd: dir })
      : spawn('claude', argv, { windowsHide: true, cwd: dir });
    let out = '', err = '';
    const timer = setTimeout(() => { child.kill(); rej(new Error('timed out')); }, 5 * 60 * 1000);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); rej(e); });
    child.on('close', () => {
      clearTimeout(timer);
      try {
        const r = JSON.parse(out);
        if (r.is_error) return rej(new Error(String(r.result).slice(0, 200)));
        res({ text: String(r.result || ''), cost: r.total_cost_usd || 0 });
      } catch { rej(new Error((err || out).trim().slice(0, 200) || 'empty answer')); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(user);
  });
}

function parseVerdict(text, n) {
  const obj = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  const out = [];
  for (let i = 1; i <= n; i++) {
    const v = obj[String(i)];
    if (v !== 'Y' && v !== 'N') throw new Error(`statement ${i}: ${JSON.stringify(v)}`);
    out.push(v === 'Y');
  }
  return out;
}

function load(o) {
  if (!o.cases) { console.error('--cases <file> is required'); process.exit(1); }
  const casesFile = existsSync(o.cases) ? o.cases : join(HERE, o.cases);
  const label = basename(casesFile).replace(/\.json$/, '');
  const raw = JSON.parse(readFileSync(casesFile, 'utf8'));
  const cases = Object.fromEntries(Object.entries(raw).filter(([k, v]) => !k.startsWith('_') && v.notes?.length));
  const dir = join(HERE, 'generated', label);
  const file = o.verdicts || join(HERE, `verdicts.notes.${label}.json`);
  const store = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { answers: {} };
  return { label, cases, dir, file, store };
}

async function judge(o) {
  const { label, cases, dir, file, store } = load(o);
  const promptHash = sha(SYSTEM).slice(0, 12);
  const jobs = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.txt'))) {
    const [name, cfg] = f.split('.');
    if (!cases[name] || store.answers[f] || (o.only && !o.only.has(cfg))) continue;
    const text = readFileSync(join(dir, f), 'utf8').trim();
    if (!isQuestion(text)) jobs.push({ f, name, text });
  }
  const todo = jobs.slice(0, o.limit);
  if (o.dry) {
    const statements = todo.reduce((a, j) => a + cases[j.name].notes.length, 0);
    console.log(`${label}: ${todo.length} calls (${Object.keys(store.answers).length} answers already judged), ${statements} notes, model ${o.model}.`);
    return;
  }
  store.meta = { model: o.model, prompt: promptHash, date: new Date().toISOString().slice(0, 10) };
  let done = 0, failed = 0, inARow = 0, cost = 0, stop = false;
  const save = () => { writeFileSync(`${file}.tmp`, JSON.stringify(store, null, 1)); renameSync(`${file}.tmp`, file); };
  const queue = [...todo];
  await Promise.all(Array.from({ length: Math.max(1, o.parallel) }, async () => {
    while (queue.length && !stop) {
      const j = queue.shift();
      const notes = cases[j.name].notes.map((text, i) => ({ kind: 'note', i, text }));
      const foreign = foreignNote(j.text, j.name, cases, j.f);
      const verbatim = verbatimSentence(j.text);
      if (foreign) notes.push({ kind: 'foreign', text: foreign });
      if (verbatim) notes.push({ kind: 'verbatim', text: verbatim });
      const list = shuffled(notes, j.f);
      const user = `TEXT\n${j.text}\nEND OF TEXT\n\nSTATEMENTS\n${list.map((n, i) => `${i + 1}. ${n.text}`).join('\n')}`;
      let verdict = null;
      for (let attempt = 0; attempt < 2 && !verdict; attempt++) {
        try {
          const r = await callModel(user, o.model);
          cost += r.cost;
          verdict = parseVerdict(r.text, list.length);
        } catch (e) {
          if (attempt === 1) { failed++; inARow++; console.log(`FAILED ${j.f}: ${e.message}`); }
        }
      }
      if (!verdict) {
        // A login gone or a limit reached fails every call: stop, what is saved stays.
        if (inARow >= 3) { stop = true; console.log('Three failures in a row: stopped. Run it again to resume.'); }
        continue;
      }
      inARow = 0;
      const entry = { notes: {}, foreign: null, verbatim: null };
      list.forEach((n, i) => { if (n.kind === 'note') entry.notes[n.i] = verdict[i]; else entry[n.kind] = verdict[i]; });
      store.answers[j.f] = entry;
      done++;
      save();
      if (done % 25 === 0) console.log(`${done}/${todo.length}, reported cost $${cost.toFixed(2)}`);
    }
  }));
  console.log(`${label}: ${done} judged, ${failed} failed, reported cost $${cost.toFixed(2)}. Verdicts in ${basename(file)}.`);
}

async function second(o) {
  const { label, cases, dir, file, store } = load(o);
  const todo = Object.entries(store.answers).filter(([, e]) => !e.first && Object.values(e.notes).includes(false));
  if (o.dry) { console.log(`${label}: ${todo.length} calls, ${todo.reduce((a, [, e]) => a + Object.values(e.notes).filter((v) => !v).length, 0)} notes.`); return; }
  store.meta = { ...store.meta, second: { model: o.model, prompt: sha(SECOND).slice(0, 12) } };
  let done = 0, flipped = 0, foreignWrong = 0, cost = 0, inARow = 0, failed = 0;
  const queue = [...todo];
  await Promise.all(Array.from({ length: Math.max(1, o.parallel) }, async () => {
    while (queue.length && inARow < 3) {
      const [f, e] = queue.shift();
      const name = f.split('.')[0];
      const text = readFileSync(join(dir, f), 'utf8').trim();
      const notes = Object.entries(e.notes).filter(([, v]) => !v).map(([i]) => ({ i, text: cases[name].notes[i] }));
      const foreign = foreignNote(text, name, cases, f);
      if (foreign) notes.push({ i: null, text: foreign });
      const list = shuffled(notes, f);
      const user = `QUESTION
${cases[name].question}
END OF QUESTION

ANSWER
${text}
END OF ANSWER

STATEMENTS
${list.map((n, i) => `${i + 1}. ${n.text}`).join('\n')}`;
      let verdict = null;
      for (let attempt = 0; attempt < 2 && !verdict; attempt++) {
        try { const r = await callModel(user, o.model, 'second.md'); cost += r.cost; verdict = parseVerdict(r.text, list.length); } catch (err) {
          if (attempt === 1) { failed++; inARow++; console.log(`FAILED ${f}: ${err.message}`); }
        }
      }
      if (!verdict) continue;
      inARow = 0;
      e.first = { ...e.notes };
      list.forEach((n, i) => {
        if (n.i === null) { e.foreignSecond = verdict[i]; if (verdict[i]) foreignWrong++; } else if (verdict[i]) { e.notes[n.i] = true; flipped++; }
      });
      done++;
      writeFileSync(`${file}.tmp`, JSON.stringify(store, null, 1)); renameSync(`${file}.tmp`, file);
    }
  }));
  console.log(`${label}: ${done} answers read again, ${failed} failed, ${flipped} notes found present with the question beside them, foreign control wrong ${foreignWrong}, reported cost $${cost.toFixed(2)}.`);
}

/**
 * The judge's sensitivity. In real answers, the sentences that carry a note are deleted, so that
 * note is gone by construction; another note of the same sheet that stayed is the counterweight.
 * A judge that still says "present" for the first kind is too lenient to trust its zeros.
 */
async function planted(o) {
  const { label, cases, dir } = load(o);
  const longWords = (t) => new Set(flat(t).match(/[\p{L}\p{N}]{4,}/gu) || []);
  const sentences = (t) => t.split(/(?<=[.!?;:])\s+|\n+/).filter((x) => x.trim());
  const overlap = (sentence, noteWords) => { const w = longWords(sentence); return [...noteWords].filter((x) => w.has(x)).length / (noteWords.size || 1); };
  const jobs = [];
  for (const f of shuffled(readdirSync(dir).filter((x) => x.endsWith('.txt')), label)) {
    if (jobs.length >= o.planted) break;
    const [name] = f.split('.');
    if (!cases[name] || cases[name].notes.length < 3) continue;
    const text = readFileSync(join(dir, f), 'utf8').trim();
    if (isQuestion(text)) continue;
    const note = shuffled(cases[name].notes, f).find((n) => longWords(n).size >= 4 && sentences(text).some((x) => overlap(x, longWords(n)) >= 0.5));
    if (!note) continue;
    const words = longWords(note);
    const kept = sentences(text).filter((x) => overlap(x, words) < 0.25);
    const cut = kept.join(' ');
    if (cut.length < text.length * 0.3) continue;
    const other = cases[name].notes.find((n) => n !== note && longWords(n).size >= 3 && kept.some((x) => overlap(x, longWords(n)) >= 0.6));
    jobs.push({ f, name, note, other, cut });
  }
  const results = [];
  const queue = [...jobs];
  await Promise.all(Array.from({ length: Math.max(1, o.parallel) }, async () => {
    while (queue.length) {
      const j = queue.shift();
      const list = shuffled([j.note, ...(j.other ? [j.other] : [])], j.f);
      const user = `QUESTION\n${cases[j.name].question}\nEND OF QUESTION\n\nANSWER\n${j.cut}\nEND OF ANSWER\n\nSTATEMENTS\n${list.map((n, i) => `${i + 1}. ${n}`).join('\n')}`;
      try {
        const r = await callModel(user, o.model, 'second.md');
        const v = parseVerdict(r.text, list.length);
        results.push({ f: j.f, removed: j.note, removedSaidPresent: v[list.indexOf(j.note)], kept: j.other || null, keptSaidPresent: j.other ? v[list.indexOf(j.other)] : null, cut: j.cut.slice(0, 400) });
      } catch (e) { console.log(`FAILED ${j.f}: ${e.message}`); }
    }
  }));
  writeFileSync(join(HERE, `planted.${label}.json`), JSON.stringify(results, null, 1));
  const removed = results.filter((r) => r.removedSaidPresent).length;
  const kept = results.filter((r) => r.kept);
  console.log(`${label}: note removed from the answer, called present ${removed} of ${results.length}; note left in, called absent ${kept.filter((r) => !r.keptSaidPresent).length} of ${kept.length}.`);
}

function report(o) {
  const { label, cases, dir, store } = load(o);
  const names = Object.keys(cases);
  // The unit of repetition is the round, as in measure.mjs: only rounds with every case judged count.
  const byCfg = {};
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.txt'))) {
    const [name, cfg, round] = f.split('.');
    if (!cases[name]) continue;
    const row = ((byCfg[cfg] ||= {})[round] ||= { cases: 0, total: 0, lost: [], questions: 0, pending: 0 });
    row.cases++;
    const text = readFileSync(join(dir, f), 'utf8').trim();
    if (isQuestion(text)) { row.questions++; continue; }
    const v = store.answers[f];
    if (!v) { row.pending++; continue; }
    row.total += cases[name].notes.length;
    for (const [i, kept] of Object.entries(v.notes)) if (!kept) row.lost.push(`${name}:${i}`);
  }
  const complete = (cfg) => Object.values(byCfg[cfg] || {}).filter((r) => r.cases === names.length && !r.pending);
  if (!complete('none').length) { console.error(`${label}: no complete round of the no-plugin row yet.`); process.exit(1); }
  const base = new Set(complete('none').flatMap((r) => r.lost));
  const rows = Object.keys(byCfg).map((cfg) => {
    const g = complete(cfg);
    if (!g.length) return { cfg, rounds: 0 };
    const own = g.map((r) => r.lost.filter((x) => !base.has(x)).length);
    return { cfg, rounds: g.length, total: g[0].total, lost: median(own), min: Math.min(...own), max: Math.max(...own), raw: median(g.map((r) => r.lost.length)) };
  });
  const a = Object.values(store.answers);
  const rate = (vals, want) => { const v = vals.filter((x) => x !== null && x !== undefined); return { n: v.length, wrong: v.filter((x) => x !== want).length }; };
  const controls = { foreignSaidPresent: rate(a.map((x) => x.foreign), false), verbatimSaidAbsent: rate(a.map((x) => x.verbatim), true) };
  if (o.json) { console.log(JSON.stringify({ label, meta: store.meta, base: base.size, rows, controls }, null, 2)); return; }
  console.log(`${label}, judged by ${store.meta?.model} on ${store.meta?.date}. ${a.length} answers on file.`);
  console.log(`The no-plugin row loses ${base.size} notes in some round; those are not charged to anyone.\n`);
  console.log('configuration     rounds  lost beyond no plugin (min-max)   lost in all');
  for (const r of rows.sort((x, y) => x.cfg.localeCompare(y.cfg))) {
    console.log(r.rounds ? `${r.cfg.padEnd(18)}${String(r.rounds).padStart(4)}   ${`${r.lost} of ${r.total} (${r.min}-${r.max})`.padEnd(30)}  ${r.raw}` : `${r.cfg.padEnd(18)}   no complete round`);
  }
  const c = controls;
  console.log(`\nControls: foreign note called present ${c.foreignSaidPresent.wrong} of ${c.foreignSaidPresent.n}; own sentence called absent ${c.verbatimSaidAbsent.wrong} of ${c.verbatimSaidAbsent.n}.`);
}

const o = args(process.argv.slice(2));
if (o.report) report(o); else if (o.second) await second(o); else if (o.planted) await planted(o); else await judge(o);
