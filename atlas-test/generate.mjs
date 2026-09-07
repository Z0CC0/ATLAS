#!/usr/bin/env node
/**
 * ATLAS bench — step 1: have the plugin write the answers that get measured.
 *
 * Every earlier measurement of this project, for three versions, was made on texts
 * written by hand. Those measure how well the person writing applies the rules, not
 * how well the plugin does: it was the longest-lived defect of the whole work and it
 * produced wrong numbers in both directions.
 *
 * Here the answers are produced by the model with the plugin really installed, one
 * stateless session per answer, through the CLI in non-interactive mode.
 *
 * The information is held constant by construction: every configuration receives the
 * same question and the same sheet of facts. Only the form can change, which is
 * exactly what the rules govern. Letting each configuration find its own facts would
 * measure the variance of the search, not the compression.
 *
 * Usage:
 *   node generate.mjs --dry-run                          spends nothing, prints what it would do
 *   node generate.mjs                                    one round on the English cases
 *   node generate.mjs --rounds 2                         two rounds
 *   node generate.mjs --cases cases/compression.it.json  other questions
 *   node generate.mjs --cases your-file.json             your own questions
 *   node generate.mjs --only atlas-high                  one configuration
 *   node generate.mjs --missing                          only the answers not yet on disk (resume)
 *   node generate.mjs --print                            the prompts, to paste by hand
 *
 * Needs the Claude Code CLI on PATH and authenticated (`claude`, then `/login`, once).
 * Needs the plugin under test installed; see INSTALLED below.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const ATLAS_STATE = join(homedir(), '.claude', '.atlas-state');
const CAVEMAN_STATE = join(homedir(), '.claude', '.caveman-active');
const SAVED = join(HERE, '.user-state.json');

// Where the installed ATLAS plugin keeps its rules. The `atlas-min` rows are measured
// by swapping this file with the minimal build's rules for the duration of those
// calls, and swapping it back afterwards. The default is where the Claude desktop
// app puts an uploaded plugin; set ATLAS_INSTALLED to the SKILL.md of your install.
const INSTALLED = process.env.ATLAS_INSTALLED
  || join(homedir(), '.claude', 'plugins', 'marketplaces', 'local-desktop-app-uploads', 'atlas', 'skills', 'atlas', 'SKILL.md');

// `none` is the row every earlier comparison lacked: without the zero a dial can look
// cheap when it is only added cost.
const CONFIGURATIONS = [
  { id: 'none', atlas: 'off:off:off', caveman: 'off' },

  { id: 'atlas-low', atlas: 'low:off:off', caveman: 'off' },
  { id: 'atlas-high', atlas: 'high:off:off', caveman: 'off' },
  { id: 'low-ask', atlas: 'low:ask:off', caveman: 'off' },
  { id: 'low-check', atlas: 'low:off:on', caveman: 'off' },
  { id: 'low-ask-check', atlas: 'low:ask:on', caveman: 'off' },
  { id: 'high-ask', atlas: 'high:ask:off', caveman: 'off' },
  { id: 'high-check', atlas: 'high:off:on', caveman: 'off' },
  { id: 'high-ask-check', atlas: 'high:ask:on', caveman: 'off' },

  // atlas-min: the same compression rules without the sections on provenance, tools,
  // verification, method and rigour. Worth measuring because those sections produce
  // text too. atlas-solo is NOT here, on purpose: its SKILL.md is byte-identical to
  // atlas, verified with diff. Only the subagents differ, and they do not touch the
  // rules. Generating it would pay calls to measure the same rules twice.
  { id: 'atlasmin-low', atlas: 'low:off:off', caveman: 'off', variant: 'atlas-min' },
  { id: 'atlasmin-high', atlas: 'high:off:off', caveman: 'off', variant: 'atlas-min' },

  // caveman, the plugin ATLAS is most often compared with. Needs it installed; the
  // rows are skipped otherwise. Its level is passed through its own state file and
  // CAVEMAN_DEFAULT_MODE, and ATLAS is off for these.
  { id: 'caveman-lite', atlas: 'off:off:off', caveman: 'lite' },
  { id: 'caveman-full', atlas: 'off:off:off', caveman: 'full' },
  { id: 'caveman-ultra', atlas: 'off:off:off', caveman: 'ultra' },
];

const rulesOf = (variant) => join(HERE, '..', variant || 'atlas', 'skills', 'atlas', 'SKILL.md');
let activeVariant = null;
function activateVariant(name) {
  const wanted = name || 'atlas';
  if (activeVariant === wanted) return;
  const source = rulesOf(wanted);
  if (!existsSync(source)) throw new Error(`Rules not found: ${source}`);
  writeFileSync(INSTALLED, readFileSync(source, 'utf8'));
  activeVariant = wanted;
}

// No tool may run: the facts are in the prompt, and a search would measure the search.
const DISALLOWED = 'WebSearch,WebFetch,Bash,Read,Edit,Write,Glob,Grep,Task,TodoWrite,Agent';

const INSTRUCTIONS = {
  it: {
    facts: 'Rispondi usando esclusivamente questi fatti, tutti, senza cercarne altri:',
    write: 'Scrivi la risposta per la persona che ha fatto la domanda, non un riassunto dei punti qui sopra.',
    source: 'Origine dei dati',
  },
  en: {
    facts: 'Answer using only these facts, all of them, without looking for others:',
    write: 'Write the answer for the person who asked, not a summary of the points above.',
    source: 'Source of the data',
  },
};

function prompt(c, language) {
  const t = INSTRUCTIONS[language] || INSTRUCTIONS.en;
  return [c.question, '', t.facts, ...c.notes.map((n) => '- ' + n), '', t.write, `${t.source}: ${c.source}.`].join('\n');
}

function args(argv) {
  const o = { dryRun: false, only: null, print: false, missing: false, rounds: 1, cases: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dryRun = true;
    else if (a === '--print') o.print = true;
    else if (a === '--missing') o.missing = true;
    else if (a === '--only') o.only = argv[++i];
    else if (a === '--rounds') o.rounds = Math.max(1, Number(argv[++i]) || 1);
    else if (a === '--cases') o.cases = argv[++i];
  }
  return o;
}

/** The prompts as a file, for whoever cannot or will not run the CLI. */
function printPrompts(cases, label, language) {
  const lines = [
    `# ATLAS bench — ${CONFIGURATIONS.length} configurations, ${Object.keys(cases).length} questions`, '',
    'Rules without which the measurement is worthless:', '',
    '- a fresh session for every configuration, with the state set BEFORE opening it',
    '- one plugin at a time: with atlas on, caveman off, and the other way round',
    '- the prompts pasted one at a time, whole, with nothing added',
    '- no web searches: the facts are already in the prompt',
    `- every answer saved as \`generated/${label}/<case>.<configuration>.1.txt\``, '',
    '## The configurations', '',
    '| configuration | `~/.claude/.atlas-state` | caveman level |', '|---|---|---|',
    ...CONFIGURATIONS.map((c) => `| ${c.id} | \`${c.atlas}\` | \`${c.caveman}\` |`), '',
    '## The prompts', '',
  ];
  for (const [name, c] of Object.entries(cases)) lines.push(`### ${name}`, '', '```', prompt(c, language), '```', '');
  const dest = join(HERE, 'prompts-to-paste.md');
  writeFileSync(dest, lines.join('\n'));
  console.log(`Written ${dest}`);
}

/**
 * The user's state is not kept only in memory. Restoring ran at process exit, so a
 * machine shutdown left the dials where the last configuration had put them. It
 * happened. Now the starting state also goes to disk: if the file is still there on
 * the next run, a series died halfway and the state is put back before anything else.
 */
function saveState() {
  if (existsSync(SAVED)) {
    try {
      console.log('A previous series did not restore the state: restoring it now.');
      apply(JSON.parse(readFileSync(SAVED, 'utf8')));
    } catch (e) { /* unreadable file: continue with the current state */ }
  }
  const s = {};
  for (const [k, p] of [['atlas', ATLAS_STATE], ['caveman', CAVEMAN_STATE]]) s[k] = existsSync(p) ? readFileSync(p, 'utf8') : null;
  writeFileSync(SAVED, JSON.stringify(s));
  return s;
}

function apply(s, attempts = 3) {
  for (const [k, p] of [['atlas', ATLAS_STATE], ['caveman', CAVEMAN_STATE]]) {
    if (s[k] === null || s[k] === undefined) { if (existsSync(p)) unlinkSync(p); continue; }
    for (let i = 0; i < attempts; i++) {
      writeFileSync(p, s[k]);
      if (readFileSync(p, 'utf8') === s[k]) break;
    }
  }
}

function main() {
  const o = args(process.argv.slice(2));
  const casesFile = o.cases || join(HERE, 'cases', 'compression.en.json');
  if (!existsSync(casesFile)) { console.error(`Cases file not found: ${casesFile}`); process.exit(1); }
  const raw = JSON.parse(readFileSync(casesFile, 'utf8'));
  const cases = Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith('_')));
  const label = basename(casesFile).replace(/\.json$/, '');
  const language = raw._language || 'en';
  const OUT = join(HERE, 'generated', label);

  if (o.print) { printPrompts(cases, label, language); return; }

  const configs = o.only ? CONFIGURATIONS.filter((c) => c.id === o.only) : CONFIGURATIONS;
  if (!configs.length) { console.error(`Unknown configuration. Known: ${CONFIGURATIONS.map((c) => c.id).join(', ')}`); process.exit(1); }

  mkdirSync(OUT, { recursive: true });
  const saved = o.dryRun ? null : saveState();
  const restore = () => {
    if (!saved) return;
    apply(saved);
    try { if (activeVariant && activeVariant !== 'atlas') activateVariant('atlas'); } catch (e) { /* rules already back */ }
    try { if (existsSync(SAVED)) unlinkSync(SAVED); } catch (e) { /* nothing to remove */ }
  };
  process.on('exit', restore);
  process.on('SIGINT', () => { restore(); process.exit(130); });

  const jobs = [];
  for (let r = 1; r <= o.rounds; r++) {
    for (const cfg of configs) {
      for (const name of Object.keys(cases)) {
        const dest = join(OUT, `${name}.${cfg.id}.${r}.txt`);
        if (o.missing && existsSync(dest)) continue;
        jobs.push({ r, cfg, name, dest });
      }
    }
  }
  if (o.dryRun) {
    console.log(`Cases file: ${casesFile}`);
    console.log(`${Object.keys(cases).length} cases x ${configs.length} configurations x ${o.rounds} rounds`);
    console.log(`${jobs.length} calls to make. Nothing spent, nothing written.`);
    return;
  }
  // Grouped by variant so the rules file is swapped as rarely as possible.
  jobs.sort((a, b) => String(a.cfg.variant).localeCompare(String(b.cfg.variant)) || a.r - b.r);

  let n = 0, failed = 0;
  const started = Date.now();
  for (const { r, cfg, name, dest } of jobs) {
    n++;
    activateVariant(cfg.variant);
    writeFileSync(ATLAS_STATE, cfg.atlas);
    writeFileSync(CAVEMAN_STATE, cfg.caveman);
    process.stdout.write(`[${String(n).padStart(4)}/${jobs.length}] round ${r} ${name} — ${cfg.id} ... `);
    try {
      const out = execFileSync('claude', ['-p', prompt(cases[name], language), '--output-format', 'json', '--disallowed-tools', DISALLOWED], {
        encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, CAVEMAN_DEFAULT_MODE: cfg.caveman },
      });
      const j = JSON.parse(out);
      writeFileSync(dest, (j.result || '').trim() + '\n');
      // Tokens come from the API's own usage block. `output_tokens` includes the
      // model's thinking, which is cost but not text anyone reads: measure.mjs
      // subtracts `thinking_tokens`.
      writeFileSync(dest.replace(/\.txt$/, '.json'), JSON.stringify({
        output_tokens: j.usage?.output_tokens ?? null,
        thinking_tokens: j.usage?.output_tokens_details?.thinking_tokens ?? null,
        cache_creation_input_tokens: j.usage?.cache_creation_input_tokens ?? null,
        cache_read_input_tokens: j.usage?.cache_read_input_tokens ?? null,
        input_tokens: j.usage?.input_tokens ?? null,
        model: Object.keys(j.modelUsage || {})[0] ?? null,
        duration_ms: j.duration_api_ms ?? null,
      }, null, 2));
      console.log(`${(j.usage?.output_tokens ?? 0) - (j.usage?.output_tokens_details?.thinking_tokens ?? 0)} answer tokens`);
    } catch (e) {
      failed++;
      const msg = (e.stdout || '') + (e.stderr || '') || e.message;
      console.log('FAILED');
      console.log('   ' + msg.trim().split('\n')[0]);
      if (/not logged in/i.test(msg)) {
        console.log('\n   The CLI is not authenticated. Open a terminal, run `claude`, then `/login`.');
        process.exit(1);
      }
    }
  }
  restore();
  console.log(`\nDone in ${((Date.now() - started) / 60000).toFixed(0)} minutes. ${jobs.length - failed} answers in ${OUT}`);
  if (failed) console.log(`${failed} calls failed: run again with --missing to pick them up.`);
  console.log(`Next: node judge.mjs --cases ${casesFile}, then node measure.mjs --cases ${casesFile}`);
}

main();
