/**
 * ATLAS — an x86-64 instruction decoder, built from the specification (Intel 64 and IA-32
 * Software Developer's Manual, Vol. 2; AMD64 Vol. 3), not from any tool's source. It reads
 * the bytes of an instruction the way the processor's front end does — legacy prefixes, the
 * REX byte, the one/two/three-byte opcode maps, ModR/M, SIB, displacement, immediate — and
 * reports the mnemonic, a readable operand string, and the exact length. Length is the
 * load-bearing fact: get it wrong by one byte and every instruction after desyncs, so the
 * table below encodes, per opcode, whether a ModR/M byte follows and how large the
 * immediate is. Nothing is executed.
 */

// 64-bit register names by size. Index 0..15.
const R64 = ['rax', 'rcx', 'rdx', 'rbx', 'rsp', 'rbp', 'rsi', 'rdi', 'r8', 'r9', 'r10', 'r11', 'r12', 'r13', 'r14', 'r15'];
const R32 = ['eax', 'ecx', 'edx', 'ebx', 'esp', 'ebp', 'esi', 'edi', 'r8d', 'r9d', 'r10d', 'r11d', 'r12d', 'r13d', 'r14d', 'r15d'];
const R16 = ['ax', 'cx', 'dx', 'bx', 'sp', 'bp', 'si', 'di', 'r8w', 'r9w', 'r10w', 'r11w', 'r12w', 'r13w', 'r14w', 'r15w'];
const R8 = ['al', 'cl', 'dl', 'bl', 'spl', 'bpl', 'sil', 'dil', 'r8b', 'r9b', 'r10b', 'r11b', 'r12b', 'r13b', 'r14b', 'r15b'];
const R8L = ['al', 'cl', 'dl', 'bl', 'ah', 'ch', 'dh', 'bh']; // without a REX prefix
const XMM = Array.from({ length: 16 }, (_, i) => `xmm${i}`);

// immediate-size codes used in the tables
// 'b'=1, 'w'=2, 'z'=word/dword by opsize, 'v'=word/dword/qword by opsize+rexW, 'o'=addr-size moffs, '3'=enter (iw+ib)
// flags: M=has ModR/M

// one-byte opcode map: code -> { m, M?, i? } or a marker { x: 'prefix'|'rex'|'twobyte'|'g1'|'g2'|'g3'|'g4'|'g5'|'x87'|'moffs'|'enter'|'bad' }
const OP = new Array(256).fill(null);
const put = (c, m, M, i) => { OP[c] = { m, M: !!M, i: i || null }; };
const arith = (base, name) => { put(base, name, true); put(base + 1, name, true); put(base + 2, name, true); put(base + 3, name, true); put(base + 4, name, false, 'b'); put(base + 5, name, false, 'z'); };
arith(0x00, 'add'); arith(0x08, 'or'); arith(0x10, 'adc'); arith(0x18, 'sbb'); arith(0x20, 'and'); arith(0x28, 'sub'); arith(0x30, 'xor'); arith(0x38, 'cmp');
for (const c of [0x26, 0x2e, 0x36, 0x3e, 0x64, 0x65, 0x66, 0x67, 0xf0, 0xf2, 0xf3]) OP[c] = { x: 'prefix' };
for (let c = 0x40; c <= 0x4f; c += 1) OP[c] = { x: 'rex' };
OP[0x0f] = { x: 'twobyte' };
for (let c = 0x50; c <= 0x57; c += 1) put(c, 'push');
for (let c = 0x58; c <= 0x5f; c += 1) put(c, 'pop');
OP[0x63] = { m: 'movsxd', M: true };
put(0x68, 'push', false, 'z'); OP[0x69] = { m: 'imul', M: true, i: 'z' }; put(0x6a, 'push', false, 'b'); OP[0x6b] = { m: 'imul', M: true, i: 'b' };
put(0x6c, 'insb'); put(0x6d, 'insd'); put(0x6e, 'outsb'); put(0x6f, 'outsd');
const JCC = ['o', 'no', 'b', 'ae', 'e', 'ne', 'be', 'a', 's', 'ns', 'p', 'np', 'l', 'ge', 'le', 'g'];
for (let c = 0x70; c <= 0x7f; c += 1) put(c, 'j' + JCC[c - 0x70], false, 'b');
OP[0x80] = { x: 'g1', b: true }; OP[0x81] = { x: 'g1', i: 'z' }; OP[0x83] = { x: 'g1', i: 'b' };
put(0x84, 'test', true); put(0x85, 'test', true); put(0x86, 'xchg', true); put(0x87, 'xchg', true);
put(0x88, 'mov', true); put(0x89, 'mov', true); put(0x8a, 'mov', true); put(0x8b, 'mov', true);
put(0x8c, 'mov', true); OP[0x8d] = { m: 'lea', M: true }; put(0x8e, 'mov', true); OP[0x8f] = { x: 'g1pop' };
put(0x90, 'nop'); for (let c = 0x91; c <= 0x97; c += 1) put(c, 'xchg');
put(0x98, 'cdqe'); put(0x99, 'cqo'); put(0x9b, 'wait'); put(0x9c, 'pushfq'); put(0x9d, 'popfq'); put(0x9e, 'sahf'); put(0x9f, 'lahf');
OP[0xa0] = { m: 'mov', x: 'moffs' }; OP[0xa1] = { m: 'mov', x: 'moffs' }; OP[0xa2] = { m: 'mov', x: 'moffs' }; OP[0xa3] = { m: 'mov', x: 'moffs' };
put(0xa4, 'movsb'); put(0xa5, 'movsd'); put(0xa6, 'cmpsb'); put(0xa7, 'cmpsd'); put(0xa8, 'test', false, 'b'); put(0xa9, 'test', false, 'z');
put(0xaa, 'stosb'); put(0xab, 'stosd'); put(0xac, 'lodsb'); put(0xad, 'lodsd'); put(0xae, 'scasb'); put(0xaf, 'scasd');
for (let c = 0xb0; c <= 0xb7; c += 1) put(c, 'mov', false, 'b');
for (let c = 0xb8; c <= 0xbf; c += 1) put(c, 'mov', false, 'v');
OP[0xc0] = { x: 'g2', i: 'b' }; OP[0xc1] = { x: 'g2', i: 'b' }; put(0xc2, 'ret', false, 'w'); put(0xc3, 'ret');
OP[0xc6] = { x: 'g11', i: 'b' }; OP[0xc7] = { x: 'g11', i: 'z' }; OP[0xc8] = { m: 'enter', x: 'enter' }; put(0xc9, 'leave'); put(0xca, 'retf', false, 'w'); put(0xcb, 'retf');
put(0xcc, 'int3'); put(0xcd, 'int', false, 'b'); put(0xce, 'into'); put(0xcf, 'iretq');
OP[0xd0] = { x: 'g2' }; OP[0xd1] = { x: 'g2' }; OP[0xd2] = { x: 'g2' }; OP[0xd3] = { x: 'g2' }; put(0xd7, 'xlat');
for (let c = 0xd8; c <= 0xdf; c += 1) OP[c] = { m: 'fpu', M: true }; // x87 escape, ModR/M, no immediate
put(0xe0, 'loopne', false, 'b'); put(0xe1, 'loope', false, 'b'); put(0xe2, 'loop', false, 'b'); put(0xe3, 'jrcxz', false, 'b');
put(0xe4, 'in', false, 'b'); put(0xe5, 'in', false, 'b'); put(0xe6, 'out', false, 'b'); put(0xe7, 'out', false, 'b');
put(0xe8, 'call', false, 'z'); put(0xe9, 'jmp', false, 'z'); put(0xeb, 'jmp', false, 'b'); put(0xec, 'in'); put(0xed, 'in'); put(0xee, 'out'); put(0xef, 'out');
put(0xf1, 'int1'); put(0xf4, 'hlt'); put(0xf5, 'cmc'); OP[0xf6] = { x: 'g3', w: 1 }; OP[0xf7] = { x: 'g3' };
put(0xf8, 'clc'); put(0xf9, 'stc'); put(0xfa, 'cli'); put(0xfb, 'sti'); put(0xfc, 'cld'); put(0xfd, 'std'); OP[0xfe] = { x: 'g4' }; OP[0xff] = { x: 'g5' };

// two-byte map (0F xx)
const OF = new Array(256).fill(null);
const putf = (c, m, M, i) => { OF[c] = { m, M: !!M, i: i || null }; };
OF[0x00] = { m: 'grp6', M: true }; OF[0x01] = { m: 'grp7', M: true }; putf(0x05, 'syscall'); putf(0x0b, 'ud2'); putf(0x0d, 'prefetch', true);
putf(0x10, 'movups', true); putf(0x11, 'movups', true); putf(0x12, 'movlps', true); putf(0x13, 'movlps', true); putf(0x14, 'unpcklps', true); putf(0x15, 'unpckhps', true); putf(0x16, 'movhps', true); putf(0x17, 'movhps', true);
for (let c = 0x18; c <= 0x1f; c += 1) putf(c, 'nop', true); // hint/nop Ev
putf(0x28, 'movaps', true); putf(0x29, 'movaps', true); putf(0x2a, 'cvtsi2ss', true); putf(0x2b, 'movntps', true); putf(0x2c, 'cvttss2si', true); putf(0x2d, 'cvtss2si', true); putf(0x2e, 'ucomiss', true); putf(0x2f, 'comiss', true);
putf(0x31, 'rdtsc'); putf(0x34, 'sysenter'); putf(0x37, 'getsec');
for (let c = 0x40; c <= 0x4f; c += 1) putf(c, 'cmov' + JCC[c - 0x40], true);
putf(0x50, 'movmskps', true);
const SSE = { 0x51: 'sqrtps', 0x52: 'rsqrtps', 0x53: 'rcpps', 0x54: 'andps', 0x55: 'andnps', 0x56: 'orps', 0x57: 'xorps', 0x58: 'addps', 0x59: 'mulps', 0x5a: 'cvtps2pd', 0x5b: 'cvtdq2ps', 0x5c: 'subps', 0x5d: 'minps', 0x5e: 'divps', 0x5f: 'maxps' };
for (const c in SSE) putf(Number(c), SSE[c], true);
for (let c = 0x60; c <= 0x6f; c += 1) putf(c, 'mmx', true); for (let c = 0x74; c <= 0x76; c += 1) putf(c, 'pcmpeq', true); putf(0x77, 'emms');
putf(0x70, 'pshuf', true, 'b'); putf(0x71, 'psxx', true, 'b'); putf(0x72, 'psxx', true, 'b'); putf(0x73, 'psxx', true, 'b'); putf(0x7e, 'movd', true); putf(0x7f, 'movq', true);
for (let c = 0x80; c <= 0x8f; c += 1) putf(c, 'j' + JCC[c - 0x80], false, 'z');
for (let c = 0x90; c <= 0x9f; c += 1) putf(c, 'set' + JCC[c - 0x90], true);
putf(0xa2, 'cpuid'); putf(0xa3, 'bt', true); putf(0xa4, 'shld', true, 'b'); putf(0xa5, 'shld', true); putf(0xab, 'bts', true); putf(0xac, 'shrd', true, 'b'); putf(0xad, 'shrd', true); putf(0xae, 'grp15', true); putf(0xaf, 'imul', true);
putf(0xb0, 'cmpxchg', true); putf(0xb1, 'cmpxchg', true); putf(0xb3, 'btr', true); putf(0xb6, 'movzx', true); putf(0xb7, 'movzx', true); putf(0xb8, 'popcnt', true); putf(0xba, 'grp8', true, 'b'); putf(0xbb, 'btc', true); putf(0xbc, 'bsf', true); putf(0xbd, 'bsr', true); putf(0xbe, 'movsx', true); putf(0xbf, 'movsx', true);
putf(0xc0, 'xadd', true); putf(0xc1, 'xadd', true); putf(0xc2, 'cmpps', true, 'b'); putf(0xc3, 'movnti', true); putf(0xc4, 'pinsrw', true, 'b'); putf(0xc5, 'pextrw', true, 'b'); putf(0xc6, 'shufps', true, 'b'); putf(0xc7, 'grp9', true);
for (let c = 0xc8; c <= 0xcf; c += 1) putf(c, 'bswap');
for (let c = 0xd0; c <= 0xff; c += 1) putf(c, 'sse2', true); // SSE2/SSE3 packed: ModR/M, no immediate

// SSE/SSE2/SSE3 two-byte opcode -> mnemonic by mandatory prefix [none, 0x66, 0xF3, 0xF2].
// The decoder picks the real name from the prefix; without this a prefix-free name (e.g.
// addps for 0x58) would be wrong under 66/F3/F2 (addpd/addss/addsd) and the lifter could not
// tell a packed op from a scalar one. From the Intel SDM opcode tables.
const S2 = {
  0x10: ['movups', 'movupd', 'movss', 'movsd'], 0x11: ['movups', 'movupd', 'movss', 'movsd'],
  0x12: ['movlps', 'movlpd', 'movsldup', 'movddup'], 0x13: ['movlps', 'movlpd'],
  0x14: ['unpcklps', 'unpcklpd'], 0x15: ['unpckhps', 'unpckhpd'],
  0x16: ['movhps', 'movhpd', 'movshdup'], 0x17: ['movhps', 'movhpd'],
  0x28: ['movaps', 'movapd'], 0x29: ['movaps', 'movapd'],
  0x2a: ['cvtpi2ps', 'cvtpi2pd', 'cvtsi2ss', 'cvtsi2sd'], 0x2b: ['movntps', 'movntpd'],
  0x2c: ['cvttps2pi', 'cvttpd2pi', 'cvttss2si', 'cvttsd2si'], 0x2d: ['cvtps2pi', 'cvtpd2pi', 'cvtss2si', 'cvtsd2si'],
  0x2e: ['ucomiss', 'ucomisd'], 0x2f: ['comiss', 'comisd'],
  0x50: ['movmskps', 'movmskpd'],
  0x51: ['sqrtps', 'sqrtpd', 'sqrtss', 'sqrtsd'], 0x52: ['rsqrtps', null, 'rsqrtss'], 0x53: ['rcpps', null, 'rcpss'],
  0x54: ['andps', 'andpd'], 0x55: ['andnps', 'andnpd'], 0x56: ['orps', 'orpd'], 0x57: ['xorps', 'xorpd'],
  0x58: ['addps', 'addpd', 'addss', 'addsd'], 0x59: ['mulps', 'mulpd', 'mulss', 'mulsd'],
  0x5a: ['cvtps2pd', 'cvtpd2ps', 'cvtss2sd', 'cvtsd2ss'], 0x5b: ['cvtdq2ps', 'cvtps2dq', 'cvttps2dq'],
  0x5c: ['subps', 'subpd', 'subss', 'subsd'], 0x5d: ['minps', 'minpd', 'minss', 'minsd'],
  0x5e: ['divps', 'divpd', 'divss', 'divsd'], 0x5f: ['maxps', 'maxpd', 'maxss', 'maxsd'],
  0x60: ['punpcklbw', 'punpcklbw'], 0x61: ['punpcklwd', 'punpcklwd'], 0x62: ['punpckldq', 'punpckldq'],
  0x63: ['packsswb', 'packsswb'], 0x64: ['pcmpgtb', 'pcmpgtb'], 0x65: ['pcmpgtw', 'pcmpgtw'], 0x66: ['pcmpgtd', 'pcmpgtd'],
  0x67: ['packuswb', 'packuswb'], 0x68: ['punpckhbw', 'punpckhbw'], 0x69: ['punpckhwd', 'punpckhwd'], 0x6a: ['punpckhdq', 'punpckhdq'],
  0x6b: ['packssdw', 'packssdw'], 0x6c: [null, 'punpcklqdq'], 0x6d: [null, 'punpckhqdq'],
  0x6e: ['movd', 'movd'], 0x6f: ['movq', 'movdqa', 'movdqu'],
  0x70: ['pshufw', 'pshufd', 'pshufhw', 'pshuflw'], 0x71: ['psllw'], 0x72: ['pslld'], 0x73: ['psllq'],
  0x74: ['pcmpeqb', 'pcmpeqb'], 0x75: ['pcmpeqw', 'pcmpeqw'], 0x76: ['pcmpeqd', 'pcmpeqd'],
  0x7c: [null, 'haddpd', null, 'haddps'], 0x7d: [null, 'hsubpd', null, 'hsubps'],
  0x7e: ['movd', 'movd', 'movq'], 0x7f: ['movq', 'movdqa', 'movdqu'],
  0xc2: ['cmpps', 'cmppd', 'cmpss', 'cmpsd'], 0xc4: ['pinsrw', 'pinsrw'], 0xc5: ['pextrw', 'pextrw'], 0xc6: ['shufps', 'shufpd'],
  0xd0: [null, 'addsubpd', null, 'addsubps'], 0xd1: ['psrlw', 'psrlw'], 0xd2: ['psrld', 'psrld'], 0xd3: ['psrlq', 'psrlq'],
  0xd4: ['paddq', 'paddq'], 0xd5: ['pmullw', 'pmullw'], 0xd6: [null, 'movq'], 0xd7: ['pmovmskb', 'pmovmskb'],
  0xd8: ['psubusb', 'psubusb'], 0xd9: ['psubusw', 'psubusw'], 0xda: ['pminub', 'pminub'], 0xdb: ['pand', 'pand'],
  0xdc: ['paddusb', 'paddusb'], 0xdd: ['paddusw', 'paddusw'], 0xde: ['pmaxub', 'pmaxub'], 0xdf: ['pandn', 'pandn'],
  0xe0: ['pavgb', 'pavgb'], 0xe1: ['psraw', 'psraw'], 0xe2: ['psrad', 'psrad'], 0xe3: ['pavgw', 'pavgw'],
  0xe4: ['pmulhuw', 'pmulhuw'], 0xe5: ['pmulhw', 'pmulhw'], 0xe6: [null, 'cvttpd2dq', 'cvtdq2pd', 'cvtpd2dq'], 0xe7: [null, 'movntdq'],
  0xe8: ['psubsb', 'psubsb'], 0xe9: ['psubsw', 'psubsw'], 0xea: ['pminsw', 'pminsw'], 0xeb: ['por', 'por'],
  0xec: ['paddsb', 'paddsb'], 0xed: ['paddsw', 'paddsw'], 0xee: ['pmaxsw', 'pmaxsw'], 0xef: ['pxor', 'pxor'],
  0xf0: [null, null, null, 'lddqu'], 0xf1: ['psllw', 'psllw'], 0xf2: ['pslld', 'pslld'], 0xf3: ['psllq', 'psllq'],
  0xf4: ['pmuludq', 'pmuludq'], 0xf5: ['pmaddwd', 'pmaddwd'], 0xf6: ['psadbw', 'psadbw'], 0xf7: ['maskmovq', 'maskmovdqu'],
  0xf8: ['psubb', 'psubb'], 0xf9: ['psubw', 'psubw'], 0xfa: ['psubd', 'psubd'], 0xfb: ['psubq', 'psubq'],
  0xfc: ['paddb', 'paddb'], 0xfd: ['paddw', 'paddw'], 0xfe: ['paddd', 'paddd'],
};
// name an SSE two-byte opcode from the mandatory prefix (0=none,1=66,2=F3,3=F2) and, for the
// shift groups 71/72/73, the ModR/M reg field (opcode extension)
function sseName(op, pfx, reg) {
  const e = S2[op]; if (!e) return null;
  if (op === 0x71) return ['', '', 'psrlw', '', 'psraw', '', 'psllw', ''][reg] || null;
  if (op === 0x72) return ['', '', 'psrld', '', 'psrad', '', 'pslld', ''][reg] || null;
  if (op === 0x73) return ['', '', 'psrlq', 'psrldq', '', '', 'psllq', 'pslldq'][reg] || null;
  return e[pfx] || e[0] || null;
}

// group mnemonics by the ModR/M reg field
const G1 = ['add', 'or', 'adc', 'sbb', 'and', 'sub', 'xor', 'cmp'];
const G2 = ['rol', 'ror', 'rcl', 'rcr', 'shl', 'shr', 'sal', 'sar'];
const G3 = ['test', 'test', 'not', 'neg', 'mul', 'imul', 'div', 'idiv'];
const G5 = ['inc', 'dec', 'call', 'callf', 'jmp', 'jmpf', 'push', '?'];

const hex = (n) => (n < 0 ? '-0x' + (-n).toString(16) : '0x' + n.toString(16));

/** Decode one instruction at `pos`. Returns { len, text, mnem, bad }. Never throws. */
function decodeOne(buf, pos, end) {
  const start = pos;
  let p66 = false, p67 = false, repPrefix = null, seg = null, rex = 0, hasRex = false;
  // prefixes
  for (; pos < end; pos += 1) {
    const b = buf[pos];
    if (b === 0x66) p66 = true;
    else if (b === 0x67) p67 = true;
    else if (b === 0xf0) repPrefix = 'lock';
    else if (b === 0xf2) repPrefix = 'repne';
    else if (b === 0xf3) repPrefix = 'rep';
    else if (b === 0x2e || b === 0x36 || b === 0x3e || b === 0x26 || b === 0x64 || b === 0x65) seg = b;
    else break;
  }
  if (pos >= end) return { len: pos - start || 1, bad: true, text: '(truncated)' };
  if (buf[pos] >= 0x40 && buf[pos] <= 0x4f) { rex = buf[pos]; hasRex = true; pos += 1; }
  if (pos >= end) return { len: pos - start, bad: true, text: '(truncated)' };
  const W = (rex >> 3) & 1, Rx = (rex >> 2) & 1, Xx = (rex >> 1) & 1, Bx = rex & 1;
  const opsize = W ? 8 : (p66 ? 2 : 4);
  let twobyte = false;
  let op = buf[pos]; pos += 1;
  let ent;
  if (op === 0x0f) {
    twobyte = true;
    if (pos >= end) return { len: pos - start, bad: true, text: '0f (truncated)' };
    op = buf[pos]; pos += 1;
    if (op === 0x38 || op === 0x3a) { // three-byte: ModR/M always, 3A has an ib
      const ib = op === 0x3a;
      if (pos >= end) return { len: pos - start, bad: true, text: '0f38 (truncated)' };
      const op3 = buf[pos]; pos += 1;
      const mr = decodeModRM(buf, pos, end, { W, Rx, Xx, Bx, hasRex, opsize, p67, xmm: true });
      if (mr.bad) return { len: pos - start, bad: true, text: `0f${op.toString(16)} ${op3.toString(16)} (bad modrm)` };
      pos = mr.pos + (ib ? 1 : 0);
      if (pos > end) return { len: end - start, bad: true, text: 'truncated imm' };
      return fin(start, pos, `0f${op.toString(16)}_${op3.toString(16).padStart(2, "0")}`, `${mr.reg_s}, ${mr.rm}`, repPrefix, seg);
    }
    ent = OF[op];
  } else ent = OP[op];
  if (!ent) return { len: pos - start, bad: true, text: `(unknown ${twobyte ? '0f' : ''}${op.toString(16).padStart(2, '0')})` };

  // groups: the mnemonic comes from the ModR/M reg field; immediate may depend on it
  let mnem = ent.m, grpImm = ent.i;
  const marker = ent.x;
  // opcodes with no ModR/M and no special memory operand
  if (!ent.M && !marker && !(ent.x === 'moffs')) {
    const immLen = immSize(ent.i, opsize, p66, W, p67);
    if (pos + immLen > end) return { len: end - start, bad: true, text: 'truncated imm' };
    let text = mnem;
    if (op >= 0x50 && op <= 0x5f) text = `${mnem} ${R64[(op & 7) | (Bx << 3)]}`;
    else if (op >= 0xb8 && op <= 0xbf) { const imm = readImm(buf, pos, immLen); text = `mov ${regName(opsize, (op & 7) | (Bx << 3), hasRex)}, ${hex(imm)}`; }
    else if (op >= 0xb0 && op <= 0xb7) { const imm = readImm(buf, pos, immLen); text = `mov ${regName(1, (op & 7) | (Bx << 3), hasRex)}, ${hex(imm)}`; }
    else if (ent.i === 'b' && /^j/.test(mnem)) { const rel = readImmS(buf, pos, 1); text = `${mnem} ${hex((pos + 1 - start) + rel)}`; }
    else if (ent.i === 'z' && (mnem === 'jmp' || mnem === 'call')) { const rel = readImmS(buf, pos, immLen); text = `${mnem} ${hex((pos + immLen - start) + rel)}`; }
    else if (immLen) text = `${mnem} ${hex(readImm(buf, pos, immLen))}`;
    pos += immLen;
    return fin(start, pos, mnem, text.slice(mnem.length).trim(), repPrefix, seg);
  }
  if (ent.x === 'moffs') { const alen = p67 ? 4 : 8; if (pos + alen > end) return { len: end - start, bad: true, text: 'truncated' }; pos += alen; return fin(start, pos, 'mov', '[moffs]', repPrefix, seg); }
  if (ent.x === 'enter') { if (pos + 3 > end) return { len: end - start, bad: true, text: 'truncated' }; pos += 3; return fin(start, pos, 'enter', '', repPrefix, seg); }

  // everything else has a ModR/M. Only the SSE/MMX subset of the two-byte map names its
  // operands as XMM; movzx/movsx/cmov/bt/setcc/imul and the rest use general registers.
  const xmmOp = twobyte && ((op >= 0x10 && op <= 0x17) || (op >= 0x28 && op <= 0x2f) || op === 0x50 || (op >= 0x51 && op <= 0x6f) || (op >= 0x70 && op <= 0x7f) || op === 0xc2 || (op >= 0xc4 && op <= 0xc6) || (op >= 0xd0 && op <= 0xff));
  let rmSize = opsize;
  if (twobyte && (op === 0xb6 || op === 0xbe)) rmSize = 1; // movzx/movsx from byte
  if (twobyte && (op === 0xb7 || op === 0xbf)) rmSize = 2; // movzx/movsx from word
  // mixed GP/xmm SSE ops: one operand is a general register, not an xmm
  let xmmReg = xmmOp, xmmRm = xmmOp;
  if (xmmOp) {
    if (op === 0x2a || op === 0x6e || op === 0xc4) xmmRm = false; // cvtsi2ss/sd, movd xmm<-r/m, pinsrw: rm is GP/mem
    else if (op === 0x2c || op === 0x2d || op === 0x50 || op === 0xc5 || op === 0xd7) xmmReg = false; // cvt*2si, movmsk*, pextrw, pmovmskb: reg is GP
    else if (op === 0x7e && repPrefix !== 'rep') xmmRm = false; // 66 movd/movq store: rm GP (F3 movq is xmm<-xmm)
  }
  // for an SSE op the 0x66 is a mandatory prefix, not an operand-size override: a GP operand
  // stays 32-bit (or 64-bit under REX.W), never 16-bit
  const gpSize = xmmOp ? (W ? 8 : 4) : opsize;
  const mr = decodeModRM(buf, pos, end, { W, Rx, Xx, Bx, hasRex, opsize: gpSize, rmSize: xmmOp ? gpSize : rmSize, p67, xmm: xmmOp, xmmReg, xmmRm });
  if (mr.bad) return { len: pos - start, bad: true, text: `${mnem || marker} (bad modrm)` };
  const reg = mr.reg;
  // prefix-aware SSE naming: pick the real mnemonic from the mandatory prefix and, for the
  // shift groups, the reg field; the F2/F3 here is a mandatory prefix, not a rep, so drop it
  if (xmmOp) {
    const pfx = p66 ? 1 : (repPrefix === 'rep' ? 2 : (repPrefix === 'repne' ? 3 : 0));
    const nm = sseName(op, pfx, reg);
    if (nm) { mnem = nm; if (repPrefix === 'rep' || repPrefix === 'repne') repPrefix = null; }
  }
  let group = true;
  if (marker === 'g1') { mnem = G1[reg]; }
  else if (marker === 'g1pop') { mnem = 'pop'; }
  else if (marker === 'g2') { mnem = G2[reg]; }
  else if (marker === 'g3') { mnem = G3[reg]; grpImm = (reg <= 1) ? (ent.w ? 'b' : 'z') : null; }
  else if (marker === 'g4') { mnem = reg === 0 ? 'inc' : 'dec'; }
  else if (marker === 'g5') { mnem = G5[reg]; }
  else if (marker === 'g11') { mnem = 'mov'; }
  else group = false;
  pos = mr.pos;
  let immLen = immSize(grpImm, opsize, p66, W, p67);
  if (pos + immLen > end) return { len: end - start, bad: true, text: 'truncated imm' };
  // operands: a group opcode's reg field is an extension, not a register, so only r/m shows;
  // otherwise the direction bit (one-byte) or the family (two-byte) picks the order
  let opstr;
  if (group) opstr = mr.rm;
  else if (mnem === 'nop' || /^set/.test(mnem) || /^(dec|inc|not|neg|bswap|push|pop|call|jmp)$/.test(mnem)) opstr = mr.rm;
  else if (twobyte && (op === 0x71 || op === 0x72 || op === 0x73)) opstr = mr.rm; // shift-by-imm group: reg field is the opcode extension
  else {
    let regFirst = twobyte || op === 0x8d || op === 0x63 || op === 0x69 || op === 0x6b || (op & 0x02) === 0x02;
    if (twobyte && (op === 0xa3 || op === 0xab || op === 0xb3 || op === 0xbb || op === 0x7e || op === 0x7f || op === 0xd6 || op === 0x11 || op === 0x13 || op === 0x17 || op === 0x29)) regFirst = false; // store/bit forms: r/m, reg
    opstr = regFirst ? `${mr.reg_s}, ${mr.rm}` : `${mr.rm}, ${mr.reg_s}`;
  }
  if (immLen) { opstr += ', ' + hex(readImm(buf, pos, immLen)); pos += immLen; }
  return fin(start, pos, mnem, opstr, repPrefix, seg);
}

function fin(start, pos, mnem, operands, rep, seg) {
  const pre = (rep ? rep + ' ' : '');
  return { len: pos - start, mnem, text: (pre + mnem + (operands ? ' ' + operands : '')).trim(), bad: false };
}

function regName(size, idx, hasRex) {
  if (size === 1) return hasRex ? R8[idx] : (idx < 8 ? R8L[idx] : R8[idx]);
  if (size === 2) return R16[idx];
  if (size === 8) return R64[idx];
  return R32[idx];
}

/** Decode the ModR/M byte (and SIB, displacement). Returns { pos, reg, text, bad }. */
function decodeModRM(buf, pos, end, cx) {
  if (pos >= end) return { bad: true };
  const modrm = buf[pos]; pos += 1;
  const mod = modrm >> 6, regf = ((modrm >> 3) & 7) | (cx.Rx << 3), rm = modrm & 7;
  const xmmReg = cx.xmmReg !== undefined ? cx.xmmReg : cx.xmm;
  const xmmRm = cx.xmmRm !== undefined ? cx.xmmRm : cx.xmm;
  const regStr = xmmReg ? XMM[regf] : regName(cx.opsize, regf, cx.hasRex);
  if (mod === 3) { const r = xmmRm ? XMM[rm | (cx.Bx << 3)] : regName(cx.rmSize || cx.opsize, rm | (cx.Bx << 3), cx.hasRex); return { pos, reg: (modrm >> 3) & 7, rm: r, reg_s: regStr }; }
  // memory operand
  let baseReg = null, indexReg = null, scale = 1, dispSize = 0, rip = false;
  if (rm === 4) { // SIB
    if (pos >= end) return { bad: true };
    const sib = buf[pos]; pos += 1;
    scale = 1 << (sib >> 6);
    const idx = ((sib >> 3) & 7) | (cx.Xx << 3);
    const base = (sib & 7) | (cx.Bx << 3);
    if (idx !== 4) indexReg = R64[idx]; // index 4 (no REX.X) means none
    if ((sib & 7) === 5 && mod === 0) { dispSize = 4; baseReg = null; } else baseReg = R64[base];
    if (mod === 1) dispSize = 1; else if (mod === 2) dispSize = 4;
  } else if (mod === 0 && rm === 5) { rip = true; dispSize = 4; }
  else { baseReg = R64[rm | (cx.Bx << 3)]; if (mod === 1) dispSize = 1; else if (mod === 2) dispSize = 4; }
  let disp = 0;
  if (dispSize) { if (pos + dispSize > end) return { bad: true }; disp = dispSize === 1 ? readImmS(buf, pos, 1) : readImmS(buf, pos, 4); pos += dispSize; }
  let inner;
  if (rip) inner = `rip${disp >= 0 ? '+' : ''}${hex(disp)}`;
  else { const parts = []; if (baseReg) parts.push(baseReg); if (indexReg) parts.push(`${indexReg}*${scale}`); if (disp || !parts.length) parts.push(hex(disp)); inner = parts.join('+').replace('+-', '-'); }
  return { pos, reg: (modrm >> 3) & 7, rm: `[${inner}]`, reg_s: regStr };
}

function immSize(code, opsize, p66, W, p67) {
  if (!code) return 0;
  if (code === 'b') return 1; if (code === 'w') return 2;
  if (code === 'z') return p66 ? 2 : 4;
  if (code === 'v') return W ? 8 : (p66 ? 2 : 4);
  return 0;
}
function readImm(buf, pos, len) { let v = 0; for (let i = 0; i < len; i += 1) v += buf[pos + i] * 2 ** (8 * i); return len >= 6 ? v : v >>> 0; }
function readImmS(buf, pos, len) { if (len === 1) return (buf[pos] << 24) >> 24; if (len === 2) return (buf.readInt16LE(pos)); if (len === 4) return buf.readInt32LE(pos); return readImm(buf, pos, len); }

/**
 * Linear sweep over a byte range. Returns instructions and a coverage summary: how many
 * decoded, how many bad, and the resync count (after a bad byte the sweep advances one byte
 * and tries again — x86 is variable length, so a bad byte can briefly desync the stream).
 */
function disasm(buf, start, end, base, limit) {
  const out = []; let pos = start, bad = 0, good = 0;
  base = base || 0; limit = limit || 1e9;
  while (pos < end && out.length < limit) {
    const d = decodeOne(buf, pos, end);
    const len = Math.max(1, d.len || 1);
    out.push({ addr: base + (pos - start), bytes: len, text: d.bad ? d.text : d.text, mnem: d.mnem || null, bad: !!d.bad });
    if (d.bad) { bad += 1; pos += 1; } else { good += 1; pos += len; }
  }
  return { instructions: out, good, bad, total: good + bad, coverage: good + bad ? Math.round((good / (good + bad)) * 100) : null };
}

export { decodeOne, disasm };
