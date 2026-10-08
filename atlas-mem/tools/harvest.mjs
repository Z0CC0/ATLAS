#!/usr/bin/env node
/**
 * ATLAS memory — harvest: candidates for the memory, from what already exists.
 *
 * Nothing goes into the vault by itself. This tool does the deterministic part and keeps
 * an inbox: it pulls the lines that look like decisions out of past sessions and project
 * documents (`extract`, `docs`), writes the candidates a model proposed as files in
 * `<vault>/.atlas/inbox/` (`inbox write`), and moves or removes them when the user has
 * decided (`inbox accept`, `inbox reject`). A rejected candidate is remembered by the hash
 * of its source so it is never proposed again.
 *
 *   node harvest.mjs extract <claude-projects-dir> --out <dir> [--min-kb 50] [--skip a,b]
 *   node harvest.mjs claude  <conversations.json> <out-dir> [--min-chars 2000]
 *   node harvest.mjs docs    <root> --out <dir> [--max-kb 120]
 *   node harvest.mjs inbox write  <vault> <candidates.json>
 *   node harvest.mjs inbox list   <vault> [--json]
 *   node harvest.mjs inbox accept <vault> <slug>
 *   node harvest.mjs inbox reject <vault> <slug>
 *   node harvest.mjs run    <extract-dir> <out-dir> <vault> [--parallel 4] [--model <id>] [--write] [--dry]
 *   node harvest.mjs judge  <vault> [--min 0.35] [--parallel 2] [--model <id>] [--dry] [--redo]
 *   node harvest.mjs pairs  <vault> [--min 0.35] [--json]
 *   node harvest.mjs verdicts write <vault> <verdicts.json>
 *   node harvest.mjs verdicts list  <vault> [--json]
 *
 * `extract` reads Claude Code transcripts (one JSONL per session) and keeps, in order, the
 * first request of the session, the user's messages that read like a decision, a rule, a
 * preference or a correction, and the assistant's paragraphs that state one. Tool calls,
 * tool results and thinking are dropped. The result is a short markdown per session that a
 * model can turn into candidates; what the model proposes is still only a candidate.
 */

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
import { listFiles } from './repo.mjs';

const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16);

// ---------------------------------------------------------------------------------------
// what reads like a decision

const USER_SIGNAL = /\b(decid\w*|voglio|vorrei|non voglio|mai|sempre|regol[ae]|d'ora in poi|da ora|da adesso|ricorda\w*|preferis\w*|non mi piace|mi piace|sbagliat\w*|giusto|teniamo|usiamo|non usare|non usiamo|scart\w*|conferm\w*|procedi|facciamo|invece|cambia\w*|importante|obbligatori\w*|vietat\w*|niente|nessun\w*|solo|devi|dev[eo]|bisogna|meglio|peggio|evita\w*|attenzione|promemoria|nota bene|decide|decided|always|never|rule|remember|prefer\w*|from now on|don't|do not|must|should|instead|important|wrong|right)\b/i;
const ASSISTANT_SIGNAL = /^(?:\*\*)?(deciso|decisione|decisioni|regola|regole|scelta|scelto|scelte|vincol\w*|nota|importante|attenzione|motivo|perch[eé]|non |mai |sempre |da ricordare|promemoria|conclusione|in breve|decided|decision|rule|constraint|note|important|why|never |always )/i;
const SKIP_USER = /^(ok|sì|si|no|vai|procedi|continua|grazie|perfetto|bene|esatto|yes|go|continue|thanks)[.!]?$/i;

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.filter((b) => b && b.type === 'text' && typeof b.text === 'string').map((b) => b.text).join('\n');
}
const hasToolResult = (content) => Array.isArray(content) && content.some((b) => b && b.type === 'tool_result');
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const clean = (s) => s.replace(/<[^>\n]{1,40}>[\s\S]*?<\/[^>\n]{1,40}>/g, ' ').replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

/** One session → the lines worth a model's time, or null when there is nothing. */
function extractSession(path, { cap = 24000 } = {}) {
  const lines = readFileSync(path, 'utf8').split('\n');
  const turns = [];
  let first = null, last = null, firstUser = null, cwd = null, model = null;
  for (const line of lines) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (e.cwd && !cwd) cwd = e.cwd;
    if (e.timestamp) { if (!first) first = e.timestamp; last = e.timestamp; }
    if (e.type === 'user' && e.message) {
      if (hasToolResult(e.message.content)) continue;
      const text = clean(textOf(e.message.content));
      if (!text || text.startsWith('<') || /^\[Request interrupted/.test(text)) continue;
      if (!firstUser) { firstUser = text; turns.push({ who: 'U', text: clip(text, 900), why: 'first' }); continue; }
      if (SKIP_USER.test(text) || text.length < 12) continue;
      if (USER_SIGNAL.test(text)) turns.push({ who: 'U', text: clip(text, 700) });
    } else if (e.type === 'assistant' && e.message) {
      if (e.message.model && !model) model = e.message.model;
      const text = clean(textOf(e.message.content));
      if (!text) continue;
      for (const para of text.split(/\n\s*\n/)) {
        const p = para.trim().replace(/^[-*•]\s+/, '');
        if (p.length < 30 || p.startsWith('```')) continue;
        if (ASSISTANT_SIGNAL.test(p) || /\*\*(deciso|decisione|regola|scelta|vincolo|non fare|mai|sempre)[^*]*\*\*/i.test(p)) turns.push({ who: 'A', text: clip(p, 500) });
      }
    }
  }
  if (!turns.length) return null;
  const head = `# session ${basename(path, '.jsonl')}\nproject: ${cwd || '?'}\nfrom: ${first || '?'}\nto: ${last || '?'}\nmodel: ${model || '?'}\nturns kept: ${turns.length}\n\n`;
  let body = '';
  let dropped = 0;
  for (const t of turns) {
    const piece = `${t.who}: ${t.text}\n\n`;
    if (body.length + piece.length > cap) { dropped += 1; continue; }
    body += piece;
  }
  if (dropped) body += `… ${dropped} more lines not shown (cap ${cap} chars)\n`;
  return { text: head + body, turns: turns.length, cwd, first, last };
}

/** Every session of every project under the Claude projects folder, filtered, to `out`. */
/**
 * A claude.ai data export (`conversations.json`, from Settings → Privacy → Export data) →
 * one extract per conversation, in the same shape as a session extract. Small chats are
 * skipped; the same signals as sessions decide which lines are kept.
 */
function extractClaude(file, out, { minChars = 2000, cap = 24000 } = {}) {
  const convs = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(convs)) throw new Error(`${file}: not a claude.ai export (expected an array of conversations)`);
  mkdirSync(out, { recursive: true });
  const report = [];
  for (const c of convs) {
    const msgs = Array.isArray(c.chat_messages) ? c.chat_messages : [];
    const plain = (m) => clean(typeof m.text === 'string' && m.text ? m.text : textOf(m.content));
    const total = msgs.reduce((n, m) => n + plain(m).length, 0);
    const id = String(c.uuid || sha(JSON.stringify(c)).slice(0, 12));
    if (total < minChars) { report.push(`skip      ${id} (${total} chars)`); continue; }
    const turns = [];
    let firstUser = null;
    for (const m of msgs) {
      const text = plain(m);
      if (!text) continue;
      if (m.sender === 'human') {
        if (SKIP_USER.test(text)) continue;
        if (!firstUser) { firstUser = text; turns.push({ who: 'U', text: clip(text, 900) }); continue; }
        if (USER_SIGNAL.test(text)) turns.push({ who: 'U', text: clip(text, 700) });
      } else if (m.sender === 'assistant') {
        for (const p of text.split(/\n{2,}/)) if (p.length > 40 && ASSISTANT_SIGNAL.test(p)) turns.push({ who: 'A', text: clip(p, 500) });
      }
    }
    if (!turns.length) { report.push(`empty     ${id}`); continue; }
    let body = turns.map((t) => `${t.who}: ${t.text}`).join('\n\n');
    if (body.length > cap) body = body.slice(0, cap) + '\n…';
    const head = `# claude.ai conversation ${id}\nname: ${(c.name || '').replace(/\s+/g, ' ').trim()}\nfrom: ${c.created_at || ''}\nto: ${c.updated_at || ''}\nturns kept: ${turns.length}\n\n`;
    const name = `claude-ai__${id}.md`;
    writeFileSync(join(out, name), head + body);
    report.push(`extracted ${name}  ${Math.round(total / 1024)} KB → ${turns.length} turns`);
  }
  return report.join('\n');
}

function extract(projectsDir, { out, minKb = 50, skip = ['atlas-test', 'scratchpad', 'AppData-Local-Temp'] } = {}) {
  if (!out) throw new Error('--out <dir> is required');
  mkdirSync(out, { recursive: true });
  const report = [];
  for (const d of readdirSync(projectsDir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    if (skip.some((s) => d.name.includes(s))) { report.push(`skip      ${d.name}`); continue; }
    const dir = join(projectsDir, d.name);
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.jsonl')) continue;
      const path = join(dir, f);
      const kb = Math.round(statSync(path).size / 1024);
      if (kb < minKb) continue;
      const r = extractSession(path);
      if (!r) { report.push(`empty     ${d.name}/${f} (${kb} KB)`); continue; }
      const name = `${d.name}__${basename(f, '.jsonl')}.md`;
      writeFileSync(join(out, name), r.text);
      report.push(`extracted ${name}  ${kb} KB → ${r.turns} turns, ${r.text.length} chars`);
    }
  }
  return report.join('\n');
}

/** Project documents (markdown) under `root`, copied to `out` with their origin on top. */
function docs(root, { out, maxKb = 120 } = {}) {
  if (!out) throw new Error('--out <dir> is required');
  mkdirSync(out, { recursive: true });
  const report = [];
  // documents written about the projects, not the plugin's own skill texts nor generated folders
  const files = listFiles(resolve(root), new Set(['.md'])).filter((f) => !/node_modules|_materiale-studio|\/dist\/|\.claude\/|\.agents\/|ritirati|duplicati|LICENSE|CHANGELOG|THIRD-PARTY|EULA|\/skills\/|\/agents\/|\/commands\/|atlas-plugin\/(code|mem)\/|\/caveman\/|\/runtime\/|dist-info/i.test(f));
  for (const f of files) {
    const path = join(resolve(root), f);
    const size = statSync(path).size;
    const kb = Math.round(size / 1024);
    if (size / 1024 > maxKb || size === 0) { report.push(`skip      ${f} (${kb} KB)`); continue; }
    const name = `doc__${f.replace(/[\\/]/g, '__')}`;
    writeFileSync(join(out, name), `# document ${f}\nroot: ${resolve(root)}\n\n${readFileSync(path, 'utf8')}`);
    report.push(`copied    ${f}  ${kb} KB`);
  }
  return report.join('\n');
}

// ---------------------------------------------------------------------------------------
// the inbox

const inboxDir = (vault) => join(vault, '.atlas', 'inbox');
const rejectedPath = (vault) => join(vault, '.atlas', 'rejected.json');
const loadRejected = (vault) => (existsSync(rejectedPath(vault)) ? JSON.parse(readFileSync(rejectedPath(vault), 'utf8')) : { hashes: [] });
const slugOk = (s) => /^[a-z0-9][a-z0-9-]{1,80}$/.test(s);
/** Words that carry meaning in a title or description, for the near-duplicate test. */
const STOP = new Set(['il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'una', 'uno', 'di', 'del', 'della', 'dei', 'delle', 'a', 'al', 'alla', 'da', 'dal', 'in', 'nel', 'nella', 'con', 'su', 'per', 'tra', 'fra', 'e', 'o', 'non', 'che', 'si', 'è', 'e\'', 'come', 'the', 'a', 'an', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'not', 'is', 'are', 'utente', 'user', 'sempre', 'mai', 'solo', 'anche', 'più', 'piu', 'deve', 'vuole']);
const words = (s) => new Set(String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length > 2 && !STOP.has(w)));
function similarity(a, b) {
  const A = words(a), B = words(b);
  if (!A.size || !B.size) return 0;
  let both = 0; for (const w of A) if (B.has(w)) both += 1;
  return both / Math.min(A.size, B.size);
}
const slugify = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

/**
 * Candidates (a JSON array of { name, description, type, body, source, why? }) → inbox files.
 * Skips what the vault already has by slug, what was rejected before (same source hash),
 * and what is already in the inbox.
 */
function inboxWrite(vault, candidatesPath) {
  const list = JSON.parse(readFileSync(candidatesPath, 'utf8'));
  if (!Array.isArray(list)) throw new Error(`${candidatesPath}: expected a JSON array`);
  mkdirSync(inboxDir(vault), { recursive: true });
  const rejected = new Set(loadRejected(vault).hashes);
  // what is already said, in the vault and in the inbox: a candidate that says the same
  // thing in other words is skipped and named, not proposed twice
  const said = [];
  for (const f of readdirSync(vault)) if (f.endsWith('.md') && f !== 'MEMORY.md') { const c = parseCandidate(join(vault, f)); said.push({ slug: c.slug, text: `${c.title || c.name} ${c.description}` }); }
  for (const f of readdirSync(inboxDir(vault))) if (f.endsWith('.md')) { const c = parseCandidate(join(inboxDir(vault), f)); said.push({ slug: c.slug, text: `${c.title || c.name} ${c.description}` }); }
  const out = [];
  for (const c of list) {
    if (!c || typeof c !== 'object' || !c.name || !c.body) { out.push('skip      malformed candidate'); continue; }
    const slug = slugOk(c.slug || '') ? c.slug : slugify(c.name);
    if (!slugOk(slug)) { out.push(`skip      bad slug for ${c.name}`); continue; }
    const key = sha(`${c.source || ''}|${c.name}|${c.body}`);
    if (rejected.has(key)) { out.push(`rejected  ${slug} (seen before)`); continue; }
    if (existsSync(join(vault, `${slug}.md`))) { out.push(`exists    ${slug} (in the vault)`); continue; }
    const file = join(inboxDir(vault), `${slug}.md`);
    if (existsSync(file)) { out.push(`inbox     ${slug} (already there)`); continue; }
    const type = ['user', 'feedback', 'project', 'reference'].includes(c.type) ? c.type : 'project';
    const desc = String(c.description || '').replace(/\s+/g, ' ').trim();
    const twin = said.find((s) => similarity(s.text, `${c.name} ${desc}`) >= 0.6);
    if (twin) { out.push(`similar   ${slug} ≈ ${twin.slug} (not proposed twice)`); continue; }
    said.push({ slug, text: `${c.name} ${desc}` });
    const fm = `---\nname: ${slug}\ntitle: ${JSON.stringify(String(c.name).trim())}\ndescription: ${JSON.stringify(desc)}\nmetadata:\n  type: ${type}\n  harvested: ${new Date().toISOString().slice(0, 10)}\n  source: ${JSON.stringify(String(c.source || ''))}\n  key: ${key}\n---\n\n`;
    const body = String(c.body).trim() + (c.why ? `\n\n**Why:** ${String(c.why).trim()}` : '') + (c.source ? `\n\nFonte: ${String(c.source).trim()}` : '') + '\n';
    writeFileSync(file, fm + body);
    out.push(`candidate ${slug}  [${type}]  ${desc.slice(0, 80)}`);
  }
  return out.join('\n');
}

function parseCandidate(file) {
  const text = readFileSync(file, 'utf8');
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  const fm = m ? m[1] : '';
  const get = (k) => { const r = new RegExp(`^\\s*${k}:\\s*(.*)$`, 'm').exec(fm); return r ? r[1].trim().replace(/^"|"$/g, '') : ''; };
  return { slug: basename(file, '.md'), name: get('name'), title: get('title'), description: get('description'), type: get('type'), source: get('source'), harvested: get('harvested'), key: get('key'), body: m ? m[2].trim() : text };
}

function inboxList(vault, json = false) {
  const dir = inboxDir(vault);
  const items = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => parseCandidate(join(dir, f))) : [];
  if (json) return JSON.stringify(items, null, 2);
  if (!items.length) return 'inbox empty';
  return items.map((c) => `${c.slug.padEnd(40)} [${c.type}]  ${c.description.slice(0, 90)}\n${' '.repeat(40)} ← ${c.source}`).join('\n');
}

/** The candidate becomes a note: file moved into the vault (harvest fields dropped), one line in MEMORY.md. */
function inboxAccept(vault, slug) {
  if (!slugOk(slug)) throw new Error(`bad slug: ${slug}`);
  const file = join(inboxDir(vault), `${slug}.md`);
  if (!existsSync(file)) throw new Error(`no candidate ${slug} in the inbox`);
  if (existsSync(join(vault, `${slug}.md`))) throw new Error(`the vault already has ${slug}.md`);
  const c = parseCandidate(file);
  const note = `---\nname: ${slug}\ndescription: ${JSON.stringify(c.description)}\nmetadata:\n  type: ${c.type || 'project'}\n---\n\n${c.body}\n`;
  writeFileSync(join(vault, `${slug}.md`), note);
  unlinkSync(file);
  const idx = join(vault, 'MEMORY.md');
  const line = `- [${c.title || c.name || slug}](${slug}.md) — ${c.description}`;
  if (existsSync(idx)) {
    let text = readFileSync(idx, 'utf8');
    if (!text.includes(`](${slug}.md)`)) { if (!text.endsWith('\n')) text += '\n'; text += line + '\n'; writeFileSync(idx, text); }
  } else writeFileSync(idx, line + '\n');
  return `accepted  ${slug} → ${join(vault, `${slug}.md`)} · index line added`;
}

function inboxReject(vault, slug) {
  if (!slugOk(slug)) throw new Error(`bad slug: ${slug}`);
  const file = join(inboxDir(vault), `${slug}.md`);
  if (!existsSync(file)) throw new Error(`no candidate ${slug} in the inbox`);
  const c = parseCandidate(file);
  const r = loadRejected(vault);
  if (c.key && !r.hashes.includes(c.key)) r.hashes.push(c.key);
  mkdirSync(join(vault, '.atlas'), { recursive: true });
  writeFileSync(rejectedPath(vault), JSON.stringify(r, null, 2) + '\n');
  unlinkSync(file);
  return `rejected  ${slug} (will not be proposed again)`;
}

// ---------------------------------------------------------------------------------------
// the model, called lean

const DEFAULT_MODEL = 'claude-sonnet-5-5';

/**
 * One headless call to Claude Code with nothing of the session loaded: no MCP servers, no
 * skills, no plugins, our own system prompt. A bare call otherwise carries ~52,000 tokens of
 * tool definitions; lean it carries ~7,000, and the system prompt is shared by every call
 * of a run, so after the first the prefix comes from the cache. Resolves to
 * `{ text, cost }`; rejects on a broken answer.
 */
function callModel(system, user, { model = DEFAULT_MODEL } = {}) {
  const dir = join(tmpdir(), 'atlas-harvest');
  mkdirSync(dir, { recursive: true });
  const settings = join(dir, 'settings.json');
  const mcp = join(dir, 'mcp-none.json');
  if (!existsSync(settings)) writeFileSync(settings, '{"enabledPlugins":{}}');
  if (!existsSync(mcp)) writeFileSync(mcp, '{"mcpServers":{}}');
  // the system prompt goes through a file: as a shell argument its quotes and newlines are mangled
  const sysFile = join(dir, `system-${sha(system)}.md`);
  if (!existsSync(sysFile)) writeFileSync(sysFile, system);
  const args = ['-p', '--model', model, '--output-format', 'json', '--settings', settings, '--tools', '""', '--strict-mcp-config', '--mcp-config', mcp, '--disable-slash-commands', '--system-prompt-file', sysFile];
  return new Promise((res, rej) => {
    const child = spawn('claude', args, { shell: true, windowsHide: true });
    let buf = '', err = '';
    child.stdout.on('data', (d) => { buf += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', rej);
    child.on('close', () => {
      try { const r = JSON.parse(buf); res({ text: String(r.result || ''), cost: r.total_cost_usd || 0 }); } catch (e) { rej(new Error(`model call failed: ${(err || buf).trim().slice(0, 300) || e.message}`)); }
    });
    child.stdin.end(user);
  });
}

const stripFence = (s) => s.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
const existingList = (vault) => readdirSync(vault).filter((f) => f.endsWith('.md') && f !== 'MEMORY.md').map((f) => { const c = parseCandidate(join(vault, f)); return `- ${c.slug}: ${c.description.slice(0, 160)}`; }).join('\n');

async function pool(items, n, fn) { const q = [...items]; await Promise.all(Array.from({ length: Math.max(1, n) }, async () => { while (q.length) await fn(q.shift()); })); }

/**
 * Every extract/document in `inDir` → candidates JSON in `outDir` (skipping those already
 * done), then, with --write, into the inbox. The prompt is the system prompt; the source is
 * the message. Per source the result is a JSON array or the call is marked failed.
 */
async function run(inDir, outDir, vault, { parallel = 4, model = DEFAULT_MODEL, write = false, dry = false, log = () => {} } = {}) {
  const tpl = readFileSync(join(HERE, 'harvest-prompt.md'), 'utf8');
  const system = tpl.replace('{{EXISTING}}', existingList(vault)).replace(/Source id: \{\{SOURCE\}\}\s*Source text:\s*\{\{TEXT\}\}\s*$/, 'The message holds the source id on its first line and the source text after it.');
  mkdirSync(outDir, { recursive: true });
  const files = readdirSync(inDir).filter((f) => f.endsWith('.md') && statSync(join(inDir, f)).size >= 300);
  const todo = files.filter((f) => !existsSync(join(outDir, f.replace(/\.md$/, '.json'))));
  if (dry) return `would call the model for ${todo.length} of ${files.length} sources (${files.length - todo.length} already done) with ${model}`;
  let done = 0, failed = 0, cands = 0, cost = 0;
  await pool(todo, parallel, async (f) => {
    const text = readFileSync(join(inDir, f), 'utf8').slice(0, 60000);
    try {
      const r = await callModel(system, `Source id: ${f.replace(/\.md$/, '')}\n\n${text}`, { model });
      cost += r.cost;
      const txt = stripFence(r.text);
      if (txt.indexOf('[') < 0) throw new Error(`no JSON in the answer: ${txt.slice(0, 160)}`);
      const arr = JSON.parse(txt.slice(txt.indexOf('['), txt.lastIndexOf(']') + 1));
      if (!Array.isArray(arr)) throw new Error('not an array');
      writeFileSync(join(outDir, f.replace(/\.md$/, '.json')), JSON.stringify(arr, null, 2));
      done += 1; cands += arr.length; log(`ok   ${f}  ${arr.length} candidates  $${r.cost.toFixed(2)}`);
    } catch (e) { failed += 1; writeFileSync(join(outDir, f.replace(/\.md$/, '.err.txt')), e.message); log(`FAIL ${f}  ${e.message}`); }
  });
  let filed = '';
  if (write) for (const f of readdirSync(outDir).filter((x) => x.endsWith('.json'))) filed += inboxWrite(vault, join(outDir, f)).split('\n').filter((l) => l.startsWith('candidate')).length;
  return `run       ${done} sources · ${failed} failed · ${cands} candidates · $${cost.toFixed(2)}${write ? ` · filed in the inbox` : ''}`;
}

/** The vault's candidate pairs judged by the model: same thing, contradiction, neither; verdicts recorded. */
async function judge(vault, { min = 0.35, parallel = 2, model = DEFAULT_MODEL, dry = false, redo = false, log = () => {} } = {}) {
  const tpl = readFileSync(join(HERE, 'pairs-prompt.md'), 'utf8');
  const system = tpl.replace(/Note A \(\{\{A\}\}\):[\s\S]*$/, 'The message holds the two notes, each after a line "Note A (slug):" or "Note B (slug):".');
  const list = pairs(vault, { min });
  const known = existsSync(verdictsPath(vault)) ? new Set(JSON.parse(readFileSync(verdictsPath(vault), 'utf8')).map((v) => [v.a, v.b].sort().join('|'))) : new Set();
  const todo = redo ? list : list.filter((p) => !known.has([p.a, p.b].sort().join('|')));
  if (dry) return `would judge ${todo.length} of ${list.length} pairs (${list.length - todo.length} already judged) with ${model}`;
  const out = [];
  let cost = 0;
  await pool(todo, parallel, async (p) => {
    const read = (s) => readFileSync(join(vault, `${s}.md`), 'utf8').slice(0, 6000);
    try {
      const r = await callModel(system, `Note A (${p.a}):\n${read(p.a)}\n\nNote B (${p.b}):\n${read(p.b)}`, { model });
      cost += r.cost;
      const txt = stripFence(r.text);
      if (txt.indexOf('{') < 0) throw new Error(`no JSON in the answer: ${txt.slice(0, 160)}`);
      const v = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
      out.push({ a: p.a, b: p.b, verdict: v.verdict, why: v.why });
      log(`${String(v.verdict).padEnd(14)} ${p.a} ↔ ${p.b}`);
    } catch (e) { log(`FAIL ${p.a} ↔ ${p.b}: ${e.message}`); }
  });
  let recorded = 'verdicts  0 recorded';
  if (out.length) { const tmp = join(tmpdir(), 'atlas-harvest', 'verdicts.json'); writeFileSync(tmp, JSON.stringify(out)); recorded = verdictsWrite(vault, tmp); }
  return `judge     ${todo.length} pairs · $${cost.toFixed(2)}\n${recorded}`;
}

// ---------------------------------------------------------------------------------------
// pairs: what a model (or a person) should read side by side

/** Notes of the vault, by what they share in words: the candidates for "same thing" or "contradiction". */
function pairs(vault, { min = 0.35 } = {}) {
  const notes = readdirSync(vault).filter((f) => f.endsWith('.md') && f !== 'MEMORY.md').map((f) => parseCandidate(join(vault, f)));
  const out = [];
  for (let i = 0; i < notes.length; i += 1) for (let j = i + 1; j < notes.length; j += 1) {
    const a = notes[i], b = notes[j];
    const s = similarity(`${a.title || a.name} ${a.description}`, `${b.title || b.name} ${b.description}`);
    const sb = similarity(a.body.slice(0, 600), b.body.slice(0, 600));
    const score = Math.max(s, sb * 0.8);
    if (score >= min) out.push({ a: a.slug, b: b.slug, score: Number(score.toFixed(2)) });
  }
  return out.sort((x, y) => y.score - x.score);
}

function pairsReport(vault, { min = 0.35, json = false } = {}) {
  const list = pairs(vault, { min });
  if (json) return JSON.stringify(list, null, 2);
  if (!list.length) return 'no pair of notes shares enough words to be worth reading together';
  return list.map((p) => `${String(p.score).padEnd(5)} ${p.a}  ↔  ${p.b}`).join('\n');
}

const verdictsPath = (vault) => join(vault, '.atlas', 'verdicts.json');
/** Verdicts a model or a person gave on pairs: { a, b, verdict: same|contradiction|neither, why, holds? }. */
function verdictsWrite(vault, file) {
  const list = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(list)) throw new Error(`${file}: expected a JSON array`);
  const cur = existsSync(verdictsPath(vault)) ? JSON.parse(readFileSync(verdictsPath(vault), 'utf8')) : [];
  const key = (v) => [v.a, v.b].sort().join('|');
  const byKey = new Map(cur.map((v) => [key(v), v]));
  let n = 0;
  for (const v of list) { if (!v || !v.a || !v.b || !['same', 'contradiction', 'neither'].includes(v.verdict)) continue; byKey.set(key(v), { a: v.a, b: v.b, verdict: v.verdict, why: String(v.why || ''), when: new Date().toISOString().slice(0, 10) }); n += 1; }
  mkdirSync(join(vault, '.atlas'), { recursive: true });
  writeFileSync(verdictsPath(vault), JSON.stringify([...byKey.values()], null, 2) + '\n');
  const kept = [...byKey.values()].filter((v) => v.verdict !== 'neither');
  return `verdicts  ${n} recorded · ${kept.filter((v) => v.verdict === 'same').length} same · ${kept.filter((v) => v.verdict === 'contradiction').length} contradiction`;
}
function verdictsList(vault, json = false) {
  const list = existsSync(verdictsPath(vault)) ? JSON.parse(readFileSync(verdictsPath(vault), 'utf8')) : [];
  const live = list.filter((v) => existsSync(join(vault, `${v.a}.md`)) && existsSync(join(vault, `${v.b}.md`)));
  if (json) return JSON.stringify(live, null, 2);
  const shown = live.filter((v) => v.verdict !== 'neither');
  if (!shown.length) return 'no pair marked as the same thing or as a contradiction';
  return shown.map((v) => `${v.verdict.padEnd(13)} ${v.a}  ↔  ${v.b}\n              ${v.why}`).join('\n');
}

// ---------------------------------------------------------------------------------------
// entry

async function main(argv) {
  const [cmd, ...rest] = argv;
  const opt = (n) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : null; };
  const flag = (n) => rest.includes(n);
  const pos = rest.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--out', '--min-kb', '--max-kb', '--skip', '--min', '--parallel', '--model'].includes(rest[i - 1])));
  const log = (l) => process.stderr.write(l + '\n');
  switch (cmd) {
    case 'run': {
      if (!pos[0] || !pos[1] || !pos[2]) throw Object.assign(new Error('usage: run <extract-dir> <out-dir> <vault> [--parallel 4] [--model <id>] [--write] [--dry]'), { usage: true });
      return run(pos[0], pos[1], pos[2], { parallel: Number(opt('--parallel') || 4), model: opt('--model') || DEFAULT_MODEL, write: flag('--write'), dry: flag('--dry'), log });
    }
    case 'judge': {
      if (!pos[0] || !existsSync(pos[0])) throw Object.assign(new Error('usage: judge <vault> [--min 0.35] [--parallel 2] [--model <id>] [--dry]'), { usage: true });
      return judge(pos[0], { min: Number(opt('--min') || 0.35), parallel: Number(opt('--parallel') || 2), model: opt('--model') || DEFAULT_MODEL, dry: flag('--dry'), redo: flag('--redo'), log });
    }
    case 'extract': {
      if (!pos[0]) throw Object.assign(new Error('usage: extract <claude-projects-dir> --out <dir> [--min-kb 50] [--skip a,b]'), { usage: true });
      const skip = opt('--skip') ? opt('--skip').split(',').map((s) => s.trim()).filter(Boolean) : undefined;
      return extract(pos[0], { out: opt('--out'), minKb: Number(opt('--min-kb') || 50), ...(skip ? { skip } : {}) });
    }
    case 'claude': {
      if (pos.length < 2) throw new Error('usage: harvest.mjs claude <conversations.json> <out-dir> [--min-chars 2000]');
      return extractClaude(pos[0], pos[1], { minChars: Number(opt('--min-chars') || 2000) });
    }
    case 'docs': {
      if (!pos[0]) throw Object.assign(new Error('usage: docs <root> --out <dir> [--max-kb 60]'), { usage: true });
      return docs(pos[0], { out: opt('--out'), maxKb: Number(opt('--max-kb') || 120) });
    }
    case 'inbox': {
      const [sub, vault, arg] = pos;
      if (!vault || !existsSync(vault)) throw Object.assign(new Error('usage: inbox <write|list|accept|reject> <vault> …'), { usage: true });
      if (sub === 'write') return inboxWrite(vault, arg);
      if (sub === 'list') return inboxList(vault, flag('--json'));
      if (sub === 'accept') return inboxAccept(vault, arg);
      if (sub === 'reject') return inboxReject(vault, arg);
      throw Object.assign(new Error('usage: inbox <write|list|accept|reject> <vault> …'), { usage: true });
    }
    case 'pairs': {
      if (!pos[0] || !existsSync(pos[0])) throw Object.assign(new Error('usage: pairs <vault> [--min 0.35] [--json]'), { usage: true });
      return pairsReport(pos[0], { min: Number(opt('--min') || 0.35), json: flag('--json') });
    }
    case 'verdicts': {
      const [sub, vault, arg] = pos;
      if (!vault || !existsSync(vault)) throw Object.assign(new Error('usage: verdicts <write|list> <vault> …'), { usage: true });
      if (sub === 'write') return verdictsWrite(vault, arg);
      if (sub === 'list') return verdictsList(vault, flag('--json'));
      throw Object.assign(new Error('usage: verdicts <write|list> <vault> …'), { usage: true });
    }
    default:
      throw Object.assign(new Error('usage: node harvest.mjs <extract|docs|run|inbox|pairs|judge|verdicts> …'), { usage: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write((await main(process.argv.slice(2))) + '\n');
  } catch (err) {
    process.stderr.write(`harvest: ${err.message}\n`);
    process.exitCode = err.usage ? 2 : 1;
  }
}

export { extractSession, extract, extractClaude, docs, run, judge, callModel, inboxWrite, inboxList, inboxAccept, inboxReject, parseCandidate, similarity, pairs, pairsReport, verdictsWrite, verdictsList, main, DEFAULT_MODEL };
