// prune — what a compaction can lose without a summary: tool calls and tool results that the
// conversation itself made useless. No model decides; each rule is a fact that can be read off
// the transcript:
//
//   repeat      the same call, same input, was made again later: the later result is the truth
//   retry       a call that failed and then succeeded on the same input or the same file
//   superseded  a file read, then read again whole or changed: the first reading is stale
//   served      a search whose hits were then opened: the list did its job
//   long        only when the rules above did not free enough: the longest results of tools
//               that can simply be run again (reads and searches first, then the web, then
//               the shell), until `min` is reached
//
// What is never touched: every word the user and the assistant wrote, the first message, the
// newest `recent` messages, a call still in flight, and the tools whose result cannot be had
// again (a subagent's answer, the user's answer to a question, a loaded skill).
//
// A dropped result keeps its call and, for `served` and `long`, its first `head` characters
// (a shell's head and tail), with one line saying how much was left out and why.
//
// The shape — prune the transcript instead of summarising it, both actions, the pinned ends,
// the fall back below a minimum reduction — after tamaratran/fast-jev-compaction (MIT). There
// a paid model scores every call; here nothing leaves the machine. The code is ours.

export const DEFAULTS = { min: 0.25, recent: 6, head: 300, floor: 600 };

const NEVER = /^(Agent|Task|AskUserQuestion|Skill|TodoWrite|ExitPlanMode|EnterPlanMode|SendMessage)$/;
const READS = /^(Read|NotebookRead)$/;
const WRITES = /^(Edit|Write|MultiEdit|NotebookEdit)$/;
const SEARCH = /^(Grep|Glob|LS)$/;
const WEB = /^(WebFetch|WebSearch)$/;
const SHELL = /^(Bash|PowerShell|BashOutput)$/;

const slash = (p) => String(p).replace(/\\/g, '/');
const fileOf = (c) => {
  const p = c.input && (c.input.file_path || c.input.notebook_path || c.input.path);
  return typeof p === 'string' && p ? slash(p) : null;
};
const key = (c) => { try { return c.tool + '\u0000' + JSON.stringify(c.input); } catch { return null; } };
const whole = (c) => !c.input || (c.input.offset == null && c.input.limit == null && c.input.pages == null);
const tail2 = (p) => p.split('/').filter(Boolean).slice(-2).join('/');

/** Every tool call of the transcript, in order, with where its result sits. */
export function collect(messages, recent = DEFAULTS.recent) {
  const calls = [];
  const byId = new Map();
  const last = messages.length - 1;
  const pinnedAt = (i) => i === 0 || i > last - recent;
  messages.forEach((m, at) => {
    for (const t of m.toolUses || []) {
      const c = { id: t.tool_use_id, tool: t.tool, input: t.input, text: t.text, isError: !!t.isError, at, resultAt: -1, n: calls.length };
      calls.push(c); byId.set(c.id, c);
    }
  });
  messages.forEach((m, at) => {
    for (const r of m.toolResults || []) {
      const c = byId.get(r.tool_use_id);
      if (!c) continue;
      c.resultAt = at;
      if (c.text === undefined) c.text = r.text;
      if (r.isError) c.isError = true;
    }
  });
  for (const c of calls) {
    c.done = c.text !== undefined;
    c.size = c.done ? c.text.length : 0;
    c.pinned = !c.done || pinnedAt(c.at) || (c.resultAt >= 0 && pinnedAt(c.resultAt)) || NEVER.test(c.tool);
  }
  return calls;
}

/** One decision per call: keep, clip (the result shortened) or drop (call and result gone). */
export function decide(calls, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const out = new Map();
  const set = (c, action, reason, head = 0) => { if (!out.has(c.id)) out.set(c.id, { action, reason, head }); };
  const ok = (c) => c.done && !c.isError;

  const laterSame = new Map();            // tool + input -> the newest good call
  const laterRead = new Map();            // file -> newest good whole read
  const laterWrite = new Map();           // file -> newest good change
  const laterGoodOn = new Map();          // tool + file -> newest good call
  const readPaths = [];                   // [n, path] of every good read
  for (const c of calls) {
    if (!ok(c)) continue;
    const k = key(c); if (k) laterSame.set(k, c.n);
    const f = fileOf(c);
    if (f) {
      laterGoodOn.set(c.tool + '\u0000' + f, c.n);
      if (READS.test(c.tool)) { readPaths.push([c.n, f]); if (whole(c)) laterRead.set(f, c.n); }
      if (WRITES.test(c.tool)) laterWrite.set(f, c.n);
    }
  }
  const after = (map, k, c) => k != null && map.has(k) && map.get(k) > c.n;

  for (const c of calls) {
    if (c.pinned) continue;
    const k = key(c), f = fileOf(c);
    if (c.isError) {
      if (after(laterSame, k, c) || (f && after(laterGoodOn, c.tool + '\u0000' + f, c))) set(c, 'drop', 'retry');
      continue;
    }
    if (after(laterSame, k, c)) { set(c, 'clip', 'repeat'); continue; }
    if (READS.test(c.tool) && f) {
      if (after(laterRead, f, c)) { set(c, 'clip', 'superseded'); continue; }
      if (after(laterWrite, f, c)) { set(c, 'clip', 'superseded'); continue; }
    }
    if (SEARCH.test(c.tool) && c.size > o.floor) {
      const text = slash(c.text);
      if (readPaths.some(([n, p]) => n > c.n && (text.includes(p) || text.includes(tail2(p))))) set(c, 'clip', 'served', o.head);
    }
  }
  return out;
}

const WHY = {
  repeat: 'the same call was made again later',
  superseded: 'the file was read again or changed after this',
  served: 'the files it found were opened afterwards',
  long: 'a long result of a tool that can be run again',
};

/** The result as it stays: nothing but the note, or a head (a shell's head and tail) and the note. */
export function clip(text, head, reason, shell = false) {
  const note = (n) => `[atlas prune: ${n} characters of this result left out, ${WHY[reason] || reason}; run the tool again if it is needed]`;
  if (text.length <= head + 160) return text;
  if (head <= 0) return note(text.length);
  if (!shell) return `${text.slice(0, head)}\n${note(text.length - head)}`;
  const h = Math.floor(head / 3), t = head - h;
  return `${text.slice(0, h)}\n${note(text.length - head)}\n${text.slice(-t)}`;
}

/** Characters a message holds: its text, its tool inputs, its tool results (each result once). */
export function chars(messages) {
  let total = 0;
  const seen = new Set();
  for (const m of messages) for (const r of m.toolResults || []) { seen.add(r.tool_use_id); total += (r.text || '').length; }
  for (const m of messages) {
    total += (m.text || '').length;
    for (const t of m.toolUses || []) {
      try { total += JSON.stringify(t.input).length; } catch { total += 20; }
      if (!seen.has(t.tool_use_id) && typeof t.text === 'string') total += t.text.length;
    }
  }
  return total;
}

/** The transcript rebuilt. A message nothing touched comes back as the same object. */
export function apply(messages, calls, decisions, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const byId = new Map(calls.map((c) => [c.id, c]));
  const shorter = (id, text) => {
    const d = decisions.get(id), c = byId.get(id);
    return d && d.action === 'clip' && typeof text === 'string' ? clip(text, d.head, d.reason, !!c && SHELL.test(c.tool)) : text;
  };
  const dropped = (id) => decisions.get(id)?.action === 'drop';
  const kept = [];
  for (const m of messages) {
    const uses = m.toolUses || [], results = m.toolResults || [];
    if (![...uses, ...results].some((x) => decisions.has(x.tool_use_id))) { kept.push(m); continue; }
    const toolUses = uses.filter((t) => !dropped(t.tool_use_id)).map((t) => {
      const text = shorter(t.tool_use_id, t.text);
      if (text === t.text) return t;
      const copy = { tool_use_id: t.tool_use_id, tool: t.tool, input: t.input, text };
      if (t.isError) copy.isError = true;
      return copy;
    });
    const toolResults = results.filter((r) => !dropped(r.tool_use_id)).map((r) => {
      const text = shorter(r.tool_use_id, r.text);
      return text === r.text ? r : { tool_use_id: r.tool_use_id, text, isError: !!r.isError };
    });
    const same = toolUses.length === uses.length && toolResults.length === results.length &&
      toolUses.every((t, i) => t === uses[i]) && toolResults.every((r, i) => r === results[i]);
    if (same) { kept.push(m); continue; }
    if (!(m.text || '').trim() && !toolUses.length && !toolResults.length) continue;
    const rebuilt = { role: m.role, text: m.text, toolUses };
    if (toolResults.length) rebuilt.toolResults = toolResults;
    kept.push(rebuilt);
  }
  return kept;
}

/**
 * Prunes a transcript. Returns the new messages with what was done; `ratio` is the share of
 * characters freed, and the caller falls back to a summary when it is under `min`.
 */
export function prune(messages, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const calls = collect(messages, o.recent);
  const decisions = decide(calls, o);
  const before = chars(messages);
  let out = apply(messages, calls, decisions, o);
  let after = chars(out);
  const ratioNow = () => (before === 0 ? 0 : (before - after) / before);

  if (ratioNow() < o.min) {
    // Not enough: the longest results of tools that can be run again, cheapest to redo first.
    const rank = (c) => (READS.test(c.tool) || SEARCH.test(c.tool) ? 0 : WEB.test(c.tool) ? 1 : SHELL.test(c.tool) ? 2 : -1);
    const pool = calls
      .filter((c) => !c.pinned && c.done && !c.isError && !decisions.has(c.id) && rank(c) >= 0 && c.size > o.floor)
      .sort((a, b) => rank(a) - rank(b) || b.size - a.size);
    const need = before * o.min;
    let freed = before - after;
    for (const c of pool) {
      if (freed >= need) break;
      decisions.set(c.id, { action: 'clip', reason: 'long', head: o.head });
      freed += c.size - clip(c.text, o.head, 'long', SHELL.test(c.tool)).length;
    }
    out = apply(messages, calls, decisions, o);
    after = chars(out);
  }

  const by = {};
  for (const d of decisions.values()) by[d.reason] = (by[d.reason] || 0) + 1;
  return {
    messages: out,
    ratio: ratioNow(),
    stats: {
      messagesBefore: messages.length, messagesAfter: out.length, charsBefore: before, charsAfter: after,
      calls: calls.length, pinned: calls.filter((c) => c.pinned).length, by,
    },
  };
}

/** One line for the log: what the pruning came to. */
export function line(r) {
  const s = r.stats;
  const parts = Object.entries(s.by).map(([k, n]) => `${n} ${k}`).join(', ') || 'nothing to prune';
  return `${Math.round(r.ratio * 100)}% freed (${s.charsBefore} to ${s.charsAfter} characters), ${s.messagesAfter} of ${s.messagesBefore} messages kept; ${parts}`;
}
