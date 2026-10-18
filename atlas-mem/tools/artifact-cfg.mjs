/**
 * ATLAS — control-flow recovery over a disassembled function: the step between a flat
 * instruction listing and pseudocode. From a start address it follows the flow (fall-through
 * and resolved branch targets) by recursive descent, splits the instructions into basic
 * blocks at every branch and branch target, records the edges, and marks back-edges as
 * loops. This is the skeleton every decompiler builds before expressions and structuring;
 * it is our own, over our own decoders. Nothing is executed.
 */

const hx = (n) => '0x' + (n >>> 0).toString(16);

/** Parse a self-relative numeric branch target from an instruction's operand text. */
function x86Target(insn) {
  const ops = insn.text.replace(/^\S+\s+/, '');
  const m = /^(-?)0x([0-9a-f]+)$/.exec(ops.trim());
  if (!m) return null; // indirect (register / memory) target
  const v = parseInt(m[2], 16) * (m[1] ? -1 : 1);
  return insn.addr + v; // the x86 decoder renders the target as bytes from the instruction start
}
function x86Cf(insn) {
  const m = insn.mnem;
  if (m === 'ret' || m === 'retf' || m === 'iretq') return { kind: 'ret' };
  if (m === 'jmp') return { kind: 'jmp', target: x86Target(insn) };
  if (/^j/.test(m)) return { kind: 'jcc', target: x86Target(insn) };
  if (m === 'int3' || (m && m.startsWith('ud'))) return { kind: 'ret' }; // a trap ends the path
  return { kind: 'none' };
}

function armTarget(insn) {
  const m = /\.([+-])0x([0-9a-f]+)/.exec(insn.text);
  if (!m) return null;
  return insn.addr + (parseInt(m[2], 16) * (m[1] === '-' ? -1 : 1));
}
function armCf(insn) {
  const m = insn.mnem;
  if (m === 'ret' || m === 'eret' || m === 'br') return { kind: 'ret' };
  if (m === 'b') return { kind: 'jmp', target: armTarget(insn) };
  if (m === 'bl' || m === 'blr') return { kind: 'none' }; // a call returns
  if (/^(b\.|cbz|cbnz|tbz|tbnz)/.test(m)) return { kind: 'jcc', target: armTarget(insn) };
  return { kind: 'none' };
}

/**
 * Build the CFG of one function. `decodeAt(pos)` returns { addr, len, text, mnem, bad }.
 * `arch` picks the control-flow reader. Stops at `end` or after `budget` bytes.
 */
function buildCfg(decodeAt, start, end, arch, budget) {
  const cf = arch === 'arm64' ? armCf : x86Cf;
  budget = budget || 8192;
  const insns = new Map(); // addr -> insn (+ its cf)
  const leaders = new Set([start]);
  const queue = [start]; let steps = 0;
  while (queue.length && steps < 20000) {
    let pos = queue.shift();
    while (pos >= start && pos < end && !insns.has(pos) && pos - start < budget) {
      steps += 1;
      const d = decodeAt(pos);
      if (!d || d.bad) { insns.set(pos, { addr: pos, len: d ? Math.max(1, d.len) : 1, text: d ? d.text : '(bad)', mnem: null, cf: { kind: 'ret' } }); break; }
      const c = cf(d); d.cf = c; insns.set(pos, d);
      const next = pos + Math.max(1, d.len);
      if (c.kind === 'ret') break;
      if (c.kind === 'jmp') { if (c.target != null && c.target >= start && c.target < end) { leaders.add(c.target); queue.push(c.target); } break; }
      if (c.kind === 'jcc') { if (c.target != null && c.target >= start && c.target < end) { leaders.add(c.target); queue.push(c.target); } leaders.add(next); queue.push(next); break; }
      pos = next; // fall-through (none / call)
    }
  }
  // sort instructions, split into blocks at leaders
  const addrs = [...insns.keys()].sort((a, b) => a - b);
  // any instruction immediately after a block terminator is also a leader
  for (const a of addrs) { const i = insns.get(a); const c = i.cf; if (c.kind === 'ret' || c.kind === 'jmp' || c.kind === 'jcc') { const n = a + i.len; if (insns.has(n)) leaders.add(n); } }
  const blocks = []; let cur = null;
  for (const a of addrs) {
    if (leaders.has(a) || !cur) { cur = { start: a, insns: [], succ: [] }; blocks.push(cur); }
    cur.insns.push(insns.get(a));
  }
  const blockAt = new Map(blocks.map((b) => [b.start, b]));
  for (const b of blocks) {
    const last = b.insns[b.insns.length - 1]; const c = last.cf;
    const fall = last.addr + last.len;
    if (c.kind === 'ret') { /* no successors */ }
    else if (c.kind === 'jmp') { if (c.target != null && blockAt.has(c.target)) b.succ.push({ to: c.target }); }
    else if (c.kind === 'jcc') { if (c.target != null && blockAt.has(c.target)) b.succ.push({ to: c.target, cond: true }); if (blockAt.has(fall)) b.succ.push({ to: fall, fall: true }); }
    else if (blockAt.has(fall)) b.succ.push({ to: fall, fall: true });
  }
  // back-edges: a successor at or before the block's own start is a loop edge
  let loops = 0;
  for (const b of blocks) for (const s of b.succ) if (s.to <= b.start) { s.loop = true; loops += 1; }
  const reachable = blocks.reduce((n, b) => n + b.insns.length, 0);
  return { start, blocks, loops, instructions: reachable, bad: [...insns.values()].filter((i) => !i.mnem).length };
}

/** A readable, structured text of the CFG. */
function formatCfg(cfg, base) {
  base = base || 0;
  const L = (a) => 'L_' + (base + a).toString(16);
  const out = [`; function at ${hx(base + cfg.start)} — ${cfg.blocks.length} blocks, ${cfg.instructions} instructions, ${cfg.loops} loop edge(s)`];
  for (const b of cfg.blocks) {
    out.push(`\n${L(b.start)}:`);
    for (const i of b.insns) out.push(`  ${(base + i.addr).toString(16).padStart(8, '0')}  ${i.text}`);
    const edges = b.succ.map((s) => `${s.cond ? 'if-taken ' : s.fall ? 'fall ' : 'goto '}${L(s.to)}${s.loop ? ' (loop)' : ''}`);
    if (edges.length) out.push(`  -> ${edges.join('  |  ')}`);
    else out.push('  -> return');
  }
  return out.join('\n');
}

export { buildCfg, formatCfg };
