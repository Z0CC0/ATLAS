/**
 * ATLAS — lift an x86-64 function's basic blocks to low-level pseudo-C. Our own, over our
 * own disassembler and CFG. The register state is keyed on the canonical 64-bit register
 * with a width, so writing `eax` correctly kills the old value of `rax` (and, per the x86-64
 * rule, zero-extends into the top half), writing `al` is a partial write that leaves a wider
 * read opaque, and a value is never mistaken across widths. Within a block it folds
 * expressions: a register holds the expression last assigned to it, substituted into later
 * uses, so a `mov`/`add` chain collapses into one statement; a memory write, a call, a
 * compare that feeds a branch, and a return are the statements. Memory reads back as array
 * and field access from the address shape. The branch condition is recovered from the
 * preceding `cmp`/`test` and the jump. The block's exit environment is returned so a caller
 * can forward values across the CFG. Nothing is executed.
 */

const BIN = { add: '+', sub: '-', and: '&', or: '|', xor: '^', shl: '<<', shr: '>>', sar: '>>', imul: '*', mul: '*', adc: '+', sbb: '-' };
const CC = { e: '==', z: '==', ne: '!=', nz: '!=', l: '<', nge: '<', le: '<=', ng: '<=', g: '>', nle: '>', ge: '>=', nl: '>=', b: '<', c: '<', nae: '<', be: '<=', na: '<=', a: '>', nbe: '>', ae: '>=', nb: '>=', nc: '>=' };

// name -> { c: canonical 64-bit register, w: width in bits }
const REGINFO = {};
for (const [q, d, w, b] of [
  ['rax', 'eax', 'ax', 'al'], ['rcx', 'ecx', 'cx', 'cl'], ['rdx', 'edx', 'dx', 'dl'], ['rbx', 'ebx', 'bx', 'bl'],
  ['rsi', 'esi', 'si', 'sil'], ['rdi', 'edi', 'di', 'dil'], ['rbp', 'ebp', 'bp', 'bpl'], ['rsp', 'esp', 'sp', 'spl'],
]) { REGINFO[q] = { c: q, w: 64 }; REGINFO[d] = { c: q, w: 32 }; REGINFO[w] = { c: q, w: 16 }; REGINFO[b] = { c: q, w: 8 }; }
for (let i = 8; i <= 15; i += 1) { const q = 'r' + i; REGINFO[q] = { c: q, w: 64 }; REGINFO[q + 'd'] = { c: q, w: 32 }; REGINFO[q + 'w'] = { c: q, w: 16 }; REGINFO[q + 'b'] = { c: q, w: 8 }; }
const FRAME = new Set(['rsp', 'rbp']); // the frame base stays symbolic for the frame-recovery pass
const VOLATILE = ['rax', 'rcx', 'rdx', 'r8', 'r9', 'r10', 'r11'];
const REGTOK = /\b([re]?[abcd]x|[re]?[sd]i|[re]?[sb]p|r\d+[dwb]?|[abcd]l|sil|dil|bpl|spl)\b/g;

function parse(text) {
  const sp = text.indexOf(' ');
  const mnem = sp < 0 ? text : text.slice(0, sp);
  const ops = sp < 0 ? [] : text.slice(sp + 1).split(', ');
  return { mnem, ops };
}

/**
 * Lift one block. Returns { stmts, cond, outEnv } — outEnv maps a canonical register to
 * { expr, w }. `inEnv` seeds the environment (forwarded from a predecessor), `liveOut` is the
 * set of raw register names live out (only those are spilled), `noSpill` suppresses a spill
 * for a value forwarded onward. `sym(ins)` may name a call target.
 */
function liftBlock(insns, sym, liveOut, inEnv, noSpill) {
  const env = new Map(inEnv || []); // canonical reg -> { expr, w }
  const stmts = [];
  let cmp = null;
  const isMem = (t) => typeof t === 'string' && t.startsWith('[');

  // read a register as the current expression, honouring width; opaque -> the name as written
  const rd = (name) => {
    const info = REGINFO[name];
    if (!info) return name; // not a general register (xmm, rip, an immediate, a label)
    const e = env.get(info.c);
    if (e && (e.w === info.w || (info.w >= 32 && e.w >= 32))) return e.expr;
    return name;
  };
  // write a register: a 32/64-bit write defines the full 64-bit value (x86-64 zero-extends a
  // 32-bit result); an 8/16-bit write is partial, so a later wider read of it is opaque
  const wr = (name, expr) => { const info = REGINFO[name]; if (info) env.set(info.c, { expr, w: info.w >= 32 ? 64 : info.w }); };
  const kill = (name) => { const info = REGINFO[name]; if (info) env.delete(info.c); };

  const subAddr = (inner) => inner.replace(REGTOK, (t) => { const i = REGINFO[t]; return (i && !FRAME.has(i.c)) ? rd(t) : t; });
  const sub1 = (r) => { const i = REGINFO[r]; return (i && !FRAME.has(i.c)) ? rd(r) : r; };
  // render a dereference as array / field access from the address shape
  const deref = (t) => {
    const inner = t.slice(1, -1);
    const m = /^([a-z][a-z0-9]*)?(?:\+([a-z][a-z0-9]*)\*(\d+))?([+-]0x[0-9a-f]+)?$/.exec(inner);
    const base = m && m[1];
    const bInfo = base && REGINFO[base];
    if (!base || (bInfo && FRAME.has(bInfo.c)) || base === 'rip') return `*(${subAddr(inner)})`;
    const idx = m[2], disp = m[4];
    const bv = sub1(base); const B = /[ +*/^&|-]/.test(bv) ? `(${bv})` : bv;
    if (idx) { if (disp) return `*(${subAddr(inner)})`; return `${B}[${sub1(idx)}]`; }
    if (disp) return `${B}->field_${disp.replace('+0x', '').replace('-0x', 'm')}`;
    return `*${B}`;
  };
  const val = (t) => { if (t == null) return '?'; if (isMem(t)) return deref(t); if (REGINFO[t]) return rd(t); return t; };

  for (let k = 0; k < insns.length; k += 1) {
    const ins = insns[k]; const { mnem, ops } = parse(ins.text);
    const last = k === insns.length - 1;
    if (mnem === 'nop' || mnem === 'endbr64' || mnem === 'int3') continue;
    if (/^j/.test(mnem) && last) break;
    if (mnem === 'ret' || mnem === 'retf') break;
    if (mnem === 'mov' || mnem === 'movzx' || mnem === 'movsx' || mnem === 'movsxd') {
      const [dst, src] = ops; if (isMem(dst)) stmts.push(`${deref(dst)} = ${val(src)};`); else wr(dst, val(src)); continue;
    }
    // SSE/AVX data moves: a move, so render it as one (xmm registers are not env-tracked)
    if (/^(movups|movaps|movdqu|movdqa|movss|movsd|movq|movd|vmovups|vmovaps|vmovdqu|vmovdqa)$/.test(mnem) && ops.length === 2) {
      const [dst, src] = ops; const sv = isMem(src) ? deref(src) : (REGINFO[src] ? rd(src) : src);
      if (isMem(dst)) stmts.push(`${deref(dst)} = ${sv};`); else if (REGINFO[dst]) wr(dst, sv); else stmts.push(`${dst} = ${sv};`);
      continue;
    }
    if (mnem === 'lea') { const [dst, m] = ops; wr(dst, `&(${subAddr(m.slice(1, -1))})`); continue; }
    if ((mnem === 'xor' || mnem === 'sub') && ops.length === 2 && ops[0] === ops[1] && !isMem(ops[0])) { wr(ops[0], '0'); continue; } // zeroing idiom
    if (BIN[mnem] && ops.length >= 2) { const [dst, src] = ops; const e = `(${val(dst)} ${BIN[mnem]} ${val(src)})`; if (isMem(dst)) stmts.push(`${deref(dst)} = ${e};`); else wr(dst, e); continue; }
    if (mnem === 'inc' || mnem === 'dec') { const d = ops[0]; const e = `(${val(d)} ${mnem === 'inc' ? '+' : '-'} 1)`; if (isMem(d)) stmts.push(`${deref(d)} = ${e};`); else wr(d, e); continue; }
    if (mnem === 'neg') { wr(ops[0], `(-${val(ops[0])})`); continue; }
    if (mnem === 'not') { wr(ops[0], `(~${val(ops[0])})`); continue; }
    if (mnem === 'cmp') { cmp = { a: val(ops[0]), b: val(ops[1]), test: false }; continue; }
    if (mnem === 'test') { cmp = { a: val(ops[0]), b: val(ops[1]), test: true }; continue; }
    if (mnem === 'push' || mnem === 'pop' || mnem === 'leave' || mnem === 'cdqe' || mnem === 'cqo') continue;
    if (mnem === 'call') { const named = sym && sym(ins); const t = named ? named.replace(/!/g, '.') : 'sub_' + (ops[0] || 'fn').replace(/[^\w]/g, '_'); stmts.push(`rax = ${t}(...);`); for (const r of VOLATILE) env.delete(r); continue; }
    if (mnem === 'xchg') { const [a, b] = ops; const va = val(a), vb = val(b); if (!isMem(a)) wr(a, vb); if (!isMem(b)) wr(b, va); continue; }
    stmts.push(`// ${ins.text}`);
  }

  // materialise the live, non-trivial registers so a successor that reads them has a definition
  const endsRet = insns.length && /^(ret|retf)\b/.test(insns[insns.length - 1].text || ''); // keep the return value visible
  for (const [c, e] of env) if (e.expr !== c && (!liveOut || liveOut.has(c) || (endsRet && c === 'rax')) && !(noSpill && noSpill.has(c))) stmts.push(`${c} = ${e.expr};`);

  const term = insns[insns.length - 1]; let cond = null;
  if (term && /^j/.test(term.mnem) && term.mnem !== 'jmp') {
    const cc = term.mnem.slice(1); const opr = CC[cc];
    if (cmp && opr) cond = { text: cmp.test ? (cmp.a === cmp.b ? `${cmp.a} ${opr} 0` : `(${cmp.a} & ${cmp.b}) ${opr} 0`) : `${cmp.a} ${opr} ${cmp.b}` };
    else if (cc === 's') cond = { text: cmp ? `(${cmp.a} - ${cmp.b}) < 0` : 'SF' };
    else if (cc === 'ns') cond = { text: cmp ? `(${cmp.a} - ${cmp.b}) >= 0` : '!SF' };
    else cond = { text: `cc_${cc}` };
  }
  return { stmts, cond, outEnv: new Map(env) };
}

/** Lift a whole function (its CFG) to structured pseudo-C with conditions and labelled gotos. */
function liftFunction(cfg, base, sym) {
  base = base || 0;
  const L = (a) => 'L_' + (base + a).toString(16);
  const out = [`// function at 0x${(base + cfg.start).toString(16)} — ${cfg.blocks.length} blocks, ${cfg.loops} loop edge(s); low-level pseudo-C, no types`];
  for (const b of cfg.blocks) {
    out.push(`${L(b.start)}:`);
    const { stmts, cond } = liftBlock(b.insns, sym);
    for (const s of stmts) out.push('  ' + s);
    const cT = b.succ.find((s) => s.cond), fall = b.succ.find((s) => s.fall), jmp = b.succ.find((s) => !s.cond && !s.fall);
    if (cond && cT) { out.push(`  if (${cond.text}) goto ${L(cT.to)};${cT.loop ? ' // loop' : ''}`); if (fall) out.push(`  goto ${L(fall.to)};`); }
    else if (jmp) out.push(`  goto ${L(jmp.to)};${jmp.loop ? ' // loop' : ''}`);
    else if (fall) out.push(`  goto ${L(fall.to)};`);
    else out.push('  return rax;');
  }
  return out.join('\n');
}

export { liftBlock, liftFunction, REGINFO };
