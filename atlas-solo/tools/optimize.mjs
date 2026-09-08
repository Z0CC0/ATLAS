#!/usr/bin/env node
/**
 * ATLAS — local optimiser.
 *
 * Reads your own session transcripts and says how to use the plugin better:
 * which dial fits the way you actually work, what you are paying for and not
 * using, where a setting costs more than it returns.
 *
 * Nothing leaves the machine. No account, no gateway, no API key. The files it
 * reads are already on your disk; it only adds arithmetic.
 *
 * Usage:
 *   node tools/optimize.mjs                 last 10 sessions of the default project
 *   node tools/optimize.mjs --sessions 20
 *   node tools/optimize.mjs --dir <path>
 *   node tools/optimize.mjs --json
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';

// What each dial costs, measured with tiktoken o200k_base on this plugin.
// Approximations: that is not Claude's tokenizer. Relative comparisons hold.
const COST = {
  injected: { low: 2165, high: 2357 },
  reminder: { low: 42, high: 47 },
  checkExtra: 842, // injected rules only, not the lookups it causes
  askExtra: 263,
  descriptions: 2632,
};

// How much each level compresses: output tokens against no plugin, same prompt, fresh
// session each time, answers written by the plugin and not by hand. Measured on the
// version named below; run `tests` to see how.
const SAVING = { off: 0, low: 0.493, high: 0.508 };
const SAVING_VERSION = '0.44.0';

function parseArgs(argv) {
  const o = { sessions: 10, dir: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--sessions') o.sessions = Number(argv[++i]) || 10;
    else if (argv[i] === '--dir') o.dir = argv[++i];
    else if (argv[i] === '--json') o.json = true;
  }
  return o;
}

/**
 * The project folder whose sessions are real conversations.
 *
 * This used to pick the folder with the most `.jsonl` files, and that is exactly
 * backwards for anyone who has ever scripted `claude -p`. Each scripted call
 * writes its own transcript, so one afternoon of benchmarking buries a year of
 * real work by sheer count. Measured on the machine this was written on: 24.696
 * scripted sessions of 40 KB against 30 real ones of 1.8 MB. The advice came out
 * confident and wrong — "your answers are 4 tokens, compression buys you
 * nothing" — because a one-shot `-p` call answers once and exits.
 *
 * Size separates the two and count cannot: a real session accumulates turns, a
 * scripted one is a question and an answer. So folders are ranked by the median
 * size of a sample of their transcripts, and the count only breaks ties.
 *
 * The sample exists because stat-ing 24.696 files to choose a folder costs more
 * than everything else here put together. A median over 40 files spread across
 * the listing is enough to tell 40 KB from 1.8 MB.
 */
const SAMPLE = 40;

function medianSize(dir, files) {
  const step = Math.max(1, Math.floor(files.length / SAMPLE));
  const sizes = [];
  for (let i = 0; i < files.length && sizes.length < SAMPLE; i += step) {
    try { sizes.push(statSync(join(dir, files[i])).size); } catch { /* gone in the meantime */ }
  }
  if (!sizes.length) return 0;
  sizes.sort((a, b) => a - b);
  return sizes[Math.floor(sizes.length / 2)];
}

/**
 * Claude Code names a project folder after the working directory, with every
 * separator and colon turned into a dash. When this runs from inside a project
 * that folder is the answer and no ranking is needed: you are asking how you
 * work here, not how you work on average.
 */
function projectFolder(root) {
  const name = process.cwd().replace(/[\\/:]/g, '-');
  const d = join(root, name);
  try {
    if (statSync(d).isDirectory() && readdirSync(d).some((f) => f.endsWith('.jsonl'))) return d;
  } catch { /* not inside a project that has sessions */ }
  return null;
}

function findDir(explicit) {
  if (explicit) return explicit;
  const root = join(homedir(), '.claude', 'projects');
  if (!existsSync(root)) return null;
  const here = projectFolder(root);
  if (here) return here;
  const dirs = [];
  for (const name of readdirSync(root)) {
    const d = join(root, name);
    let files;
    try {
      if (!statSync(d).isDirectory()) continue;
      files = readdirSync(d).filter((f) => f.endsWith('.jsonl'));
    } catch { continue; }
    if (!files.length) continue;
    dirs.push({ d, n: files.length, median: medianSize(d, files) });
  }
  if (!dirs.length) return null;
  dirs.sort((a, b) => b.median - a.median || b.n - a.n);
  return dirs[0].d;
}

function readSession(path) {
  const st = { turns: 0, output: 0, baseline: null, answers: [], searched: false, hadFacts: false };
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t) continue;
    let d;
    try { d = JSON.parse(t); } catch { continue; }

    if (d.type === 'assistant' && d.message) {
      const u = d.message.usage || {};
      const ctx = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
      if (st.baseline === null && ctx > 0) st.baseline = ctx;
      st.turns += 1;
      st.output += u.output_tokens || 0;
      if (u.output_tokens) st.answers.push(u.output_tokens);
      for (const b of d.message.content || []) {
        if (b && b.type === 'tool_use' && /search|fetch/i.test(b.name || '')) st.searched = true;
      }
    } else if (d.type === 'user' && d.message) {
      const txt = JSON.stringify(d.message.content || '');
      // A rough signal that the session asked about facts about the world,
      // which is the only kind of question `check` earns its cost on.
      if (/\b(version|versione|prezzo|price|quanto costa|latest|ultima versione|API|docs?)\b/i.test(txt)) {
        st.hadFacts = true;
      }
    }
  }
  return st;
}

const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};
const fmt = (n) => Math.round(n).toLocaleString('en-US');

function advise(stats) {
  const out = [];
  const answers = stats.flatMap((s) => s.answers);
  const med = median(answers);
  const turns = stats.reduce((n, s) => n + s.turns, 0);
  const avgTurns = turns / Math.max(stats.length, 1);
  const baselines = stats.map((s) => s.baseline).filter(Boolean);
  const avgBaseline = baselines.reduce((a, b) => a + b, 0) / Math.max(baselines.length, 1);

  // --- which compression level pays for itself ---
  // A level earns its per-turn reminder when the saving on one answer exceeds it.
  const rows = ['low', 'high'].map((lv) => {
    const savedPerTurn = med * SAVING[lv];
    const breakEven = COST.reminder[lv] / SAVING[lv];
    return { lv, savedPerTurn, breakEven, net: savedPerTurn - COST.reminder[lv] };
  });
  const paying = rows.filter((r) => r.net > 0);

  out.push({
    title: 'Compression',
    lines: [
      `Median answer over ${stats.length} sessions: ${fmt(med)} tokens.`,
      ...rows.map(
        (r) =>
          `  ${r.lv.padEnd(5)} saves ~${fmt(r.savedPerTurn)}/turn, reminder costs ${COST.reminder[r.lv]}, ` +
          `net ${r.net > 0 ? '+' : ''}${fmt(r.net)} — break-even at ${fmt(r.breakEven)} tokens per answer`
      ),
      paying.length
        ? `Your answers pay for: ${paying.map((r) => r.lv).join(', ')}. Below that the dial costs more than it returns.`
        : 'Your answers are short enough that no level pays for its own reminder. Compression is buying you reading speed, not tokens.',
    ],
  });

  // --- the number paid every session regardless ---
  const share = avgBaseline ? (COST.descriptions + COST.injected.low) / avgBaseline : 0;
  out.push({
    title: 'Fixed cost',
    lines: [
      `Average starting context: ${fmt(avgBaseline)} tokens, paid before a word is written.`,
      `ATLAS is about ${fmt(COST.descriptions + COST.injected.low)} of it at low (${(share * 100).toFixed(1)}%).`,
      avgTurns < 6
        ? `Your sessions average ${avgTurns.toFixed(1)} turns. Short sessions pay the fixed cost and barely use it — the plugin is worth most in long ones.`
        : `Your sessions average ${avgTurns.toFixed(1)} turns, so the fixed cost spreads well.`,
    ],
  });

  // --- check: paid for, used? ---
  const factSessions = stats.filter((s) => s.hadFacts).length;
  const searchSessions = stats.filter((s) => s.searched).length;
  out.push({
    title: 'check',
    lines: [
      `Sessions that asked about verifiable facts: ${factSessions} of ${stats.length}. Sessions that actually searched: ${searchSessions}.`,
      factSessions === 0
        ? `None of these sessions asked about facts about the world. Leaving check off is right for this kind of work — it would be ${fmt(COST.checkExtra)} tokens a session for nothing.`
        : factSessions > searchSessions
        ? `${factSessions - searchSessions} session(s) asked about facts without searching. That is exactly what check is for: turn it on for those.`
        : `Facts were looked up when they came up. check would mostly confirm what already happens.`,
    ],
  });

  // --- ask ---
  out.push({
    title: 'ask',
    lines: [
      avgTurns > 15
        ? `Long sessions (${avgTurns.toFixed(1)} turns on average) often mean the goal moved while working. ask costs ~${COST.askExtra} tokens a session and a few questions up front; it is cheap against one wrong direction.`
        : `Sessions are short (${avgTurns.toFixed(1)} turns on average). ask earns its place on open-ended work, less on quick exchanges.`,
    ],
  });

  return { median: med, avgTurns, avgBaseline, sessions: stats.length, advice: out };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dir = findDir(args.dir);
  if (!dir) {
    console.error('No transcript folder found. Pass one with --dir.');
    process.exit(1);
  }

  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => ({ f: join(dir, f), m: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m)
    .slice(0, args.sessions)
    .map((x) => x.f);

  const all = files.map(readSession).filter((s) => s.turns > 0);
  // Even the right folder can hold a few scripted calls. A one-turn session says
  // nothing about how someone works: a question and an answer, without the context
  // a conversation accumulates.
  const stats = all.filter((s) => s.turns > 1);
  const dropped = all.length - stats.length;
  if (!stats.length) {
    console.error(all.length
      ? `Only one-turn sessions here (${all.length}). Those are scripted calls, not conversations. Pass a folder with --dir.`
      : 'No usable sessions found.');
    process.exit(1);
  }

  const result = advise(stats);
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`\nATLAS — read ${result.sessions} sessions from ${basename(dir)}\n`);
  if (dropped) {
    console.log(`${dropped} one-turn sessions ignored: scripted calls, not conversations.\n`);
  }
  for (const block of result.advice) {
    console.log(`--- ${block.title} ---`);
    for (const l of block.lines) console.log(l);
    console.log();
  }
  console.log(`How much each level compresses was measured on ${SAVING_VERSION}. Everything else here`);
  console.log('is read from this machine today.');
  console.log('Numbers come from your own transcripts. Nothing was sent anywhere.');
  console.log('Token counts are tiktoken approximations, not Claude\'s tokenizer: compare them to each other, not to a bill.\n');
}

main();
