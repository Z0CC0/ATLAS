/**
 * ATLAS — register liveness over a function's CFG, the cross-block middle-end pass. Our own,
 * over our own CFG and decoder. The intra-block lift holds each register's expression and, at
 * the end of a block, writes every non-trivial one out as a statement so a successor can read
 * it. Most of those writes are dead: the register is never read again. This pass computes,
 * by the textbook backward data-flow fixpoint (live-in = use ∪ (live-out − def)), which
 * registers are actually live out of each block, so the lift can keep only the live writes
 * and drop the noise. It is conservative: an instruction it does not model marks its
 * registers used and nothing defined, so a write is dropped only when the register is
 * provably dead — never one a later block still needs. Nothing is executed.
 */

// sub-register -> canonical 64-bit name
const CANON = {};
const ALIAS = {}; // canonical -> [all sub-names]
for (const [q, d, w, b] of [
  ['rax', 'eax', 'ax', 'al'], ['rcx', 'ecx', 'cx', 'cl'], ['rdx', 'edx', 'dx', 'dl'], ['rbx', 'ebx', 'bx', 'bl'],
  ['rsi', 'esi', 'si', 'sil'], ['rdi', 'edi', 'di', 'dil'], ['rbp', 'ebp', 'bp', 'bpl'], ['rsp', 'esp', 'sp', 'spl'],
]) { for (const r of [q, d, w, b]) CANON[r] = q; ALIAS[q] = [q, d, w, b]; }
for (let i = 8; i <= 15; i += 1) { const q = 'r' + i; const subs = [q, q + 'd', q + 'w', q + 'b']; for (const r of subs) CANON[r] = q; ALIAS[q] = subs; }
const canon = (r) => CANON[r] || r;
const isReg = (t) => Object.prototype.hasOwnProperty.call(CANON, t);
const isWide = (t) => /^(r[a-z]{2}|r\d+|e[a-z]{2}|r\d+d)$/.test(t); // 32/64-bit: a full write, not partial

/** Pull the register names out of an operand (a plain reg, or the bases inside `[...]`). */
function regsOf(operand) {
  if (operand == null) return [];
  const out = [];
  const inner = operand.startsWith('[') ? operand.slice(1, -1) : operand;
  for (const m of inner.matchAll(/\b([re]?[abcd]x|[re]?[sd]i|[re]?[sb]p|r\d+[dwb]?|[abcd]l|sil|dil|bpl|spl)\b/g)) out.push(m[1]);
  return out;
}

const BINOPS = new Set(['add', 'sub', 'and', 'or', 'xor', 'shl', 'shr', 'sar', 'imul', 'mul', 'adc', 'sbb', 'inc', 'dec', 'neg', 'not', 'rol', 'ror', 'xadd']);
const VOLATILE = ['rax', 'rcx', 'rdx', 'r8', 'r9', 'r10', 'r11'];

function parse(text) {
  const sp = text.indexOf(' ');
  const mnem = sp < 0 ? text : text.slice(0, sp);
  const ops = sp < 0 ? [] : text.slice(sp + 1).split(', ');
  return { mnem, ops };
}

/** Definitions and uses of one instruction, as sets of canonical register names. */
function defsUses(ins) {
  const { mnem, ops } = parse(ins.text || '');
  const def = new Set(), use = new Set();
  const useReg = (t) => { for (const r of regsOf(t)) use.add(canon(r)); };
  const dst = ops[0], src = ops[1];
  const isMem = (t) => t && t.startsWith('[');
  if (mnem === 'mov' || mnem === 'movzx' || mnem === 'movsx' || mnem === 'movsxd' || mnem === 'lea') {
    if (src !== undefined) useReg(src);
    if (mnem === 'lea') { if (dst && isReg(dst)) def.add(canon(dst)); }
    else if (isMem(dst)) useReg(dst);
    else if (dst && isReg(dst)) { if (isWide(dst)) def.add(canon(dst)); else { use.add(canon(dst)); def.add(canon(dst)); } }
  } else if ((mnem === 'xor' || mnem === 'sub') && dst && dst === src && isReg(dst)) {
    def.add(canon(dst)); // the zeroing idiom defines, it does not read
  } else if (BINOPS.has(mnem)) {
    if (src !== undefined) useReg(src);
    if (isMem(dst)) useReg(dst);
    else if (dst && isReg(dst)) { use.add(canon(dst)); def.add(canon(dst)); }
  } else if (mnem === 'cmp' || mnem === 'test') { useReg(dst); useReg(src); }
  else if (mnem === 'push') { useReg(dst); }
  else if (mnem === 'pop') { if (dst && isReg(dst)) def.add(canon(dst)); }
  else if (mnem === 'call') { for (const r of ['rcx', 'rdx', 'r8', 'r9']) use.add(r); for (const r of VOLATILE) def.add(r); }
  else if (mnem === 'ret' || mnem === 'retf') { use.add(rax()); }
  else if (mnem === 'xchg') { useReg(dst); useReg(src); if (dst && isReg(dst)) def.add(canon(dst)); if (src && isReg(src)) def.add(canon(src)); }
  else if (/^j/.test(mnem) || mnem === 'nop' || mnem === 'endbr64' || mnem === 'leave' || mnem === 'int3' || mnem === 'cdqe' || mnem === 'cqo') { /* no reg def; jcc reads flags only */ }
  else { for (const o of ops) useReg(o); } // unmodelled: conservative, read everything, define nothing
  return { def, use };
}
function rax() { return 'rax'; }

// ---------------------------------------------------------------- ARM64 register model

const canonArm = (r) => (/^w(\d+)$/.test(r) ? 'x' + r.slice(1) : (r === 'wsp' ? 'sp' : r));
const isGprArm = (r) => /^(x\d+|w\d+|sp|wsp)$/.test(r); // xzr/wzr excluded on purpose
function splitBr(s) { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '[') d += 1; else if (ch === ']') d -= 1; if (ch === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; }
function parseArm(text) { const sp = text.indexOf(' '); return { mnem: sp < 0 ? text : text.slice(0, sp), ops: sp < 0 ? [] : splitBr(text.slice(sp + 1)) }; }
function regsOfArm(op) { const out = []; const inner = op && op.startsWith('[') ? op.slice(1, -1).replace(/\]!?$/, '') : op; if (!inner) return out; for (const m of inner.matchAll(/\b(x\d+|w\d+|sp|wsp)\b/g)) out.push(canonArm(m[1])); return out; }
const ARM_DATA = new Set(['add', 'sub', 'and', 'orr', 'eor', 'lsl', 'lsr', 'asr', 'mul', 'udiv', 'sdiv', 'neg', 'mvn', 'lslv', 'lsrv', 'asrv', 'csel', 'csinc', 'csinv', 'csneg', 'cset', 'csetm', 'madd', 'msub', 'bic', 'orn', 'rev', 'rev16', 'clz', 'rbit', 'extr', 'sbfm', 'ubfm', 'bfm', 'sxtw', 'uxtw']);

/** Definitions and uses of one ARM64 instruction, as sets of canonical registers. */
function defsUsesArm(ins) {
  const { mnem, ops } = parseArm(ins.text || '');
  const def = new Set(), use = new Set();
  const useOp = (t) => { for (const r of regsOfArm(t)) use.add(r); };
  const defReg = (t) => { if (/^(x\d+|w\d+)$/.test(t || '')) def.add(canonArm(t)); };
  const b = mnem.replace(/s$/, '');
  if (mnem === 'mov' || mnem === 'movz' || mnem === 'movn' || mnem === 'adrp' || mnem === 'adr') { defReg(ops[0]); if (ops[1]) useOp(ops[1]); }
  else if (mnem === 'movk') { defReg(ops[0]); useOp(ops[0]); }
  else if (mnem === 'cmp' || mnem === 'cmn' || mnem === 'tst') { useOp(ops[0]); useOp(ops[1]); }
  else if ((mnem === 'subs' || mnem === 'adds' || mnem === 'ands') && (ops[0] === 'xzr' || ops[0] === 'wzr')) { useOp(ops[1]); useOp(ops[2]); }
  else if (/^ldr/.test(mnem)) { defReg(ops[0]); useOp(ops[1]); }
  else if (/^str/.test(mnem)) { useOp(ops[0]); useOp(ops[1]); }
  else if (mnem === 'ldp') { defReg(ops[0]); defReg(ops[1]); useOp(ops[2]); }
  else if (mnem === 'stp') { useOp(ops[0]); useOp(ops[1]); useOp(ops[2]); }
  else if (mnem === 'bl' || mnem === 'blr') { if (mnem === 'blr') useOp(ops[0]); for (let i = 0; i <= 7; i += 1) use.add('x' + i); for (let i = 0; i <= 18; i += 1) def.add('x' + i); def.add('x30'); }
  else if (mnem === 'ret') { use.add('x0'); use.add('x30'); }
  else if (mnem === 'cbz' || mnem === 'cbnz' || mnem === 'tbz' || mnem === 'tbnz') { useOp(ops[0]); }
  else if (/^b(\.|r$|$)/.test(mnem) || mnem === 'nop' || mnem === 'eret') { /* no register effect tracked */ }
  else if (ARM_DATA.has(b) || ARM_DATA.has(mnem)) { defReg(ops[0]); for (let i = 1; i < ops.length; i += 1) useOp(ops[i]); }
  else { for (const o of ops) useOp(o); } // conservative: read everything, define nothing
  return { def, use };
}

const ARM_FRAME = new Set(['sp']);
const archModel = (arch) => (arch === 'arm64'
  ? { du: defsUsesArm, canon: canonArm, frame: ARM_FRAME, aliasOf: (c) => (/^x\d+$/.test(c) ? [c, c.replace('x', 'w')] : [c]) }
  : { du: defsUses, canon, frame: new Set(['rsp', 'rbp']), aliasOf: (c) => (ALIAS[c] || [c]) });

/** Block-level use/def: a register used before it is defined in the block is a block use. */
function blockUseDef(insns, du0) {
  const du0fn = du0 || defsUses;
  const use = new Set(), def = new Set();
  for (const ins of insns) {
    const du = du0fn(ins);
    for (const u of du.use) if (!def.has(u)) use.add(u);
    for (const d of du.def) def.add(d);
  }
  return { use, def };
}

/** Backward liveness fixpoint. Returns Map(block.start -> Set of canonical regs live out). */
function liveness(cfg, arch) {
  const model = archModel(arch);
  const blocks = cfg.blocks;
  const byId = new Map(blocks.map((b) => [b.start, b]));
  const ud = new Map(blocks.map((b) => [b.start, blockUseDef(b.insns, model.du)]));
  const liveIn = new Map(blocks.map((b) => [b.start, new Set()]));
  const liveOut = new Map(blocks.map((b) => [b.start, new Set()]));
  let changed = true; let guard = 0;
  while (changed && guard < 10000) {
    changed = false; guard += 1;
    for (let i = blocks.length - 1; i >= 0; i -= 1) {
      const b = blocks[i];
      const out = new Set();
      for (const s of b.succ) { const li = liveIn.get(s.to); if (li) for (const r of li) out.add(r); }
      const { use, def } = ud.get(b.start);
      const inp = new Set(use);
      for (const r of out) if (!def.has(r)) inp.add(r);
      if (out.size !== liveOut.get(b.start).size || inp.size !== liveIn.get(b.start).size) changed = true;
      liveOut.set(b.start, out); liveIn.set(b.start, inp);
    }
  }
  return liveOut;
}

/** Expand a set of canonical regs to include every sub-register name, for a raw-name lookup. */
function withAliases(canonSet, arch) {
  const aliasOf = archModel(arch).aliasOf;
  const out = new Set();
  for (const c of canonSet) { out.add(c); for (const a of aliasOf(c)) out.add(a); }
  return out;
}

// ---------------------------------------------------------------- value forwarding (SSA-lite)

const CAP = 72; // do not forward an expression longer than this (keeps readability, bounds blow-up)

const FRAMEREG = new Set(['rsp', 'rbp', 'esp', 'ebp', 'sp', 'bp', 'spl', 'bpl']);

/**
 * Forward each register's expression across the CFG, conservatively: a block inherits its
 * predecessor's exit environment only when it has exactly one predecessor, so there is never
 * a value merge (a phi) to resolve and never a wrong join. A value computed before a branch
 * then reads through into the arm that uses it, instead of being re-materialised. A block's
 * spill of a register is suppressed only when the block has exactly one successor and that
 * successor inherits (and so will inline) the same value — so a spill is removed, never moved
 * or duplicated. The frame registers (rsp/rbp) are never forwarded; they stay the symbolic
 * frame base so the stack-frame pass keeps working. `lift(insns, inEnv)` returns { outEnv };
 * it is the same lifter used for emission, so the forwarded values match the printed ones.
 *
 * Returns { inEnv: Map(start -> envMap), noSpill: Map(start -> Set rawReg) }.
 */
function valueFlow(cfg, lift) {
  const blocks = cfg.blocks;
  const order = []; { // reverse-postorder over successors from the entry
    const seen = new Set(); const post = [];
    const succOf = new Map(blocks.map((b) => [b.start, b.succ.map((s) => s.to)]));
    const ids = new Set(blocks.map((b) => b.start));
    const dfs = (n) => { if (seen.has(n) || !ids.has(n)) return; seen.add(n); for (const s of (succOf.get(n) || [])) dfs(s); post.push(n); };
    dfs(cfg.start); for (const b of blocks) dfs(b.start); order.push(...post.reverse());
  }
  const byId = new Map(blocks.map((b) => [b.start, b]));
  const preds = new Map(blocks.map((b) => [b.start, []]));
  for (const b of blocks) for (const s of b.succ) if (byId.has(s.to)) preds.get(s.to).push(b.start);
  const useOf = new Map(blocks.map((b) => [b.start, blockUseDef(b.insns).use])); // canonical regs read by the block

  // keep only short, non-frame expressions in the forwarded environment (values are {expr,w})
  const capped = (m) => { const o = new Map(); for (const [k, v] of m) if (v && typeof v.expr === 'string' && v.expr.length <= CAP && !FRAMEREG.has(k)) o.set(k, v); return o; };
  const outEnv = new Map(); const inEnv = new Map();

  // entry env: only when there is exactly one predecessor (no merge, no phi), and only for
  // registers this block actually reads — a value passing through untouched is not carried,
  // so it is never re-spilled here
  const succCount = (start) => (byId.get(start) ? byId.get(start).succ.filter((s) => byId.has(s.to)).length : 0);
  const singleIn = (start) => {
    const ps = preds.get(start) || [];
    // strict linear chain only: one predecessor, and that predecessor has only this successor.
    // This makes value duplication across branches impossible (the value has exactly one path).
    if (ps.length !== 1 || !outEnv.has(ps[0]) || succCount(ps[0]) !== 1) return new Map();
    const use = useOf.get(start) || new Set();
    const res = new Map();
    for (const [r, e] of outEnv.get(ps[0])) if (use.has(canon(r))) res.set(r, e);
    return res;
  };

  let changed = true; let guard = 0;
  while (changed && guard < 2000) {
    changed = false; guard += 1;
    for (const start of order) {
      const b = byId.get(start); if (!b) continue;
      const ie = singleIn(start);
      const prev = outEnv.get(start);
      const oe = capped(lift(b.insns, ie).outEnv);
      inEnv.set(start, ie);
      if (!prev || prev.size !== oe.size || [...oe].some(([k, v]) => (prev.get(k) || {}).expr !== v.expr)) { outEnv.set(start, oe); changed = true; }
    }
  }

  const noSpill = new Map();
  for (const b of blocks) {
    const oe = outEnv.get(b.start) || new Map();
    const ns = new Set();
    const succ = b.succ.filter((s) => byId.has(s.to));
    // suppress a spill only if there is exactly one successor and it inherits this value
    if (succ.length === 1 && (preds.get(succ[0].to) || []).length === 1) {
      const sie = inEnv.get(succ[0].to) || new Map();
      for (const [r, e] of oe) if (e.expr !== r && (sie.get(r) || {}).expr === e.expr) ns.add(r);
    }
    noSpill.set(b.start, ns);
  }
  return { inEnv, noSpill, merges: new Map() };
}

export { liveness, withAliases, defsUses, blockUseDef, canon, valueFlow };
