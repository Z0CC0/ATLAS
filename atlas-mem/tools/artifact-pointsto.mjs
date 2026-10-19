/**
 * ATLAS — intra-procedural points-to, the step past per-register struct recovery. Our own,
 * over our own CFG. The earlier struct pass groups field accesses by the register that holds
 * the base, but one object is reached through many registers over a function's life. This
 * pass gives each pointer value an origin tag and propagates it: an incoming argument
 * (rcx/rdx/r8/r9 = arg0..arg3), a call's return (a fresh object), a global, or a pointer
 * loaded out of another object's field (`O.fN`). An access `[reg+disp]` is then attributed to
 * the *origin* of reg, so `[rcx+8]` and, after `mov rax, rcx`, `[rax+0x10]` fall on the same
 * object and merge into one struct. A field whose loaded value is itself used as a base is a
 * pointer; a call through a field is a function pointer; widths come from the access size.
 * This is a lightweight points-to, not a full one: it is flow-sensitive and intra-procedural,
 * a merge of disagreeing origins clears the tag, and it does not reason about aliasing in
 * memory. Nothing is executed.
 */

import { canon } from './artifact-dataflow.mjs';
import { REGINFO } from './artifact-lift-x86.mjs';

const WTYPE = { 8: 'int8_t', 16: 'int16_t', 32: 'int32_t', 64: 'int64_t' };
const ARGREG = { rcx: 'arg0', rdx: 'arg1', r8: 'arg2', r9: 'arg3' };
const suffix = (disp) => (disp ? disp.replace('+0x', '').replace('-0x', 'm') : '0');

function parse(text) {
  const sp = (text || '').indexOf(' ');
  return { mnem: sp < 0 ? (text || '') : text.slice(0, sp), ops: sp < 0 ? [] : text.slice(sp + 1).split(', ') };
}
const MEM = /^\[([a-z][a-z0-9]*)([+-]0x[0-9a-f]+)?\]$/;          // [base(+disp)]
const MEMIDX = /^\[([a-z][a-z0-9]*)\+([a-z][a-z0-9]*)\*(\d+)([+-]0x[0-9a-f]+)?\]$/; // [base+idx*scale(+disp)]

/** Transfer one instruction's effect on the origin map (reg -> origin tag). */
function transfer(org, ins) {
  const { mnem, ops } = parse(ins.text);
  const [dst, src] = ops;
  const set = (reg, tag) => { const i = REGINFO[reg]; if (i) { if (tag) org.set(i.c, tag); else org.delete(i.c); } };
  const get = (reg) => { const i = REGINFO[reg]; return i ? org.get(i.c) : undefined; };
  if (mnem === 'mov') {
    if (!dst || dst.startsWith('[')) return; // store: does not change a register's origin
    if (!src) return;
    if (src.startsWith('[')) {
      const mr = MEM.exec(src);
      if (mr && mr[1] === 'rip') set(dst, 'global_' + suffix(mr[2]));
      else if (mr) { const o = get(mr[1]); set(dst, o ? `${o}.f${suffix(mr[2])}` : null); }
      else set(dst, null); // indexed / complex load: an element value, not an object pointer
    } else set(dst, get(src)); // reg<-reg copies the origin
  } else if (mnem === 'lea') {
    const mr = src && MEM.exec(src); set(dst, mr ? get(mr[1]) : null); // interior pointer: same object
  } else if (mnem === 'add' || mnem === 'sub') {
    if (dst && !dst.startsWith('[') && src && /^0x/.test(src)) { /* pointer arithmetic: keep origin */ } else if (dst && !dst.startsWith('[')) set(dst, null);
  } else if (mnem === 'call') {
    for (const r of ['rcx', 'rdx', 'r8', 'r9', 'r10', 'r11']) org.delete(r);
    org.set('rax', 'ret_' + (ins.addr != null ? ins.addr.toString(16) : 'x'));
  } else if (dst && !dst.startsWith('[') && REGINFO[dst]) set(dst, null); // any other write clears the origin
}

/** x86: list the memory accesses in one instruction, each attributed to its base's origin. */
function scanX86(ins, org) {
  const { mnem, ops } = parse(ins.text || ''); const out = [];
  for (let i = 0; i < ops.length; i += 1) {
    const t = ops[i];
    const mi = MEMIDX.exec(t);
    if (mi) { const o = REGINFO[mi[1]] && org.get(REGINFO[mi[1]].c); if (o) { const other = ops[1 - i]; const ri = other && REGINFO[other]; out.push({ origin: o, indexed: true, scale: Number(mi[3]), bits: ri ? ri.w : null }); } continue; }
    const m = MEM.exec(t);
    if (m && m[1] !== 'rip') { const o = REGINFO[m[1]] && org.get(REGINFO[m[1]].c); if (!o) continue; const other = ops[1 - i]; const ri = other && REGINFO[other]; out.push({ origin: o, off: m[2] ? parseInt(m[2].replace('+', ''), 16) : 0, bits: ri ? ri.w : null, call: (mnem === 'call' || mnem === 'jmp') && i === 0 }); }
  }
  return out;
}

// ---------------------------------------------------------------- ARM64 model

const ARGREG_ARM = { x0: 'arg0', x1: 'arg1', x2: 'arg2', x3: 'arg3', x4: 'arg4', x5: 'arg5', x6: 'arg6', x7: 'arg7' };
const canonArm = (r) => (/^w(\d+)$/.test(r) ? 'x' + r.slice(1) : r);
function splitBr(s) { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '[') d += 1; else if (ch === ']') d -= 1; if (ch === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; }
function parseArm(text) { const sp = (text || '').indexOf(' '); return { mnem: sp < 0 ? (text || '') : text.slice(0, sp), ops: sp < 0 ? [] : splitBr(text.slice(sp + 1)) }; }
const widthOf = (r) => (/^x\d+$/.test(r) ? 64 : /^w\d+$/.test(r) ? 32 : null);
const ARM_MEM = /^\[(x\d+|sp)(?:, (-?0x[0-9a-f]+))?\]!?$/;

function transferArm(org, ins) {
  const { mnem, ops } = parseArm(ins.text || '');
  const [dst, src] = ops;
  const isR = (r) => /^(x\d+|w\d+)$/.test(r || '');
  const set = (r, t) => { if (isR(r)) { if (t) org.set(canonArm(r), t); else org.delete(canonArm(r)); } };
  const get = (r) => org.get(canonArm(r));
  if (mnem === 'mov') { if (isR(dst)) { if (isR(src)) set(dst, get(src)); else set(dst, null); } }
  else if (/^ldr/.test(mnem)) { const mr = ARM_MEM.exec(src || ''); if (isR(dst)) { if (mr && mr[1] !== 'sp') { const o = get(mr[1]); set(dst, o ? `${o}.f${suffix(mr[2])}` : null); } else set(dst, null); } }
  else if (mnem === 'adrp' || mnem === 'adr') { set(dst, 'global_' + (src || '').replace(/[^\w]/g, '')); }
  else if (mnem === 'add' || mnem === 'sub') { if (isR(dst) && isR(src) && ops[2] && /^-?0x/.test(ops[2])) set(dst, get(src)); else if (isR(dst)) set(dst, null); }
  else if (mnem === 'bl' || mnem === 'blr') { for (let i = 0; i <= 18; i += 1) org.delete('x' + i); org.delete('x30'); org.set('x0', 'ret_' + (ins.addr != null ? ins.addr.toString(16) : 'x')); }
  else if (isR(dst) && !/^(cmp|cmn|tst|str|stp|b|cbz|cbnz|tbz|tbnz|ret)/.test(mnem)) set(dst, null);
}

/** ARM64: list the memory accesses in one instruction. */
function scanArm(ins, org) {
  const { mnem, ops } = parseArm(ins.text || ''); const out = [];
  const regOp = ops.find((o) => /^(x\d+|w\d+)$/.test(o));
  const bits = regOp ? widthOf(regOp) : null;
  for (const t of ops) {
    const m = ARM_MEM.exec(t); if (!m || m[1] === 'sp') continue;
    const o = org.get(canonArm(m[1])); if (!o) continue;
    out.push({ origin: o, off: m[2] ? parseInt(m[2].replace(/-?0x/, ''), 16) * (m[2][0] === '-' ? -1 : 1) : 0, bits });
  }
  return out;
}

/** Points-to over the CFG: origins at entry, a forward fixpoint, then attribute accesses. */
function pointsTo(cfg, arch) {
  const model = arch === 'arm64'
    ? { argreg: ARGREG_ARM, transfer: transferArm, scan: scanArm }
    : { argreg: ARGREG, transfer, scan: scanX86 };
  const blocks = cfg.blocks;
  const byId = new Map(blocks.map((b) => [b.start, b]));
  const preds = new Map(blocks.map((b) => [b.start, []]));
  for (const b of blocks) for (const s of b.succ) if (byId.has(s.to)) preds.get(s.to).push(b.start);

  const seed = new Map(Object.entries(model.argreg).map(([r, t]) => [r, t])); // arg regs at entry
  const IN = new Map(); const OUT = new Map();
  const meet = (start) => {
    const ps = preds.get(start) || [];
    if (!ps.length) return new Map(seed);
    if (ps.some((p) => !OUT.has(p))) return start === cfg.start ? new Map(seed) : new Map();
    const base = OUT.get(ps[0]); const res = new Map();
    for (const [k, v] of base) if (ps.every((p) => OUT.get(p).get(k) === v)) res.set(k, v);
    return res;
  };
  let changed = true; let guard = 0;
  while (changed && guard < 2000) {
    changed = false; guard += 1;
    for (const b of blocks) {
      const inp = meet(b.start);
      const o = new Map(inp);
      for (const ins of b.insns) model.transfer(o, ins);
      const prev = OUT.get(b.start);
      IN.set(b.start, inp);
      if (!prev || prev.size !== o.size || [...o].some(([k, v]) => prev.get(k) !== v)) { OUT.set(b.start, o); changed = true; }
    }
  }

  // attribute every memory access to the origin of its base register
  const fields = new Map();   // origin -> Map(offNum -> { bits })
  const arrays = new Map();   // origin -> { scale, bits }
  const fnset = new Map();    // origin -> Set(offNum)
  const usedBase = new Set(); // origins that were dereferenced as a base
  const field = (o, off) => { if (!fields.has(o)) fields.set(o, new Map()); return fields.get(o); };
  for (const b of blocks) {
    const org = new Map(IN.get(b.start) || seed);
    for (const ins of b.insns) {
      for (const a of model.scan(ins, org)) {
        usedBase.add(a.origin);
        if (a.indexed) { arrays.set(a.origin, { scale: a.scale, bits: a.bits }); continue; }
        const cur = field(a.origin).get(a.off) || { bits: null };
        if (a.bits && (!cur.bits || a.bits > cur.bits)) cur.bits = a.bits;
        field(a.origin).set(a.off, cur);
        if (a.call) { if (!fnset.has(a.origin)) fnset.set(a.origin, new Set()); fnset.get(a.origin).add(a.off); }
      }
      model.transfer(org, ins); // advance the origins for the next instruction
    }
  }

  // build structs per origin with two or more fields
  const structs = [];
  for (const [origin, offs] of fields) {
    if (offs.size < 2) continue;
    const name = origin.replace(/[^a-z0-9]/gi, '_') + '_t';
    const members = [...offs.keys()].sort((a, b) => a - b).map((off) => {
      const o = off < 0 ? '-0x' + (-off).toString(16) : '+0x' + off.toString(16);
      const fieldName = 'field_' + (off < 0 ? 'm' + (-off).toString(16) : off.toString(16));
      const fn = fnset.has(origin) && fnset.get(origin).has(off);
      const ptr = usedBase.has(`${origin}.f${suffix(o)}`);
      const bits = offs.get(off).bits;
      const type = ptr ? 'void*' : (bits ? WTYPE[bits] : 'int64_t');
      return { off: o, field: fieldName, type, fn: !!fn, bits: bits || null };
    });
    structs.push({ origin, name, members });
  }
  const arrs = [];
  for (const [origin, { scale, bits }] of arrays) {
    const elem = bits ? (WTYPE[bits] || 'int64_t') : (WTYPE[scale * 8] || 'int64_t');
    arrs.push({ origin, elem, scale });
  }
  return { structs, arrays: arrs };
}

/** Render points-to structs as C declarations (comment-prefixed). */
function renderPointsTo(structs) {
  const lines = [];
  for (const s of structs) {
    lines.push(`// points-to struct for ${s.origin} (fields merged across every register that held this object)`);
    lines.push(`struct ${s.name} {`);
    for (const m of s.members) lines.push(m.fn ? `  void (*${m.field})();  // ${m.off}, called indirectly` : `  ${m.type} ${m.field};  // ${m.off}`);
    lines.push('};');
  }
  return lines;
}

export { pointsTo, renderPointsTo, transfer };
