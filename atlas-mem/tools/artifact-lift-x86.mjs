/**
 * ATLAS — lift an x86-64 function's basic blocks to low-level pseudo-C. Our own, over our
 * own disassembler and CFG. Within a block it folds expressions: a register holds the
 * expression last assigned to it, and that expression is substituted into later uses, so a
 * `mov`/`add` chain collapses into one statement; a memory write, a call, a compare that
 * feeds a branch, and a return are the statements. The branch condition is recovered from
 * the preceding `cmp`/`test` and the conditional-jump kind. No type recovery, no cross-block
 * value tracking: registers are the variables, memory is `*(addr)`, a call target is an
 * offset. This is the honest middle ground before a full decompiler; nothing is executed.
 */

const BIN = { add: '+', sub: '-', and: '&', or: '|', xor: '^', shl: '<<', shr: '>>', sar: '>>', imul: '*', mul: '*', adc: '+', sbb: '-' };
const CC = { e: '==', z: '==', ne: '!=', nz: '!=', l: '<', nge: '<', le: '<=', ng: '<=', g: '>', nle: '>', ge: '>=', nl: '>=', b: '<', c: '<', nae: '<', be: '<=', na: '<=', a: '>', nbe: '>', ae: '>=', nb: '>=', nc: '>=' };

function parse(text) {
  const sp = text.indexOf(' ');
  const mnem = sp < 0 ? text : text.slice(0, sp);
  const ops = sp < 0 ? [] : text.slice(sp + 1).split(', ');
  return { mnem, ops };
}

/** Lift one block. Returns { stmts: [string], cond: {text} | null } (cond for a trailing jcc).
 * `sym(ins)` may return an imported/exported name for a call target. */
function liftBlock(insns, sym, liveOut, inEnv, noSpill) {
  const env = new Map(inEnv || []); // register -> current expression (seeded from predecessors)
  const stmts = [];
  let cmp = null; // { a, b, test }
  const CALLER_SAVED = ['rax', 'rcx', 'rdx', 'r8', 'r9', 'r10', 'r11', 'eax', 'ecx', 'edx'];
  const isReg = (t) => /^[re]?([abcd]x|[sd]i|[sb]p|r\d+[dwb]?|[abcd]l)$/.test(t);
  const isMem = (t) => t.startsWith('[');
  // substitute each register in a memory address with its current expression, so a value used
  // only inside an address is not left as a bare register whose defining write liveness dropped
  const FRAME = /^(rsp|rbp|esp|ebp|sp|bp|spl|bpl)$/; // the frame base stays symbolic for frame recovery
  const subAddr = (inner) => inner.replace(/\b([re]?[abcd]x|[re]?[sd]i|[re]?[sb]p|r\d+[dwb]?|[abcd]l|sil|dil|bpl|spl)\b/g, (t) => (!FRAME.test(t) && env.has(t) ? env.get(t) : t));
  const mem = (t) => subAddr(t.slice(1, -1));
  const val = (t) => { if (t == null) return '?'; if (isMem(t)) return `*(${mem(t)})`; if (env.has(t)) return env.get(t); return t; };
  for (let k = 0; k < insns.length; k += 1) {
    const ins = insns[k]; const { mnem, ops } = parse(ins.text);
    const last = k === insns.length - 1;
    if (mnem === 'nop' || mnem === 'endbr64' || mnem === 'int3') continue;
    if (/^j/.test(mnem) && last) break; // the terminator; handled by the condition below
    if (mnem === 'ret' || mnem === 'retf') break;
    if (mnem === 'mov' || mnem === 'movzx' || mnem === 'movsx' || mnem === 'movsxd') {
      const [dst, src] = ops; if (isMem(dst)) stmts.push(`*(${mem(dst)}) = ${val(src)};`); else env.set(dst, val(src)); continue;
    }
    if (mnem === 'lea') { const [dst, m] = ops; env.set(dst, `&(${subAddr(m.slice(1, -1))})`); continue; }
    if ((mnem === 'xor' || mnem === 'sub') && ops.length === 2 && ops[0] === ops[1] && !isMem(ops[0])) { env.set(ops[0], '0'); continue; } // the zeroing idiom
    if (BIN[mnem] && ops.length >= 2) { const [dst, src] = ops; const e = `(${val(dst)} ${BIN[mnem]} ${val(src)})`; if (isMem(dst)) stmts.push(`*(${mem(dst)}) = ${e};`); else env.set(dst, e); continue; }
    if (mnem === 'inc' || mnem === 'dec') { const d = ops[0]; const e = `(${val(d)} ${mnem === 'inc' ? '+' : '-'} 1)`; if (isMem(d)) stmts.push(`*(${mem(d)}) = ${e};`); else env.set(d, e); continue; }
    if (mnem === 'neg') { env.set(ops[0], `(-${val(ops[0])})`); continue; }
    if (mnem === 'not') { env.set(ops[0], `(~${val(ops[0])})`); continue; }
    if (mnem === 'cmp') { cmp = { a: val(ops[0]), b: val(ops[1]), test: false }; continue; }
    if (mnem === 'test') { cmp = { a: val(ops[0]), b: val(ops[1]), test: true }; continue; }
    if (mnem === 'push' || mnem === 'pop' || mnem === 'leave' || mnem === 'cdqe' || mnem === 'cqo') continue;
    if (mnem === 'call') { const named = sym && sym(ins); const t = named ? named.replace(/!/g, '.') : 'sub_' + (ops[0] || 'fn').replace(/[^\w]/g, '_'); stmts.push(`rax = ${t}(...);`); for (const r of CALLER_SAVED) env.delete(r); env.set('rax', 'rax'); continue; }
    if (mnem === 'xchg') { const [a, b] = ops; const va = val(a), vb = val(b); if (!isMem(a)) env.set(a, vb); if (!isMem(b)) env.set(b, va); continue; }
    // not modelled: show it as a comment, do not corrupt the environment
    stmts.push(`// ${ins.text}`);
  }
  // materialise the registers this block defined to a non-trivial expression (they may be
  // read by a successor; without cross-block liveness we spill them all, conservatively)
  for (const [r, e] of env) if (e !== r && !/^\(rax\)$/.test(e) && (!liveOut || liveOut.has(r)) && !(noSpill && noSpill.has(r))) stmts.push(`${r} = ${e};`);
  // the trailing condition
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
    else out.push(`  return rax;`);
  }
  return out.join('\n');
}

export { liftBlock, liftFunction };
