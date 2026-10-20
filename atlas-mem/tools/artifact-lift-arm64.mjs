/**
 * ATLAS — lift an ARM64 (A64) function's basic blocks to low-level pseudo-C. Our own, over
 * our own disassembler and CFG, the ARM64 counterpart of the x86-64 lifter. A64 is a clean
 * three-operand RISC: a register holds the expression last written to it, substituted into
 * later uses; a store, a call and a return are the statements; the branch condition is
 * recovered from a flag-setting compare (`subs`/`ands` into the zero register, i.e. `cmp`/
 * `tst`) and the `b.<cond>` kind, or straight from `cbz`/`cbnz`/`tbz`/`tbnz`. The zero
 * register reads as 0; `sp` stays the symbolic frame base. Memory reads back as array and
 * field access from the address shape. Nothing is executed.
 */

const BIN = { add: '+', sub: '-', and: '&', orr: '|', eor: '^', lsl: '<<', lsr: '>>', asr: '>>', lslv: '<<', lsrv: '>>', asrv: '>>', mul: '*', udiv: '/', sdiv: '/' };
// condition codes interpreted against a `cmp a, b` (a - b)
const CC = {
  eq: (a, b) => `${a} == ${b}`, ne: (a, b) => `${a} != ${b}`,
  lt: (a, b) => `${a} < ${b}`, le: (a, b) => `${a} <= ${b}`, gt: (a, b) => `${a} > ${b}`, ge: (a, b) => `${a} >= ${b}`,
  cs: (a, b) => `${a} >= ${b}`, hs: (a, b) => `${a} >= ${b}`, cc: (a, b) => `${a} < ${b}`, lo: (a, b) => `${a} < ${b}`,
  hi: (a, b) => `${a} > ${b}`, ls: (a, b) => `${a} <= ${b}`, mi: (a, b) => `(${a} - ${b}) < 0`, pl: (a, b) => `(${a} - ${b}) >= 0`,
};

const canon = (r) => (/^w(\d+)$/.test(r) ? 'x' + r.slice(1) : (r === 'wsp' ? 'sp' : (r === 'wzr' ? 'xzr' : r)));
const isGpr = (r) => /^(x\d+|w\d+|sp|wsp|xzr|wzr)$/.test(r);
const FRAME = (r) => r === 'sp' || r === 'wsp';

/** Split an operand string on commas that are not inside `[ ]`. */
function splitOps(s) {
  const out = []; let d = 0, cur = '';
  for (const ch of s) {
    if (ch === '[') d += 1; else if (ch === ']') d -= 1;
    if (ch === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function parse(text) { const sp = text.indexOf(' '); return { mnem: sp < 0 ? text : text.slice(0, sp), ops: sp < 0 ? [] : splitOps(text.slice(sp + 1)) }; }

function liftBlock(insns, sym, liveOut, inEnv, noSpill) {
  const env = new Map(inEnv || []); // canonical reg -> expression (seeded from a predecessor)
  const stmts = [];
  let cmp = null;
  const rd = (r) => { if (r === 'xzr' || r === 'wzr') return '0'; const c = canon(r); return env.has(c) ? env.get(c) : r; };
  const wr = (r, e) => { if (r === 'xzr' || r === 'wzr') return; env.set(canon(r), e); };
  const isMem = (t) => t && t.startsWith('[');
  const subReg = (s) => s.replace(/\b(x\d+|w\d+|sp)\b/g, (t) => (FRAME(t) ? t : rd(t)));
  const deref = (memTok) => {
    const wb = memTok.endsWith('!');
    const inner = memTok.replace(/^\[/, '').replace(/\]!?$/, '');
    const parts = splitOps(inner);
    const base = parts[0];
    let text;
    if (parts.length >= 2) {
      const idx = parts[1];
      if (/^(x\d+|w\d+)$/.test(idx)) text = `${FRAME(base) ? base : rd(base)}[${rd(idx)}]`;
      else { const off = idx.replace(/^#?/, ''); text = FRAME(base) ? `*(${base} + ${off})` : `${rd(base)}->field_${off.replace('0x', '')}`; }
    } else text = `*${FRAME(base) ? base : rd(base)}`;
    if (wb && parts[1]) wr(base, `(${rd(base)} + ${parts[1]})`); // pre-indexed writeback
    return text;
  };
  const val = (t) => { if (t == null) return '?'; if (isMem(t)) return deref(t); if (t === 'xzr' || t === 'wzr') return '0'; if (isGpr(t)) return rd(t); return t; };
  // the two slots of an ldp/stp: the pair is at [base+off] and [base+off+8]
  const pairSlots = (t) => {
    const inner = t.replace(/^\[/, '').replace(/\]!?$/, ''); const parts = splitOps(inner);
    const base = parts[0]; const p1 = parts[1];
    const n = p1 && /^-?0x/.test(p1) ? parseInt(p1.replace(/^-?0x/, ''), 16) * (p1[0] === '-' ? -1 : 1) : 0;
    const o2 = n + 8; const tok2 = o2 === 0 ? `[${base}]` : `[${base}, ${o2 < 0 ? '-0x' + (-o2).toString(16) : '0x' + o2.toString(16)}]`;
    return [deref(t.replace(/!$/, '')), deref(tok2)];
  };

  for (let k = 0; k < insns.length; k += 1) {
    const ins = insns[k]; const { mnem, ops } = parse(ins.text || '');
    const last = k === insns.length - 1;
    const base = mnem.replace(/s$/, ''); // adds->add, subs->sub, ands->and
    if (mnem === 'nop') continue;
    if (/^(b|b\.|cbz|cbnz|tbz|tbnz|br|ret|eret)/.test(mnem) && last) break; // terminator; cond handled below
    if (mnem === 'ret' || mnem === 'br' || mnem === 'eret') break;
    if (mnem === 'mov') { wr(ops[0], val(ops[1])); continue; }
    if (mnem === 'movz') { const sh = ops[2] && /lsl (\d+)/.exec(ops[2]); wr(ops[0], sh ? `(${ops[1]} << ${sh[1]})` : ops[1]); continue; }
    if (mnem === 'movn') { wr(ops[0], `(~${ops[1]})`); continue; }
    if (mnem === 'movk') { env.delete(canon(ops[0])); continue; } // partial insert: opaque
    if (mnem === 'adrp' || mnem === 'adr') { wr(ops[0], `&${ops[1]}`); continue; }
    if ((mnem === 'cmp' || mnem === 'subs' || mnem === 'adds' || mnem === 'cmn') && (ops[0] === 'xzr' || ops[0] === 'wzr' || mnem === 'cmp' || mnem === 'cmn')) {
      const o = mnem === 'cmp' || mnem === 'cmn' ? ops : ops.slice(1); cmp = { a: val(o[0]), b: val(o[1]) }; continue;
    }
    if ((mnem === 'tst' || mnem === 'ands') && (ops[0] === 'xzr' || ops[0] === 'wzr' || mnem === 'tst')) {
      const o = mnem === 'tst' ? ops : ops.slice(1); cmp = { a: val(o[0]), b: val(o[1]), test: true }; continue;
    }
    if (BIN[base] && ops.length >= 3) {
      const [d, n, m] = ops; let rhs = val(m);
      if (ops[3] && /(lsl|lsr|asr) (\d+)/.test(ops[3])) { const s = /(lsl|lsr|asr) (\d+)/.exec(ops[3]); rhs = `(${rhs} ${s[1] === 'lsl' ? '<<' : '>>'} ${s[2]})`; }
      const a = val(n);
      if ((base === 'orr' || base === 'eor') && a === '0') { wr(d, rhs); continue; } // 0 | x  /  0 ^ x  ->  x
      if ((base === 'orr' || base === 'eor') && rhs === '0') { wr(d, a); continue; }
      if (base === 'and' && (a === '0' || rhs === '0')) { wr(d, '0'); continue; } // x & 0 -> 0
      wr(d, `(${a} ${BIN[base]} ${rhs})`); continue;
    }
    if (base === 'add' || base === 'sub') { wr(ops[0], `(${val(ops[1])} ${base === 'add' ? '+' : '-'} ${val(ops[2])})`); continue; }
    if (/^ldr/.test(mnem)) { wr(ops[0], deref(ops[1])); continue; }
    if (/^str/.test(mnem)) { stmts.push(`${deref(ops[1])} = ${val(ops[0])};`); continue; }
    if (mnem === 'ldp') { const [a, b2] = pairSlots(ops[2]); wr(ops[0], a); wr(ops[1], b2); continue; }
    if (mnem === 'stp') { const [a, b2] = pairSlots(ops[2]); stmts.push(`${a} = ${val(ops[0])};`); stmts.push(`${b2} = ${val(ops[1])};`); continue; }
    if (mnem === 'csel' || mnem === 'csinc' || mnem === 'csinv' || mnem === 'csneg' || mnem === 'cset' || mnem === 'csetm') {
      const cc = ops[ops.length - 1]; const c = cmp && CC[cc] ? CC[cc](cmp.a, cmp.b) : `cc_${cc}`;
      if (mnem === 'cset') wr(ops[0], `(${c} ? 1 : 0)`); else wr(ops[0], `(${c} ? ${val(ops[1])} : ${val(ops[2])})`);
      continue;
    }
    if (mnem === 'bl' || mnem === 'blr') {
      const named = sym && sym(ins);
      let t;
      if (named) t = named;
      else if (mnem === 'blr') t = `(*${val(ops[0])})`;
      else { const m = /([+-])0x([0-9a-f]+)/.exec(ops[0] || ''); t = (m && ins.addr != null) ? 'sub_0x' + ((ins.addr + parseInt(m[2], 16) * (m[1] === '-' ? -1 : 1)) >>> 0).toString(16) : 'sub_' + (ops[0] || 'fn').replace(/[^\w]/g, '_'); }
      stmts.push(`x0 = ${t}(...);`); for (let i = 0; i <= 17; i += 1) env.delete('x' + i); continue;
    }
    if (mnem === 'neg') { wr(ops[0], `(-${val(ops[1])})`); continue; }
    if (mnem === 'mvn') { wr(ops[0], `(~${val(ops[1])})`); continue; }
    stmts.push(`// ${ins.text}`);
  }

  // spill the registers this block defined to a non-trivial expression (no cross-block liveness yet)
  const endsRet = insns.length && /^(ret|eret)\b/.test(insns[insns.length - 1].text || ''); // keep the return value visible
  for (const [r, e] of env) if (e !== r && !FRAME(r) && (!liveOut || liveOut.has(r) || (endsRet && r === 'x0')) && !(noSpill && noSpill.has(r))) stmts.push(`${r} = ${e};`);

  const term = insns[insns.length - 1]; let cond = null;
  if (term) {
    const { mnem, ops } = parse(term.text || '');
    if (/^b\./.test(mnem)) { const cc = mnem.slice(2); cond = { text: cmp && CC[cc] ? CC[cc](cmp.a, cmp.b) : `cc_${cc}` }; }
    else if (mnem === 'cbz') cond = { text: `${val(ops[0])} == 0` };
    else if (mnem === 'cbnz') cond = { text: `${val(ops[0])} != 0` };
    else if (mnem === 'tbz') cond = { text: `(${val(ops[0])} & (1 << ${ops[1]})) == 0` };
    else if (mnem === 'tbnz') cond = { text: `(${val(ops[0])} & (1 << ${ops[1]})) != 0` };
  }
  return { stmts, cond, outEnv: new Map(env) };
}

export { liftBlock };
