/**
 * ATLAS — an ARM64 (A64) instruction decoder, built from the specification (Arm
 * Architecture Reference Manual for A-profile, DDI 0487, the A64 instruction-set encoding),
 * not from any tool's source. Every A64 instruction is a fixed 32 bits, little-endian and
 * 4-byte aligned, so there is no length problem and no desync: the decoder reads a word,
 * picks the top-level group from bits[28:25], and sub-decodes by bit fields. Nothing is
 * executed. The integer, memory and branch groups are decoded to readable operands; the
 * scalar-FP / SIMD group is recognised as a class but named coarsely.
 */

const CONDS = ['eq', 'ne', 'cs', 'cc', 'mi', 'pl', 'vs', 'vc', 'hi', 'ls', 'ge', 'lt', 'gt', 'le', 'al', 'nv'];
const bits = (w, hi, lo) => (w >>> lo) & ((hi - lo >= 31) ? 0xffffffff : ((1 << (hi - lo + 1)) - 1));
const bit = (w, n) => (w >>> n) & 1;
const sext = (v, n) => (v & (1 << (n - 1)) ? v - 2 ** n : v);
const hex = (n) => (n < 0 ? '-0x' + (-n).toString(16) : '0x' + n.toString(16));
const rrel = (n) => (n < 0 ? '.-0x' + (-n).toString(16) : '.+0x' + n.toString(16));

// ARM ARM DecodeBitMasks: expand a logical-immediate (N, imms, immr) to its value (BigInt),
// or null for the reserved encodings. Used by the logical (immediate) instructions.
function decodeBitmask(sf, N, immr, imms) {
  const bits = sf ? 64 : 32;
  const x = (N << 6) | ((~imms) & 0x3f);
  const len = 31 - Math.clz32(x);
  if (len < 1 || (1 << len) > bits) return null;
  const size = 1 << len;
  const S = imms & (size - 1), R = immr & (size - 1);
  if (S === size - 1) return null; // reserved
  const sizeB = BigInt(size);
  const welem = (1n << BigInt(S + 1)) - 1n;
  const mask = (1n << sizeB) - 1n;
  const r = BigInt(R % size);
  const elem = ((welem >> r) | (welem << (sizeB - r))) & mask; // ROR(welem, R) within `size`
  let out = 0n;
  for (let i = 0; i < bits; i += size) out |= elem << BigInt(i);
  return out & ((1n << BigInt(bits)) - 1n);
}

// register names. n=31 is the zero register, or SP/WSP in the few instructions that allow it.
const X = (n, sf, sp) => (n === 31 ? (sp ? (sf ? 'sp' : 'wsp') : (sf ? 'xzr' : 'wzr')) : (sf ? 'x' : 'w') + n);
const ok = (mnem, ops) => ({ mnem, text: ops ? `${mnem} ${ops}` : mnem, bad: false });
const coarse = (cls) => ({ mnem: cls, text: `(${cls})`, bad: false, coarse: true });
const bad = (w) => ({ mnem: null, text: `.word ${hex(w >>> 0)}`, bad: true });

function dpImm(w) {
  const op0 = bits(w, 25, 23), sf = bit(w, 31);
  if (op0 <= 1) { // PC-relative addressing
    const op = bit(w, 31), immlo = bits(w, 30, 29), immhi = bits(w, 23, 5), Rd = bits(w, 4, 0);
    let imm = sext((immhi << 2) | immlo, 21);
    if (op) return ok('adrp', `x${Rd}, ${rrel(imm * 4096)}`);
    return ok('adr', `x${Rd}, ${rrel(imm)}`);
  }
  if (op0 === 2) { // add/subtract (immediate)
    const op = bit(w, 30), S = bit(w, 29), sh = bit(w, 22), imm12 = bits(w, 21, 10), Rn = bits(w, 9, 5), Rd = bits(w, 4, 0);
    const imm = sh ? imm12 << 12 : imm12;
    if (op === 0 && S === 0 && imm === 0 && (Rd === 31 || Rn === 31)) return ok('mov', `${X(Rd, sf, true)}, ${X(Rn, sf, true)}`);
    return ok((op ? 'sub' : 'add') + (S ? 's' : ''), `${X(Rd, sf, !S)}, ${X(Rn, sf, true)}, ${hex(imm)}`);
  }
  if (op0 === 4) { // logical (immediate)
    const opc = bits(w, 30, 29), N = bit(w, 22), immr = bits(w, 21, 16), imms = bits(w, 15, 10), Rn = bits(w, 9, 5), Rd = bits(w, 4, 0);
    const v = decodeBitmask(sf, N, immr, imms);
    const imm = v === null ? '#bitmask' : '0x' + v.toString(16); // the real logical immediate value
    return ok(['and', 'orr', 'eor', 'ands'][opc], `${X(Rd, sf, opc !== 3)}, ${X(Rn, sf, false)}, ${imm}`);
  }
  if (op0 === 5) { // move wide (immediate)
    const opc = bits(w, 30, 29), hw = bits(w, 22, 21), imm16 = bits(w, 20, 5), Rd = bits(w, 4, 0);
    const mn = ['movn', '?', 'movz', 'movk'][opc]; const sh = hw * 16;
    return ok(mn, `${X(Rd, sf, false)}, ${hex(imm16)}${sh ? ', lsl ' + sh : ''}`);
  }
  if (op0 === 6) { // bitfield
    const opc = bits(w, 30, 29), immr = bits(w, 21, 16), imms = bits(w, 15, 10), Rn = bits(w, 9, 5), Rd = bits(w, 4, 0);
    return ok(['sbfm', 'bfm', 'ubfm', '?'][opc], `${X(Rd, sf, false)}, ${X(Rn, sf, false)}, ${hex(immr)}, ${hex(imms)}`);
  }
  if (op0 === 7) { // extract
    const Rm = bits(w, 20, 16), imms = bits(w, 15, 10), Rn = bits(w, 9, 5), Rd = bits(w, 4, 0);
    return ok('extr', `${X(Rd, sf, false)}, ${X(Rn, sf, false)}, ${X(Rm, sf, false)}, ${hex(imms)}`);
  }
  return coarse('dp-imm');
}

function branchSys(w) {
  const top6 = bits(w, 31, 26);
  if (top6 === 0b000101) return ok('b', rrel(sext(bits(w, 25, 0), 26) * 4));
  if (top6 === 0b100101) return ok('bl', rrel(sext(bits(w, 25, 0), 26) * 4));
  if (bits(w, 30, 25) === 0b011010) { const sf = bit(w, 31), op = bit(w, 24), imm19 = sext(bits(w, 23, 5), 19), Rt = bits(w, 4, 0); return ok(op ? 'cbnz' : 'cbz', `${X(Rt, sf, false)}, ${rrel(imm19 * 4)}`); }
  if (bits(w, 30, 25) === 0b011011) { const op = bit(w, 24), b5 = bit(w, 31), b40 = bits(w, 23, 19), imm14 = sext(bits(w, 18, 5), 14), Rt = bits(w, 4, 0); return ok(op ? 'tbnz' : 'tbz', `${X(Rt, b5, false)}, #${(b5 << 5) | b40}, ${rrel(imm14 * 4)}`); }
  if (bits(w, 31, 24) === 0b01010100 && bit(w, 4) === 0) { const cond = bits(w, 3, 0), imm19 = sext(bits(w, 23, 5), 19); return ok('b.' + CONDS[cond], rrel(imm19 * 4)); }
  if (bits(w, 31, 24) === 0b11010100) { const opc = bits(w, 23, 21), ll = bits(w, 1, 0), imm16 = bits(w, 20, 5); const mn = opc === 0 ? (['exc', 'svc', 'hvc', 'smc'][ll] || 'exc') : (opc === 1 ? 'brk' : opc === 2 ? 'hlt' : 'exc'); return ok(mn, hex(imm16)); }
  if (w === 0xd503201f) return ok('nop', '');
  if (bits(w, 31, 22) === 0b1101010100) { const L = bit(w, 21); if (bits(w, 31, 12) === 0xd5033) return ok('barrier', ''); return ok(L ? 'mrs' : 'msr', '<sysreg>'); }
  if (bits(w, 31, 25) === 0b1101011) { const opc = bits(w, 24, 21), Rn = bits(w, 9, 5); if (opc === 0) return ok('br', `x${Rn}`); if (opc === 1) return ok('blr', `x${Rn}`); if (opc === 2) return ok('ret', Rn === 30 ? '' : `x${Rn}`); if (opc === 4) return ok('eret', ''); return coarse('br'); }
  return coarse('branch');
}

function ldstName(size, opc, V) {
  if (V) return opc & 1 ? 'ldr' : 'str';
  if (size === 3) return opc === 0 ? 'str' : 'ldr';
  const suf = ['b', 'h', '', ''][size];
  return opc === 0 ? 'str' + suf : opc === 1 ? 'ldr' + suf : 'ldrs' + suf;
}
function regT(Rt, size, V) { if (V) return (['b', 'h', 's', 'd'][size] || 'q') + Rt; if (Rt === 31) return size === 3 ? 'xzr' : 'wzr'; return (size === 3 ? 'x' : 'w') + Rt; }

function loadStore(w) {
  if (bits(w, 29, 27) === 0b111 && bits(w, 25, 24) === 0b01) { // register unsigned immediate
    const size = bits(w, 31, 30), V = bit(w, 26), opc = bits(w, 23, 22), imm12 = bits(w, 21, 10), Rn = bits(w, 9, 5), Rt = bits(w, 4, 0);
    const off = imm12 << size;
    return ok(ldstName(size, opc, V), `${regT(Rt, size, V)}, [${X(Rn, 1, true)}${off ? ', ' + hex(off) : ''}]`);
  }
  if (bits(w, 29, 27) === 0b111 && bits(w, 25, 24) === 0b00 && bit(w, 21) === 0) { // unscaled / pre / post
    const size = bits(w, 31, 30), V = bit(w, 26), opc = bits(w, 23, 22), imm9 = sext(bits(w, 20, 12), 9), sel = bits(w, 11, 10), Rn = bits(w, 9, 5), Rt = bits(w, 4, 0);
    let mn = ldstName(size, opc, V);
    if (sel === 0) mn = mn.replace(/^ldr/, 'ldur').replace(/^str/, 'stur');
    const pre = sel === 3, post = sel === 1;
    const mem = post ? `[${X(Rn, 1, true)}], ${hex(imm9)}` : `[${X(Rn, 1, true)}, ${hex(imm9)}]${pre ? '!' : ''}`;
    return ok(mn, `${regT(Rt, size, V)}, ${mem}`);
  }
  if (bits(w, 29, 27) === 0b101 && bit(w, 26) === 0) { // load/store pair
    const opc = bits(w, 31, 30), L = bit(w, 22), imm7 = sext(bits(w, 21, 15), 7), Rt2 = bits(w, 14, 10), Rn = bits(w, 9, 5), Rt = bits(w, 4, 0), idx = bits(w, 25, 23);
    const sf = opc === 2, scale = sf ? 3 : 2, off = imm7 << scale;
    const mem = idx === 1 ? `[${X(Rn, 1, true)}], ${hex(off)}` : `[${X(Rn, 1, true)}${off ? ', ' + hex(off) : ''}]${idx === 3 ? '!' : ''}`;
    return ok(L ? 'ldp' : 'stp', `${X(Rt, sf, false)}, ${X(Rt2, sf, false)}, ${mem}`);
  }
  if (bits(w, 29, 27) === 0b011 && bits(w, 25, 24) === 0b00) { // load register literal
    const opc = bits(w, 31, 30), Rt = bits(w, 4, 0), imm19 = sext(bits(w, 23, 5), 19);
    return ok('ldr', `${X(Rt, opc !== 0, false)}, ${rrel(imm19 * 4)}`);
  }
  if (bits(w, 29, 27) === 0b111 && bits(w, 25, 24) === 0b00 && bit(w, 21) === 1) { // register offset
    const size = bits(w, 31, 30), V = bit(w, 26), opc = bits(w, 23, 22), Rm = bits(w, 20, 16), Rn = bits(w, 9, 5), Rt = bits(w, 4, 0);
    return ok(ldstName(size, opc, V), `${regT(Rt, size, V)}, [${X(Rn, 1, true)}, ${X(Rm, 1, false)}]`);
  }
  return coarse('ldst');
}

function dpReg(w) {
  const sf = bit(w, 31), b2824 = bits(w, 28, 24);
  if (b2824 === 0b01010) { // logical shifted register
    const opc = bits(w, 30, 29), shift = bits(w, 23, 22), N = bit(w, 21), Rm = bits(w, 20, 16), imm6 = bits(w, 15, 10), Rn = bits(w, 9, 5), Rd = bits(w, 4, 0);
    const mn = [['and', 'bic'], ['orr', 'orn'], ['eor', 'eon'], ['ands', 'bics']][opc][N];
    if (mn === 'orr' && Rn === 31 && imm6 === 0 && shift === 0) return ok('mov', `${X(Rd, sf, false)}, ${X(Rm, sf, false)}`);
    const sh = ['lsl', 'lsr', 'asr', 'ror'][shift];
    return ok(mn, `${X(Rd, sf, false)}, ${X(Rn, sf, false)}, ${X(Rm, sf, false)}${imm6 ? ', ' + sh + ' ' + imm6 : ''}`);
  }
  if (b2824 === 0b01011) {
    if (bit(w, 21) === 0) { // add/sub shifted register
      const op = bit(w, 30), S = bit(w, 29), shift = bits(w, 23, 22), Rm = bits(w, 20, 16), imm6 = bits(w, 15, 10), Rn = bits(w, 9, 5), Rd = bits(w, 4, 0);
      const sh = ['lsl', 'lsr', 'asr', '?'][shift];
      return ok((op ? 'sub' : 'add') + (S ? 's' : ''), `${X(Rd, sf, false)}, ${X(Rn, sf, false)}, ${X(Rm, sf, false)}${imm6 ? ', ' + sh + ' ' + imm6 : ''}`);
    }
    const op = bit(w, 30), S = bit(w, 29), Rm = bits(w, 20, 16), Rn = bits(w, 9, 5), Rd = bits(w, 4, 0); // add/sub extended register
    return ok((op ? 'sub' : 'add') + (S ? 's' : ''), `${X(Rd, sf, !S)}, ${X(Rn, sf, true)}, ${X(Rm, sf, false)}`);
  }
  if (b2824 === 0b11010) {
    if (bits(w, 28, 21) === 0b11010000) { const op = bit(w, 30), S = bit(w, 29), Rm = bits(w, 20, 16), Rn = bits(w, 9, 5), Rd = bits(w, 4, 0); return ok((op ? 'sbc' : 'adc') + (S ? 's' : ''), `${X(Rd, sf, false)}, ${X(Rn, sf, false)}, ${X(Rm, sf, false)}`); }
    if (bits(w, 28, 21) === 0b11010100) { const op2 = bits(w, 11, 10), Rm = bits(w, 20, 16), cond = bits(w, 15, 12), Rn = bits(w, 9, 5), Rd = bits(w, 4, 0), op = bit(w, 30); const mn = op ? (op2 & 1 ? 'csneg' : 'csinv') : (op2 & 1 ? 'csinc' : 'csel'); return ok(mn, `${X(Rd, sf, false)}, ${X(Rn, sf, false)}, ${X(Rm, sf, false)}, ${CONDS[cond]}`); }
    if (bits(w, 28, 21) === 0b11010010) return ok(bit(w, 30) ? 'ccmp' : 'ccmn', '...');
    if (bits(w, 28, 21) === 0b11010110) {
      if (bit(w, 30) === 0) { const Rm = bits(w, 20, 16), opc = bits(w, 15, 10), Rn = bits(w, 9, 5), Rd = bits(w, 4, 0); const map = { 2: 'udiv', 3: 'sdiv', 8: 'lslv', 9: 'lsrv', 10: 'asrv', 11: 'rorv' }[opc]; if (map) return ok(map, `${X(Rd, sf, false)}, ${X(Rn, sf, false)}, ${X(Rm, sf, false)}`); return coarse('dp2'); }
      const opc = bits(w, 15, 10), Rn = bits(w, 9, 5), Rd = bits(w, 4, 0); const m1 = { 0: 'rbit', 1: 'rev16', 2: 'rev', 4: 'clz', 5: 'cls' }[opc]; if (m1) return ok(m1, `${X(Rd, sf, false)}, ${X(Rn, sf, false)}`); return coarse('dp1');
    }
    return coarse('dp-reg');
  }
  if (b2824 === 0b11011) { // 3-source
    const op31 = bits(w, 23, 21), Rm = bits(w, 20, 16), o0 = bit(w, 15), Ra = bits(w, 14, 10), Rn = bits(w, 9, 5), Rd = bits(w, 4, 0);
    if (op31 === 0) { if (Ra === 31 && o0 === 0) return ok('mul', `${X(Rd, sf, false)}, ${X(Rn, sf, false)}, ${X(Rm, sf, false)}`); return ok(o0 ? 'msub' : 'madd', `${X(Rd, sf, false)}, ${X(Rn, sf, false)}, ${X(Rm, sf, false)}, ${X(Ra, sf, false)}`); }
    return coarse('dp3');
  }
  return coarse('dp-reg');
}

/** Decode one 32-bit word. Always 4 bytes. */
function decodeOne(w) {
  const op1 = bits(w, 28, 25);
  if ((op1 & 0b1110) === 0b1000) return dpImm(w);
  if ((op1 & 0b1110) === 0b1010) return branchSys(w);
  if ((op1 & 0b0101) === 0b0100) return loadStore(w);
  if ((op1 & 0b0111) === 0b0101) return dpReg(w);
  if ((op1 & 0b0111) === 0b0111) return coarse('fp/simd');
  return bad(w);
}

/** Sweep a byte range as 4-byte words. Coverage: decoded (named), coarse (group only), unknown. */
function disasm(buf, start, end, base, limit) {
  const out = []; let pos = start - (start % 4), decoded = 0, coarseN = 0, unknown = 0;
  base = base || 0; limit = limit || 1e9;
  while (pos + 4 <= end && out.length < limit) {
    const w = buf.readUInt32LE(pos);
    const d = decodeOne(w);
    out.push({ addr: base + (pos - start), bytes: 4, text: d.text, mnem: d.mnem, bad: !!d.bad, coarse: !!d.coarse });
    if (d.bad) unknown += 1; else if (d.coarse) coarseN += 1; else decoded += 1;
    pos += 4;
  }
  const total = decoded + coarseN + unknown;
  return { instructions: out, decoded, coarse: coarseN, unknown, total, allocated: total ? Math.round(((decoded + coarseN) / total) * 100) : null, named: total ? Math.round((decoded / total) * 100) : null };
}

export { decodeOne, disasm };
