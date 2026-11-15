#!/usr/bin/env node
// atlas-friction — what weighs on this session, counted from its own transcript: tool calls
// and how many failed, what was done more than once, the largest results, the text injected
// along the way, the compactions, and what a pruning compaction would free right now.
//
// `atlas friction` prints it. Counts, sizes and tool names; of the content only the base name
// of a file read more than once. Nothing is stored and nothing is sent: the transcript is the
// file Claude Code already keeps for the session, read once and dropped.
//
// `atlas-context` (atlas-code) measures what a session loads before its first word. This
// measures what happened after it.
//
// The idea — a local report over the transcript that prints counts and never content — after
// Yeachan-Heo/oh-my-claudecode (MIT, `omc session friction report`) and obra/superpowers
// (MIT, `diagnosing-superpowers`). The measures and the code are ours.

'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const MAX_BYTES = 150 * 1024 * 1024;
const num = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

// The text of a tool result as the model read it. An image is counted as an image, never as
// the characters of its encoding: that mistake once made reads look like 95% of a session.
function resultText(content) {
  if (typeof content === 'string') return { text: content, images: 0 };
  let text = '', images = 0;
  for (const b of Array.isArray(content) ? content : []) {
    if (b && b.type === 'text' && typeof b.text === 'string') text += b.text;
    else if (b && b.type === 'image') images++;
  }
  return { text, images };
}

/** The rows of the main conversation, parsed; a line that is not JSON is skipped. */
function rows(file) {
  const out = [];
  for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!l) continue;
    try { const r = JSON.parse(l); if (r && r.isSidechain !== true) out.push(r); } catch (e) { /* a torn last line */ }
  }
  return out;
}

/** Everything the report counts, from the rows. */
function measure(list) {
  const calls = new Map();          // id -> { tool, input, n (order), turn, text, isError, done }
  const messages = [];              // the conversation after the last compaction, in the shape prune reads
  const injected = new Map();       // attachment type -> { n, chars }
  let compactions = 0, images = 0, context = 0, order = 0, freedByCompaction = 0;
  // A compaction that keeps the messages writes them again after its boundary, under one
  // prompt id: counting ids, and not rows, counts each prompt once.
  const promptIds = new Set();
  let anonymous = 0;
  const prompt = (r, text) => {
    if (r.isMeta || /^<(local-command|command-name|command-message)/.test(text)) return;
    if (r.promptId) promptIds.add(r.promptId); else anonymous++;
  };
  const turn = () => promptIds.size + anonymous;

  for (const r of list) {
    if (r.type === 'system' && r.subtype === 'compact_boundary') {
      compactions++;
      const m = r.compactMetadata || {};
      if (m.preTokens && m.postTokens) freedByCompaction += m.preTokens - m.postTokens;
      messages.length = 0;
      continue;
    }
    if (r.type === 'attachment' && r.attachment) {
      const chars = (r.rendered || []).reduce((a, x) => a + String(x && x.content || '').length, 0);
      if (chars) { const e = injected.get(r.attachment.type) || { n: 0, chars: 0 }; injected.set(r.attachment.type, { n: e.n + 1, chars: e.chars + chars }); }
      continue;
    }
    const msg = r.message;
    if (!msg || (r.type !== 'user' && r.type !== 'assistant')) continue;
    if (r.type === 'assistant') {
      const u = msg.usage;
      if (u) context = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
      const row = { role: 'assistant', text: '', toolUses: [] };
      for (const b of Array.isArray(msg.content) ? msg.content : []) {
        if (b.type === 'text') row.text += b.text || '';
        if (b.type === 'tool_use') {
          // a call written again after a compaction is the same call, at its first place
          const c = calls.get(b.id) || { tool_use_id: b.id, tool: b.name, input: b.input || {}, n: order++, turn: turn() };
          calls.set(b.id, c);
          row.toolUses.push(c);
        }
      }
      messages.push(row);
      continue;
    }
    if (typeof msg.content === 'string') { prompt(r, msg.content); messages.push({ role: 'user', text: msg.content, toolUses: [] }); continue; }
    const row = { role: 'user', text: '', toolUses: [], toolResults: [] };
    let typed = false;
    for (const b of Array.isArray(msg.content) ? msg.content : []) {
      if (b.type === 'text') { row.text += b.text || ''; typed = true; }
      if (b.type === 'tool_result') {
        const { text, images: n } = resultText(b.content);
        images += n;
        const c = calls.get(b.tool_use_id);
        if (c) { c.text = text; c.done = true; if (b.is_error) c.isError = true; }
        row.toolResults.push({ tool_use_id: b.tool_use_id, text, isError: !!b.is_error });
      }
    }
    if (typed && !row.toolResults.length) prompt(r, row.text);
    messages.push(row);
  }
  return { calls: [...calls.values()], messages, injected, prompts: turn(), compactions, images, context, freedByCompaction };
}

const fileOf = (c) => {
  const p = c.input && (c.input.file_path || c.input.notebook_path || c.input.path);
  return typeof p === 'string' && p ? p.replace(/\\/g, '/') : null;
};

/** The lines `atlas friction` prints. `prune` is hooks/prune.mjs when the build has it. */
function render(m, prune) {
  const out = [];
  const done = m.calls.filter((c) => c.done);
  const failed = done.filter((c) => c.isError);
  const pct = done.length ? Math.round((failed.length / done.length) * 100) : 0;
  out.push(`session: ${m.prompts} prompt${m.prompts === 1 ? '' : 's'}, ${m.calls.length} tool call${m.calls.length === 1 ? '' : 's'}, ${failed.length} failed (${pct}%), ${m.compactions} compaction${m.compactions === 1 ? '' : 's'}` +
    (m.context ? `, ${num(m.context)} tokens in the last request` : ''));

  if (m.calls.length) {
    const by = new Map();
    for (const c of done) {
      const e = by.get(c.tool) || { n: 0, bad: 0, chars: 0, top: 0 };
      const size = (c.text || '').length;
      by.set(c.tool, { n: e.n + 1, bad: e.bad + (c.isError ? 1 : 0), chars: e.chars + size, top: Math.max(e.top, size) });
    }
    const sorted = [...by.entries()].sort((a, b) => b[1].chars - a[1].chars).slice(0, 12);
    const w = Math.max(4, ...sorted.map(([t]) => t.length));
    out.push(`${'tool'.padEnd(w)}  calls  failed  result chars   largest`);
    for (const [t, e] of sorted) out.push(`${t.padEnd(w)}  ${String(e.n).padStart(5)}  ${String(e.bad).padStart(6)}  ${num(e.chars).padStart(12)}  ${num(e.top).padStart(8)}`);
    if (by.size > sorted.length) out.push(`(${by.size - sorted.length} more tools, smaller)`);
  }

  // Done more than once: the same call with the same input, and files read again.
  const seen = new Map();
  let repeats = 0;
  for (const c of done) { let k; try { k = c.tool + '\u0000' + JSON.stringify(c.input); } catch (e) { continue; } if (seen.has(k)) repeats++; else seen.set(k, 1); }
  const reads = new Map();
  for (const c of done) { if (c.tool !== 'Read' || c.isError) continue; const f = fileOf(c); if (!f) continue; const e = reads.get(f) || { n: 0, chars: 0 }; reads.set(f, { n: e.n + 1, chars: e.chars + (c.text || '').length }); }
  const again = [...reads.entries()].filter(([, e]) => e.n > 1).sort((a, b) => b[1].chars - a[1].chars);
  if (repeats || again.length) {
    out.push('more than once');
    if (repeats) out.push(`  ${repeats} call${repeats === 1 ? '' : 's'} repeated with the same input`);
    for (const [f, e] of again.slice(0, 5)) out.push(`  ${path.posix.basename(f)} read ${e.n} times, ${num(e.chars)} characters in all`);
    if (again.length > 5) out.push(`  and ${again.length - 5} more files read again`);
  }

  const big = [...done].sort((a, b) => (b.text || '').length - (a.text || '').length).slice(0, 5).filter((c) => (c.text || '').length > 2000);
  if (big.length) out.push('largest results', '  ' + big.map((c) => `${c.tool} ${num(c.text.length)} (prompt ${c.turn})`).join(' · '));
  if (m.images) out.push(`${m.images} image${m.images === 1 ? '' : 's'} in tool results (counted as images, not as characters)`);

  const inj = [...m.injected.entries()].sort((a, b) => b[1].chars - a[1].chars);
  if (inj.length) {
    const total = inj.reduce((a, [, e]) => a + e.chars, 0);
    out.push(`injected along the way: ${num(total)} characters in ${inj.reduce((a, [, e]) => a + e.n, 0)} blocks`,
      '  ' + inj.slice(0, 6).map(([t, e]) => `${t} ${num(e.chars)}${e.n > 1 ? ` in ${e.n}` : ''}`).join(' · '));
  }
  if (m.freedByCompaction) out.push(`the compactions so far freed ${num(m.freedByCompaction)} tokens`);

  if (prune && m.messages.length) {
    try {
      const r = prune.prune(m.messages, {});
      out.push(r.ratio >= prune.DEFAULTS.min
        ? `a pruning compaction now would free ${Math.round(r.ratio * 100)}% (${num(r.stats.charsBefore)} to ${num(r.stats.charsAfter)} characters) and keep every word: \`atlas prune on\``
        : `a pruning compaction now would free ${Math.round(r.ratio * 100)}%, under its ${Math.round(prune.DEFAULTS.min * 100)}% minimum: a summary would run`);
    } catch (e) { /* the estimate is a courtesy */ }
  }
  return out.join('\n');
}

/** The report for one transcript file; a line saying why when there is none to read. */
async function report(file) {
  if (!file) return 'friction: this session has no transcript to read';
  let size;
  try { size = fs.statSync(file).size; } catch (e) { return `friction: the transcript is not there (${file})`; }
  if (size > MAX_BYTES) return `friction: the transcript is ${num(size / 1048576)} MB, more than this reads in one go`;
  let prune = null;
  try { prune = await import(pathToFileURL(path.join(__dirname, 'prune.mjs')).href); } catch (e) { prune = null; }
  return render(measure(rows(file)), prune);
}

module.exports = { resultText, rows, measure, render, report };
