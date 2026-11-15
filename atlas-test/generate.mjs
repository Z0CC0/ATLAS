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
 *   node generate.mjs --parallel 3 --model <id> --limit N  side by side, another model, a sample
 *   node generate.mjs --print                            the prompts, to paste by hand
 *
 * Needs the Claude Code CLI on PATH and logged in. caveman rows need it installed, or
 * CAVEMAN_DIR=<folder of the plugin>.
 *
 * Each answer runs in an empty folder of its own, with only the plugin under test loaded through
 * --plugin-dir and the user's settings left out through --setting-sources. So nothing else
 * installed on the machine is in the measure, and nothing installed on it is touched. Settings
 * merge: `--settings {"enabledPlugins":{}}` would leave every installed plugin on, hooks included.
 *
 * One exception: caveman reads its level from one file for the whole machine. Its rows run one level
 * at a time, and that file is put back at the end, even after a crash on the next run.
 */

import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir, tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const CAVEMAN_STATE = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), '.caveman-active');
const SAVED = join(HERE, '.user-state.json');
const MODEL_DEFAULT = 'claude-opus-5-5';

function cavemanDir() {
  if (process.env.CAVEMAN_DIR) return process.env.CAVEMAN_DIR;
  const cache = join(homedir(), '.claude', 'plugins', 'cache', 'caveman', 'caveman');
  if (!existsSync(cache)) return null;
  const v = readdirSync(cache).sort().pop();
  return v ? join(cache, v) : null;
}

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
  // text too. The other builds are NOT here, on purpose: they carry the compression rules of
  // atlas, and generating them would pay calls to measure the same rules again.
  { id: 'atlasmin-low', atlas: 'low:off:off', caveman: 'off', variant: 'atlas-min' },
  { id: 'atlasmin-high', atlas: 'high:off:off', caveman: 'off', variant: 'atlas-min' },

  // The `minx-*` and `minx2-*` rows in generated/sameday.* were two experiments on
  // 2026-09-26: the compact ruleset and the shorter reminder that the plugin
  // now ships. Both are now the plugin itself, so the configurations are gone.

  // caveman, the plugin ATLAS is most often compared with. Needs it installed; the
  // rows are skipped otherwise. Its level is passed through its own state file and
  // CAVEMAN_DEFAULT_MODE, and ATLAS is off for these.
  { id: 'caveman-lite', atlas: 'off:off:off', caveman: 'lite' },
  { id: 'caveman-full', atlas: 'off:off:off', caveman: 'full' },
  { id: 'caveman-ultra', atlas: 'off:off:off', caveman: 'ultra' },
  // The same three levels on a newer release of it, one at a time with --only and CAVEMAN_DIR.
  { id: 'caveman4-lite', atlas: 'off:off:off', caveman: 'lite', onRequest: true },
  { id: 'caveman4-full', atlas: 'off:off:off', caveman: 'full', onRequest: true },
  { id: 'caveman4-ultra', atlas: 'off:off:off', caveman: 'ultra', onRequest: true },

  // i-have-adhd, a formatting skill rather than a compressor: it shapes answers for a
  // reader with ADHD (lead with the action, numbered steps, restate the state, end
  // with a next action). It ships as a skill with no hook and has to be invoked, so
  // here its SKILL.md is appended to the system prompt, which is "always on" — the
  // strongest version of it. A copy of the file and its MIT licence sit in
  // third-party/i-have-adhd; COMMIT names the revision.
  { id: 'adhd', atlas: 'off:off:off', caveman: 'off', systemPrompt: join(HERE, 'third-party', 'i-have-adhd', 'SKILL.md') },

  // The same rules delivered once as a Claude Code output style (written into the
  // system prompt, no hook, no per-turn reminder) instead of injected at session start
  // and re-stated every turn. ATLAS itself is off for these rows. The style files are
  // the hook's own output, written by style-rules.mjs; run it first. If the headless
  // CLI ignored the style, the billed input would equal `none`: the data would say so.
  { id: 'style-low', atlas: 'off:off:off', caveman: 'off', outputStyle: 'atlas-bench-low', onRequest: true },
  { id: 'style-high', atlas: 'off:off:off', caveman: 'off', outputStyle: 'atlas-bench-high', onRequest: true },
];

// No tool may run: the facts are in the prompt, and a search would measure the search.
const DISALLOWED = 'WebSearch,WebFetch,Bash,Read,Edit,Write,Glob,Grep,Task,TodoWrite,Agent';
// No MCP server either: their tool schemas are tens of thousands of input tokens that
// no row can use, paid on every call. Since 2026-10-15; the rows of one run stay
// comparable with each other, the billed input is not comparable with earlier runs.
const LEAN = ['--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}'];

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
  const o = { dryRun: false, only: null, print: false, missing: false, rounds: 1, cases: null, parallel: 3, model: MODEL_DEFAULT, limit: Infinity };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dryRun = true;
    else if (a === '--print') o.print = true;
    else if (a === '--missing') o.missing = true;
    else if (a === '--only') o.only = argv[++i];
    else if (a === '--rounds') o.rounds = Math.max(1, Number(argv[++i]) || 1);
    else if (a === '--cases') o.cases = argv[++i];
    else if (a === '--parallel') o.parallel = Math.max(1, Number(argv[++i]) || 1);
    else if (a === '--model') o.model = argv[++i];
    else if (a === '--limit') o.limit = Number(argv[++i]);
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

/** caveman's one file: saved on disk, so a series that dies is repaired by the next one. */
function saveCaveman() {
  if (existsSync(SAVED)) {
    try {
      console.log('A previous series did not restore caveman: restoring it now.');
      restoreCaveman(JSON.parse(readFileSync(SAVED, 'utf8')));
    } catch (e) { /* unreadable file: continue with the current state */ }
  }
  const saved = { caveman: existsSync(CAVEMAN_STATE) ? readFileSync(CAVEMAN_STATE, 'utf8') : null };
  writeFileSync(SAVED, JSON.stringify(saved));
  return saved;
}

function restoreCaveman(saved) {
  if (saved.caveman === null) { if (existsSync(CAVEMAN_STATE)) unlinkSync(CAVEMAN_STATE); } else writeFileSync(CAVEMAN_STATE, saved.caveman);
}

/** The folder a configuration runs in, with the dials of that build set for that folder alone. */
function folderFor(cfg, plugin) {
  const dir = mkdtempSync(join(tmpdir(), `atlas-bench-${cfg.id}-`));
  if (cfg.atlas !== 'off:off:off') {
    const conf = createRequire(import.meta.url)(join(plugin, 'hooks', 'atlas-config.js'));
    conf.setProject(dir);
    mkdirSync(dirname(conf.flagPath()), { recursive: true });
    const [level, rigour, check] = cfg.atlas.split(':');
    conf.writeState({ level, rigour, check, silent: 'off' });
    return { dir, flag: conf.flagPath() };
  }
  return { dir, flag: null };
}

function call(args, cwd, env) {
  return new Promise((resolve, reject) => {
    const child = execFile('claude', args, { cwd, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, windowsHide: true, timeout: 15 * 60 * 1000 }, (err, stdout, stderr) => {
      if (err && !stdout) return reject(new Error((stderr || err.message).trim().split('\n')[0]));
      try { resolve(JSON.parse(stdout)); } catch { reject(new Error(`no JSON: ${(stderr || stdout).trim().slice(0, 160)}`)); }
    });
    child.stdin?.end();
  });
}

async function main() {
  const o = args(process.argv.slice(2));
  const casesFile = o.cases || join(HERE, 'cases', 'compression.en.json');
  if (!existsSync(casesFile)) { console.error(`Cases file not found: ${casesFile}`); process.exit(1); }
  const raw = JSON.parse(readFileSync(casesFile, 'utf8'));
  const cases = Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith('_')));
  const label = basename(casesFile).replace(/\.json$/, '');
  const language = raw._language || 'en';
  const OUT = join(HERE, 'generated', label);

  if (o.print) { printPrompts(cases, label, language); return; }

  const configs = o.only ? CONFIGURATIONS.filter((c) => c.id === o.only) : CONFIGURATIONS.filter((c) => !c.onRequest);
  if (!configs.length) { console.error(`Unknown configuration. Known: ${CONFIGURATIONS.map((c) => c.id).join(', ')}`); process.exit(1); }
  const caveman = cavemanDir();

  const jobs = [];
  for (let r = 1; r <= o.rounds; r++) {
    for (const cfg of configs) {
      if (cfg.caveman !== 'off' && !caveman) continue;
      for (const name of Object.keys(cases)) {
        const dest = join(OUT, `${name}.${cfg.id}.${r}.txt`);
        if (o.missing && existsSync(dest)) continue;
        jobs.push({ r, cfg, name, dest });
      }
    }
  }
  const todo = jobs.slice(0, o.limit);
  if (o.dryRun) {
    console.log(`${Object.keys(cases).length} cases x ${configs.length} configurations x ${o.rounds} rounds: ${todo.length} calls to make, model ${o.model}. Nothing spent.`);
    return;
  }
  mkdirSync(OUT, { recursive: true });

  // caveman's level is one file for the machine, so a level runs alone; everything else side by side
  const saved = saveCaveman();
  const restore = () => { restoreCaveman(saved); try { if (existsSync(SAVED)) unlinkSync(SAVED); } catch (e) { /* gone */ } };
  process.on('exit', restore);
  process.on('SIGINT', () => { restore(); process.exit(130); });

  const groups = new Map();
  for (const j of todo) { const k = j.cfg.caveman === 'off' ? 'other' : j.cfg.caveman; (groups.get(k) || groups.set(k, []).get(k)).push(j); }

  const folders = new Map();
  const folder = (cfg) => {
    if (!folders.has(cfg.id)) {
      const plugin = cfg.caveman !== 'off' ? caveman : cfg.atlas !== 'off:off:off' ? join(HERE, '..', cfg.variant || 'atlas') : null;
      folders.set(cfg.id, { ...folderFor(cfg, plugin), plugin });
    }
    return folders.get(cfg.id);
  };

  let n = 0, failed = 0, cost = 0, inARow = 0;
  const started = Date.now();
  for (const [group, list] of groups) {
    if (group !== 'other') writeFileSync(CAVEMAN_STATE, group);
    const queue = [...list];
    await Promise.all(Array.from({ length: o.parallel }, async () => {
      while (queue.length && inARow < 3) {
        const { r, cfg, name, dest } = queue.shift();
        const f = folder(cfg);
        const argv = ['-p', prompt(cases[name], language), '--model', o.model, '--output-format', 'json', '--setting-sources', 'project', '--disallowed-tools', DISALLOWED, ...LEAN];
        if (f.plugin) argv.push('--plugin-dir', f.plugin);
        if (cfg.systemPrompt) {
          // Split on either line ending: the file is CRLF.
          const body = readFileSync(cfg.systemPrompt, 'utf8').split(/\r?\n---\r?\n/).slice(1).join('\n---\n');
          if (!body.trim()) throw new Error(`empty system prompt from ${cfg.systemPrompt}`);
          argv.push('--append-system-prompt', body);
        }
        if (cfg.outputStyle) argv.push('--settings', JSON.stringify({ outputStyle: cfg.outputStyle }));
        try {
          const j = await call(argv, f.dir, { ...process.env, CAVEMAN_DEFAULT_MODE: cfg.caveman });
          if (j.is_error) throw new Error(String(j.result).slice(0, 160));
          writeFileSync(dest, (j.result || '').trim() + '\n');
          // Tokens come from the API's own usage block. `output_tokens` includes the model's
          // thinking, which is cost but not text anyone reads: measure.mjs subtracts it.
          writeFileSync(dest.replace(/\.txt$/, '.json'), JSON.stringify({
            output_tokens: j.usage?.output_tokens ?? null,
            thinking_tokens: j.usage?.output_tokens_details?.thinking_tokens ?? null,
            cache_creation_input_tokens: j.usage?.cache_creation_input_tokens ?? null,
            cache_read_input_tokens: j.usage?.cache_read_input_tokens ?? null,
            input_tokens: j.usage?.input_tokens ?? null,
            model: Object.keys(j.modelUsage || {})[0] ?? null,
            duration_ms: j.duration_api_ms ?? null,
          }, null, 2));
          cost += j.total_cost_usd || 0;
          inARow = 0;
          n++;
          if (n % 25 === 0 || n === todo.length) console.log(`${n}/${todo.length}, reported cost $${cost.toFixed(2)}, ${((Date.now() - started) / 60000).toFixed(0)} min`);
        } catch (e) {
          failed++;
          inARow++;
          console.log(`FAILED round ${r} ${name} ${cfg.id}: ${e.message}`);
        }
      }
    }));
    if (inARow >= 3) { console.log('Three failures in a row: stopped. Run again with --missing to resume.'); break; }
  }
  for (const { dir, flag } of folders.values()) {
    try { rmSync(dir, { recursive: true, force: true }); if (flag) rmSync(flag, { force: true }); } catch (e) { /* left for the OS */ }
  }
  restore();
  console.log(`\nDone in ${((Date.now() - started) / 60000).toFixed(0)} minutes. ${n} answers in ${OUT}, reported cost $${cost.toFixed(2)}.`);
  if (failed) console.log(`${failed} calls failed: run again with --missing to pick them up.`);
  console.log(`Next: node judge-notes.mjs --cases ${casesFile}, then --second, then --report; node measure.mjs --cases ${casesFile}`);
}

await main();
