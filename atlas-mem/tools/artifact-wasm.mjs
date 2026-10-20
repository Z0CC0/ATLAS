/**
 * ATLAS — WebAssembly reader, disassembler and pseudocode lifter. Our own, from the W3C
 * WebAssembly core specification (the binary format and the instruction list), not from any
 * tool. A module is a magic, a version and a sequence of sections (type, import, function,
 * table, memory, global, export, start, element, code, data); each function's code is a
 * stack-machine expression. Because Wasm control flow is already structured (block / loop /
 * if / else / end with labelled br), the lift reads cleaner than a native one: the stack is
 * turned back into expressions and the blocks into real if / loop with indentation, no CFG
 * recovery needed. Nothing is executed.
 */

const VALTYPE = { 0x7f: 'i32', 0x7e: 'i64', 0x7d: 'f32', 0x7c: 'f64', 0x7b: 'v128', 0x70: 'funcref', 0x6f: 'externref' };
const SECTION = ['custom', 'type', 'import', 'function', 'table', 'memory', 'global', 'export', 'start', 'element', 'code', 'data', 'datacount'];
const EXTKIND = ['func', 'table', 'mem', 'global'];

/** A little cursor over the module bytes with LEB128 readers. */
class Reader {
  constructor(buf, pos = 0, end = buf.length) { this.b = buf; this.p = pos; this.end = end; }
  byte() { return this.b[this.p++]; }
  has() { return this.p < this.end; }
  u32() { let r = 0, s = 0, x; do { x = this.b[this.p++]; r |= (x & 0x7f) << s; s += 7; } while (x & 0x80); return r >>> 0; }
  i32() { let r = 0, s = 0, x; do { x = this.b[this.p++]; r |= (x & 0x7f) << s; s += 7; } while (x & 0x80); if (s < 32 && (x & 0x40)) r |= (-1 << s); return r; }
  i64() { let r = 0n, s = 0n, x; do { x = BigInt(this.b[this.p++]); r |= (x & 0x7fn) << s; s += 7n; } while (x & 0x80n); if (x & 0x40n) r |= (~0n << s); return BigInt.asIntN(64, r); }
  f32() { const v = this.b.readFloatLE(this.p); this.p += 4; return v; }
  f64() { const v = this.b.readDoubleLE(this.p); this.p += 8; return v; }
  name() { const n = this.u32(); const s = this.b.toString('utf8', this.p, this.p + n); this.p += n; return s; }
  vec(fn) { const n = this.u32(); const out = []; for (let i = 0; i < n; i += 1) out.push(fn(this)); return out; }
  bytes(n) { const s = this.p; this.p += n; return this.b.subarray(s, this.p); }
}

function functype(r) {
  if (r.byte() !== 0x60) throw new Error('bad functype');
  const params = r.vec((x) => VALTYPE[x.byte()] || '?');
  const results = r.vec((x) => VALTYPE[x.byte()] || '?');
  return { params, results };
}

/** Opcode name table, built from the spec's instruction list. */
const OP = {
  0x00: 'unreachable', 0x01: 'nop', 0x02: 'block', 0x03: 'loop', 0x04: 'if', 0x05: 'else', 0x0b: 'end',
  0x0c: 'br', 0x0d: 'br_if', 0x0e: 'br_table', 0x0f: 'return', 0x10: 'call', 0x11: 'call_indirect',
  0x1a: 'drop', 0x1b: 'select', 0x1c: 'select',
  0x20: 'local.get', 0x21: 'local.set', 0x22: 'local.tee', 0x23: 'global.get', 0x24: 'global.set',
  0x3f: 'memory.size', 0x40: 'memory.grow',
  0x41: 'i32.const', 0x42: 'i64.const', 0x43: 'f32.const', 0x44: 'f64.const',
};
// memory load/store
const LOADS = ['i32.load', 'i64.load', 'f32.load', 'f64.load', 'i32.load8_s', 'i32.load8_u', 'i32.load16_s', 'i32.load16_u', 'i64.load8_s', 'i64.load8_u', 'i64.load16_s', 'i64.load16_u', 'i64.load32_s', 'i64.load32_u'];
LOADS.forEach((n, i) => { OP[0x28 + i] = n; });
const STORES = ['i32.store', 'i64.store', 'f32.store', 'f64.store', 'i32.store8', 'i32.store16', 'i64.store8', 'i64.store16', 'i64.store32'];
STORES.forEach((n, i) => { OP[0x36 + i] = n; });
// numeric: comparisons and arithmetic, 0x45..0xc4 (names from the spec, in order)
const NUM = ['i32.eqz', 'i32.eq', 'i32.ne', 'i32.lt_s', 'i32.lt_u', 'i32.gt_s', 'i32.gt_u', 'i32.le_s', 'i32.le_u', 'i32.ge_s', 'i32.ge_u',
  'i64.eqz', 'i64.eq', 'i64.ne', 'i64.lt_s', 'i64.lt_u', 'i64.gt_s', 'i64.gt_u', 'i64.le_s', 'i64.le_u', 'i64.ge_s', 'i64.ge_u',
  'f32.eq', 'f32.ne', 'f32.lt', 'f32.gt', 'f32.le', 'f32.ge', 'f64.eq', 'f64.ne', 'f64.lt', 'f64.gt', 'f64.le', 'f64.ge',
  'i32.clz', 'i32.ctz', 'i32.popcnt', 'i32.add', 'i32.sub', 'i32.mul', 'i32.div_s', 'i32.div_u', 'i32.rem_s', 'i32.rem_u', 'i32.and', 'i32.or', 'i32.xor', 'i32.shl', 'i32.shr_s', 'i32.shr_u', 'i32.rotl', 'i32.rotr',
  'i64.clz', 'i64.ctz', 'i64.popcnt', 'i64.add', 'i64.sub', 'i64.mul', 'i64.div_s', 'i64.div_u', 'i64.rem_s', 'i64.rem_u', 'i64.and', 'i64.or', 'i64.xor', 'i64.shl', 'i64.shr_s', 'i64.shr_u', 'i64.rotl', 'i64.rotr',
  'f32.abs', 'f32.neg', 'f32.ceil', 'f32.floor', 'f32.trunc', 'f32.nearest', 'f32.sqrt', 'f32.add', 'f32.sub', 'f32.mul', 'f32.div', 'f32.min', 'f32.max', 'f32.copysign',
  'f64.abs', 'f64.neg', 'f64.ceil', 'f64.floor', 'f64.trunc', 'f64.nearest', 'f64.sqrt', 'f64.add', 'f64.sub', 'f64.mul', 'f64.div', 'f64.min', 'f64.max', 'f64.copysign',
  'i32.wrap_i64', 'i32.trunc_f32_s', 'i32.trunc_f32_u', 'i32.trunc_f64_s', 'i32.trunc_f64_u', 'i64.extend_i32_s', 'i64.extend_i32_u', 'i64.trunc_f32_s', 'i64.trunc_f32_u', 'i64.trunc_f64_s', 'i64.trunc_f64_u',
  'f32.convert_i32_s', 'f32.convert_i32_u', 'f32.convert_i64_s', 'f32.convert_i64_u', 'f32.demote_f64', 'f64.convert_i32_s', 'f64.convert_i32_u', 'f64.convert_i64_s', 'f64.convert_i64_u', 'f64.promote_f32',
  'i32.reinterpret_f32', 'i64.reinterpret_f64', 'f32.reinterpret_i32', 'f64.reinterpret_i64',
  'i32.extend8_s', 'i32.extend16_s', 'i64.extend8_s', 'i64.extend16_s', 'i64.extend32_s'];
NUM.forEach((n, i) => { OP[0x45 + i] = n; });

// which opcodes carry which immediates (for the disassembler)
const MEMARG = new Set([...LOADS, ...STORES].map((n) => n));
const BINOP = {
  'i32.add': '+', 'i32.sub': '-', 'i32.mul': '*', 'i32.div_s': '/', 'i32.div_u': '/', 'i32.and': '&', 'i32.or': '|', 'i32.xor': '^', 'i32.shl': '<<', 'i32.shr_s': '>>', 'i32.shr_u': '>>>',
  'i64.add': '+', 'i64.sub': '-', 'i64.mul': '*', 'i64.and': '&', 'i64.or': '|', 'i64.xor': '^',
  'f32.add': '+', 'f32.sub': '-', 'f32.mul': '*', 'f32.div': '/', 'f64.add': '+', 'f64.sub': '-', 'f64.mul': '*', 'f64.div': '/',
  'i32.eq': '==', 'i32.ne': '!=', 'i32.lt_s': '<', 'i32.gt_s': '>', 'i32.le_s': '<=', 'i32.ge_s': '>=', 'i32.lt_u': '<', 'i32.gt_u': '>', 'i64.eq': '==', 'i64.ne': '!=',
  'f64.eq': '==', 'f64.lt': '<', 'f64.gt': '>', 'f64.le': '<=', 'f64.ge': '>=',
};

// prefix 0xFC (saturating truncation + bulk memory/table): subopcode -> name
const FC = { 0: 'i32.trunc_sat_f32_s', 1: 'i32.trunc_sat_f32_u', 2: 'i32.trunc_sat_f64_s', 3: 'i32.trunc_sat_f64_u', 4: 'i64.trunc_sat_f32_s', 5: 'i64.trunc_sat_f32_u', 6: 'i64.trunc_sat_f64_s', 7: 'i64.trunc_sat_f64_u', 8: 'memory.init', 9: 'data.drop', 10: 'memory.copy', 11: 'memory.fill', 12: 'table.init', 13: 'elem.drop', 14: 'table.copy', 15: 'table.grow', 16: 'table.size', 17: 'table.fill' };
// prefix 0xFD (SIMD / v128): the common subopcodes by name; the rest keep a simd.0xNN name but
// their immediate is still consumed from the subopcode range so decoding never desyncs
const FD = {
  0: 'v128.load', 1: 'v128.load8x8_s', 2: 'v128.load8x8_u', 3: 'v128.load16x4_s', 4: 'v128.load16x4_u', 5: 'v128.load32x2_s', 6: 'v128.load32x2_u', 7: 'v128.load8_splat', 8: 'v128.load16_splat', 9: 'v128.load32_splat', 10: 'v128.load64_splat', 11: 'v128.store',
  12: 'v128.const', 13: 'i8x16.shuffle', 14: 'i8x16.swizzle', 15: 'i8x16.splat', 16: 'i16x8.splat', 17: 'i32x4.splat', 18: 'i64x2.splat', 19: 'f32x4.splat', 20: 'f64x2.splat',
  21: 'i8x16.extract_lane_s', 22: 'i8x16.extract_lane_u', 23: 'i8x16.replace_lane', 24: 'i16x8.extract_lane_s', 25: 'i16x8.extract_lane_u', 26: 'i16x8.replace_lane', 27: 'i32x4.extract_lane', 28: 'i32x4.replace_lane', 29: 'i64x2.extract_lane', 30: 'i64x2.replace_lane', 31: 'f32x4.extract_lane', 32: 'f32x4.replace_lane', 33: 'f64x2.extract_lane', 34: 'f64x2.replace_lane',
  35: 'i8x16.eq', 36: 'i8x16.ne', 110: 'i8x16.add', 113: 'i8x16.sub', 174: 'i32x4.add', 177: 'i32x4.sub', 181: 'i32x4.mul', 228: 'f32x4.add', 229: 'f32x4.sub', 230: 'f32x4.mul', 231: 'f32x4.div', 77: 'v128.not', 78: 'v128.and', 80: 'v128.or', 81: 'v128.xor', 82: 'v128.bitselect', 83: 'v128.any_true',
};
// prefix 0xFE (threads / atomics): mostly memarg; only atomic.fence has no memarg
const FE = { 3: 'atomic.fence' };

/** Read a block type (0x40 void, a valtype, or a type index). */
function blocktype(r) {
  const b = r.b[r.p];
  if (b === 0x40) { r.p += 1; return 'void'; }
  if (VALTYPE[b]) { r.p += 1; return VALTYPE[b]; }
  return 's' + r.i32(); // a type index
}

/** Decode one function body's instructions into a flat list with depth markers. */
function decodeExpr(r, end) {
  const ins = [];
  while (r.p < end) {
    const addr = r.p; const op = r.byte();
    if (op === 0xfc || op === 0xfd || op === 0xfe) { // multi-byte prefix: subopcode is a u32 LEB
      const sub = r.u32(); const imm = {};
      let nm = op === 0xfc ? FC[sub] : op === 0xfd ? FD[sub] : FE[sub];
      if (!nm) nm = `${op === 0xfc ? 'fc' : op === 0xfd ? 'simd' : 'atomic'}.0x${sub.toString(16)}`;
      if (op === 0xfd) {
        if ((sub >= 0 && sub <= 11) || (sub >= 84 && sub <= 91)) { imm.align = r.u32(); imm.offset = r.u32(); if (sub >= 84 && sub <= 91) imm.lane = r.byte(); } // memarg (+ lane for load/store_lane)
        else if (sub === 12 || sub === 13) { imm.bytes = []; for (let k = 0; k < 16; k += 1) imm.bytes.push(r.byte()); } // v128.const / shuffle lane indices
        else if (sub >= 21 && sub <= 34) imm.lane = r.byte(); // extract / replace lane
      } else if (op === 0xfc) {
        if (sub === 8) { imm.data = r.u32(); r.byte(); } else if (sub === 9 || (sub >= 13 && sub <= 17)) imm.idx = r.u32();
        else if (sub === 10) { r.byte(); r.byte(); } else if (sub === 11) r.byte();
        else if (sub === 12) { imm.a = r.u32(); imm.b = r.u32(); } else if (sub === 14) { imm.a = r.u32(); imm.b = r.u32(); }
      } else if (op === 0xfe && sub !== 3) { imm.align = r.u32(); imm.offset = r.u32(); } else if (op === 0xfe) r.byte();
      ins.push({ addr, op, name: nm, text: nm + (imm.offset ? ` offset=${imm.offset}` : '') + (imm.lane != null ? ` lane=${imm.lane}` : ''), imm });
      continue;
    }
    const name = OP[op];
    if (name === undefined) { ins.push({ addr, op, text: `.byte 0x${op.toString(16)}`, bad: true }); continue; }
    let text = name, imm = {};
    if (op === 0x02 || op === 0x03 || op === 0x04) { imm.bt = blocktype(r); text = `${name} ${imm.bt}`; }
    else if (op === 0x0c || op === 0x0d) { imm.label = r.u32(); text = `${name} ${imm.label}`; }
    else if (op === 0x0e) { imm.targets = r.vec((x) => x.u32()); imm.def = r.u32(); text = `br_table ${imm.targets.join(' ')} ${imm.def}`; }
    else if (op === 0x10) { imm.func = r.u32(); text = `call ${imm.func}`; }
    else if (op === 0x11) { imm.type = r.u32(); imm.table = r.u32(); text = `call_indirect ${imm.type}`; }
    else if (op >= 0x20 && op <= 0x24) { imm.idx = r.u32(); text = `${name} ${imm.idx}`; }
    else if (op === 0x3f || op === 0x40) { r.byte(); text = name; }
    else if (op === 0x41) { imm.v = r.i32(); text = `i32.const ${imm.v}`; }
    else if (op === 0x42) { imm.v = r.i64(); text = `i64.const ${imm.v}`; }
    else if (op === 0x43) { imm.v = r.f32(); text = `f32.const ${imm.v}`; }
    else if (op === 0x44) { imm.v = r.f64(); text = `f64.const ${imm.v}`; }
    else if (MEMARG.has(name)) { imm.align = r.u32(); imm.offset = r.u32(); text = imm.offset ? `${name} offset=${imm.offset}` : name; }
    ins.push({ addr, op, name, text, imm });
  }
  return ins;
}

/** Lift a function body to structured pseudocode (stack machine -> expressions). */
function liftWasm(ins, funcNames) {
  const out = [];
  const stack = [];
  let depth = 1;
  const ind = () => '  '.repeat(depth);
  const pop = () => (stack.length ? stack.pop() : '?');
  const flush = (s) => out.push(ind() + s);
  for (const i of ins) {
    const n = i.name;
    if (!n) { flush(`/* ${i.text} */`); continue; }
    if (n === 'i32.const' || n === 'i64.const' || n === 'f32.const' || n === 'f64.const') { stack.push(String(i.imm.v)); continue; }
    if (n === 'local.get') { stack.push(`local${i.imm.idx}`); continue; }
    if (n === 'global.get') { stack.push(`global${i.imm.idx}`); continue; }
    if (n === 'local.set') { flush(`local${i.imm.idx} = ${pop()};`); continue; }
    if (n === 'local.tee') { const v = pop(); flush(`local${i.imm.idx} = ${v};`); stack.push(`local${i.imm.idx}`); continue; }
    if (n === 'global.set') { flush(`global${i.imm.idx} = ${pop()};`); continue; }
    if (BINOP[n]) { const b = pop(), a = pop(); stack.push(`(${a} ${BINOP[n]} ${b})`); continue; }
    if (n === 'i32.eqz' || n === 'i64.eqz') { stack.push(`(${pop()} == 0)`); continue; }
    if (n.startsWith('i32.load') || n.startsWith('i64.load') || n.startsWith('f32.load') || n.startsWith('f64.load')) { stack.push(`mem[${pop()}${i.imm.offset ? '+' + i.imm.offset : ''}]`); continue; }
    if (n.startsWith('i32.store') || n.startsWith('i64.store') || n.startsWith('f32.store') || n.startsWith('f64.store')) { const v = pop(), a = pop(); flush(`mem[${a}${i.imm.offset ? '+' + i.imm.offset : ''}] = ${v};`); continue; }
    if (n === 'call') { const nm = (funcNames && funcNames[i.imm.func]) || `func${i.imm.func}`; stack.push(`${nm}(...)`); continue; }
    if (n === 'call_indirect') { stack.push(`(*table[${pop()}])(...)`); continue; }
    if (n === 'drop') { pop(); continue; }
    if (n === 'select') { const c = pop(), b = pop(), a = pop(); stack.push(`(${c} ? ${a} : ${b})`); continue; }
    if (n === 'block') { flush(`block { // ${i.imm.bt}`); depth += 1; continue; }
    if (n === 'loop') { flush(`loop { // ${i.imm.bt}`); depth += 1; continue; }
    if (n === 'if') { flush(`if (${pop()}) {`); depth += 1; continue; }
    if (n === 'else') { depth -= 1; flush('} else {'); depth += 1; continue; }
    if (n === 'end') { if (depth > 1) { depth -= 1; flush('}'); } continue; }
    if (n === 'br') { flush(`br ${i.imm.label};`); continue; }
    if (n === 'br_if') { flush(`if (${pop()}) br ${i.imm.label};`); continue; }
    if (n === 'br_table') { flush(`br_table[${pop()}];`); continue; }
    if (n === 'return') { flush(stack.length ? `return ${pop()};` : 'return;'); continue; }
    if (n === 'unreachable') { flush('unreachable;'); continue; }
    if (n === 'nop') continue;
    // SIMD (v128) and bulk-memory ops
    if (n.startsWith('v128.load') || /load\d+(x\d+)?(_s|_u|_splat)?$/.test(n) && n.includes('v128')) { stack.push(`v128[${pop()}${i.imm.offset ? '+' + i.imm.offset : ''}]`); continue; }
    if (n === 'v128.store' || /\.store\d*_lane$/.test(n)) { const v = pop(), a = pop(); flush(`v128[${a}] = ${v};`); continue; }
    if (n === 'v128.const') { stack.push('v128.const(...)'); continue; }
    if (/\.splat$/.test(n) || /extract_lane/.test(n) || n === 'v128.not' || n === 'v128.any_true') { stack.push(`${n}(${pop()})`); continue; }
    if (/replace_lane/.test(n)) { const v = pop(), a = pop(); stack.push(`${n}(${a}, ${v})`); continue; }
    if (n === 'v128.bitselect') { const c = pop(), b = pop(), a = pop(); stack.push(`${n}(${a}, ${b}, ${c})`); continue; }
    if (/^(i8x16|i16x8|i32x4|i64x2|f32x4|f64x2)\.(add|sub|mul|div|eq|ne|lt|gt|le|ge|min|max|and|or|xor)/.test(n) || n === 'i8x16.swizzle' || /^v128\.(and|or|xor|andnot)$/.test(n)) { const b = pop(), a = pop(); stack.push(`${n}(${a}, ${b})`); continue; }
    if (/^memory\.(copy|fill|init)$/.test(n)) { pop(); pop(); pop(); flush(`${n}(...);`); continue; }
    if (/^(data|elem)\.drop$|^table\.(copy|init|fill|grow)$/.test(n)) { flush(`${n}(...);`); continue; }
    if (/trunc_sat/.test(n)) { stack.push(`${n}(${pop()})`); continue; }
    if (n.startsWith('simd.') || n.startsWith('fc.') || n.startsWith('atomic.')) { flush(`/* ${i.text} */`); continue; }
    // numeric conversions and the rest: render as a call on the top of stack
    stack.push(`${n}(${pop()})`);
  }
  if (stack.length) flush(`return ${stack.pop()};`);
  return out.join('\n');
}

/** Parse a whole module into a structured summary. */
function readWasm(buf) {
  if (buf.readUInt32LE(0) !== 0x6d736100) throw new Error('not a wasm module');
  const version = buf.readUInt32LE(4);
  const r = new Reader(buf, 8);
  const mod = { format: 'wasm', version, sections: [], types: [], imports: [], functions: [], exports: [], memories: [], globals: [], code: [], start: null, custom: [] };
  while (r.has()) {
    const id = r.byte(); const size = r.u32(); const bodyEnd = r.p + size; const name = SECTION[id] || `id${id}`;
    mod.sections.push({ id, name, size });
    const s = new Reader(buf, r.p, bodyEnd);
    try {
      if (id === 1) mod.types = s.vec(functype);
      else if (id === 2) mod.imports = s.vec((x) => { const m = x.name(), f = x.name(), k = x.byte(); let d = null; if (k === 0) d = x.u32(); else if (k === 3) { d = VALTYPE[x.byte()]; x.byte(); } return { module: m, field: f, kind: EXTKIND[k], desc: d }; });
      else if (id === 3) mod.functions = s.vec((x) => x.u32());
      else if (id === 6) mod.globals = s.vec((x) => { const t = VALTYPE[x.byte()]; const mut = x.byte(); while (x.p < bodyEnd && x.b[x.p - 1] !== 0x0b) x.byte(); return { type: t, mutable: !!mut }; });
      else if (id === 7) mod.exports = s.vec((x) => ({ name: x.name(), kind: EXTKIND[x.byte()], index: x.u32() }));
      else if (id === 8) mod.start = s.u32();
      else if (id === 5) mod.memories = s.vec((x) => { const fl = x.byte(); const min = x.u32(); const max = fl ? x.u32() : null; return { min, max }; });
      else if (id === 10) mod.code = s.vec((x) => { const sz = x.u32(); const codeEnd = x.p + sz; const locals = x.vec((y) => ({ count: y.u32(), type: VALTYPE[y.byte()] })); const ins = decodeExpr(x, codeEnd); x.p = codeEnd; return { locals, ins }; });
      else if (id === 0) mod.custom.push({ name: new Reader(buf, r.p, bodyEnd).name() });
    } catch (e) { mod.sections[mod.sections.length - 1].error = e.message; }
    r.p = bodyEnd;
  }
  // function names: imported functions first, then defined ones; export names decorate them
  const importedFns = mod.imports.filter((i) => i.kind === 'func').length;
  const names = [];
  mod.imports.filter((i) => i.kind === 'func').forEach((i, k) => { names[k] = `${i.module}.${i.field}`; });
  for (const e of mod.exports) if (e.kind === 'func') names[e.index] = e.name;
  mod.importedFns = importedFns;
  mod.funcNames = names;
  return mod;
}

export { readWasm, decodeExpr, liftWasm, OP, VALTYPE };
