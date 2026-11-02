/**
 * ATLAS — an Android DEX reader: the container and the Dalvik bytecode, built from the
 * format specification (Android "Dalvik Executable format" and "Dalvik bytecode"), not from
 * any tool's source. A DEX is a set of pools (strings, types, prototypes, fields, methods,
 * classes) and, per method, a code unit stream. This reads the pools, then decodes each
 * method's register-based bytecode into a readable listing, resolving every pool index to a
 * name. An APK is a ZIP holding `classes*.dex`; those are pulled out and read the same way.
 * Nothing is executed.
 */

import { inflateRawSync } from 'node:zlib';

// ---------------------------------------------------------------- Dalvik opcode table

// name + instruction format. The format fixes the size in 16-bit code units and the operand
// layout. `c` formats carry a pool index whose pool depends on the opcode (see REF below).
const FMT_UNITS = { '10x': 1, '12x': 1, '11n': 1, '11x': 1, '10t': 1, '20t': 2, '22x': 2, '21t': 2, '21s': 2, '21h': 2, '21c': 2, '23x': 2, '22b': 2, '22t': 2, '22s': 2, '22c': 2, '30t': 3, '31t': 3, '31i': 3, '31c': 3, '32x': 3, '35c': 3, '3rc': 3, '51l': 5, '45cc': 4, '4rcc': 4 };

const OPS = new Array(256).fill(null);
const o = (c, n, f) => { OPS[c] = [n, f]; };
const seq = (start, f, names) => names.forEach((n, i) => o(start + i, n, f));
o(0x00, 'nop', '10x'); o(0x01, 'move', '12x'); o(0x02, 'move/from16', '22x'); o(0x03, 'move/16', '32x');
o(0x04, 'move-wide', '12x'); o(0x05, 'move-wide/from16', '22x'); o(0x06, 'move-wide/16', '32x');
o(0x07, 'move-object', '12x'); o(0x08, 'move-object/from16', '22x'); o(0x09, 'move-object/16', '32x');
seq(0x0a, '11x', ['move-result', 'move-result-wide', 'move-result-object', 'move-exception', 'return-void']); OPS[0x0e] = ['return-void', '10x'];
seq(0x0f, '11x', ['return', 'return-wide', 'return-object']);
o(0x12, 'const/4', '11n'); o(0x13, 'const/16', '21s'); o(0x14, 'const', '31i'); o(0x15, 'const/high16', '21h');
o(0x16, 'const-wide/16', '21s'); o(0x17, 'const-wide/32', '31i'); o(0x18, 'const-wide', '51l'); o(0x19, 'const-wide/high16', '21h');
o(0x1a, 'const-string', '21c'); o(0x1b, 'const-string/jumbo', '31c'); o(0x1c, 'const-class', '21c');
o(0x1d, 'monitor-enter', '11x'); o(0x1e, 'monitor-exit', '11x'); o(0x1f, 'check-cast', '21c');
o(0x20, 'instance-of', '22c'); o(0x21, 'array-length', '12x'); o(0x22, 'new-instance', '21c'); o(0x23, 'new-array', '22c');
o(0x24, 'filled-new-array', '35c'); o(0x25, 'filled-new-array/range', '3rc'); o(0x26, 'fill-array-data', '31t');
o(0x27, 'throw', '11x'); o(0x28, 'goto', '10t'); o(0x29, 'goto/16', '20t'); o(0x2a, 'goto/32', '30t');
o(0x2b, 'packed-switch', '31t'); o(0x2c, 'sparse-switch', '31t');
seq(0x2d, '23x', ['cmpl-float', 'cmpg-float', 'cmpl-double', 'cmpg-double', 'cmp-long']);
seq(0x32, '22t', ['if-eq', 'if-ne', 'if-lt', 'if-ge', 'if-gt', 'if-le']);
seq(0x38, '21t', ['if-eqz', 'if-nez', 'if-ltz', 'if-gez', 'if-gtz', 'if-lez']);
seq(0x44, '23x', ['aget', 'aget-wide', 'aget-object', 'aget-boolean', 'aget-byte', 'aget-char', 'aget-short', 'aput', 'aput-wide', 'aput-object', 'aput-boolean', 'aput-byte', 'aput-char', 'aput-short']);
seq(0x52, '22c', ['iget', 'iget-wide', 'iget-object', 'iget-boolean', 'iget-byte', 'iget-char', 'iget-short', 'iput', 'iput-wide', 'iput-object', 'iput-boolean', 'iput-byte', 'iput-char', 'iput-short']);
seq(0x60, '21c', ['sget', 'sget-wide', 'sget-object', 'sget-boolean', 'sget-byte', 'sget-char', 'sget-short', 'sput', 'sput-wide', 'sput-object', 'sput-boolean', 'sput-byte', 'sput-char', 'sput-short']);
seq(0x6e, '35c', ['invoke-virtual', 'invoke-super', 'invoke-direct', 'invoke-static', 'invoke-interface']);
seq(0x74, '3rc', ['invoke-virtual/range', 'invoke-super/range', 'invoke-direct/range', 'invoke-static/range', 'invoke-interface/range']);
seq(0x7b, '12x', ['neg-int', 'not-int', 'neg-long', 'not-long', 'neg-float', 'neg-double', 'int-to-long', 'int-to-float', 'int-to-double', 'long-to-int', 'long-to-float', 'long-to-double', 'float-to-int', 'float-to-long', 'float-to-double', 'double-to-int', 'double-to-long', 'double-to-float', 'int-to-byte', 'int-to-char', 'int-to-short']);
seq(0x90, '23x', ['add-int', 'sub-int', 'mul-int', 'div-int', 'rem-int', 'and-int', 'or-int', 'xor-int', 'shl-int', 'shr-int', 'ushr-int', 'add-long', 'sub-long', 'mul-long', 'div-long', 'rem-long', 'and-long', 'or-long', 'xor-long', 'shl-long', 'shr-long', 'ushr-long', 'add-float', 'sub-float', 'mul-float', 'div-float', 'rem-float', 'add-double', 'sub-double', 'mul-double', 'div-double', 'rem-double']);
seq(0xb0, '12x', ['add-int/2addr', 'sub-int/2addr', 'mul-int/2addr', 'div-int/2addr', 'rem-int/2addr', 'and-int/2addr', 'or-int/2addr', 'xor-int/2addr', 'shl-int/2addr', 'shr-int/2addr', 'ushr-int/2addr', 'add-long/2addr', 'sub-long/2addr', 'mul-long/2addr', 'div-long/2addr', 'rem-long/2addr', 'and-long/2addr', 'or-long/2addr', 'xor-long/2addr', 'shl-long/2addr', 'shr-long/2addr', 'ushr-long/2addr', 'add-float/2addr', 'sub-float/2addr', 'mul-float/2addr', 'div-float/2addr', 'rem-float/2addr', 'add-double/2addr', 'sub-double/2addr', 'mul-double/2addr', 'div-double/2addr', 'rem-double/2addr']);
seq(0xd0, '22s', ['add-int/lit16', 'rsub-int', 'mul-int/lit16', 'div-int/lit16', 'rem-int/lit16', 'and-int/lit16', 'or-int/lit16', 'xor-int/lit16']);
seq(0xd8, '22b', ['add-int/lit8', 'rsub-int/lit8', 'mul-int/lit8', 'div-int/lit8', 'rem-int/lit8', 'and-int/lit8', 'or-int/lit8', 'xor-int/lit8', 'shl-int/lit8', 'shr-int/lit8', 'ushr-int/lit8']);
o(0xfa, 'invoke-polymorphic', '45cc'); o(0xfb, 'invoke-polymorphic/range', '4rcc'); o(0xfc, 'invoke-custom', '35c'); o(0xfd, 'invoke-custom/range', '3rc'); o(0xfe, 'const-method-handle', '21c'); o(0xff, 'const-method-type', '21c');

// which pool a `c`-format index refers to, by opcode
function refKind(op) {
  if (op === 0x1a || op === 0x1b) return 'string';
  if (op === 0x1c || op === 0x1f || op === 0x22) return 'type';
  if (op === 0x20 || op === 0x23) return 'type';
  if (op === 0x24 || op === 0x25) return 'type';
  if (op >= 0x52 && op <= 0x5f) return 'field';
  if (op >= 0x60 && op <= 0x6d) return 'field';
  if ((op >= 0x6e && op <= 0x72) || (op >= 0x74 && op <= 0x78)) return 'method';
  if (op === 0xfc || op === 0xfd) return 'callsite';
  if (op === 0xfe) return 'methodhandle';
  if (op === 0xff) return 'proto';
  return 'index';
}

/**
 * Decode a method's instruction stream. `u` reads a 16-bit code unit: u(i). `n` is the unit
 * count. `resolve(kind, idx)` turns a pool index into a name. Returns instructions, whether
 * it decoded fully, and the opcode that stopped it.
 */
function decodeInsns(u, n, resolve) {
  const out = []; let i = 0, complete = true, stoppedAt = null;
  const rd = resolve || (() => '?');
  const s16 = (v) => (v & 0x8000 ? v - 0x10000 : v);
  const s8 = (v) => (v & 0x80 ? v - 0x100 : v);
  while (i < n) {
    const unit = u(i); const op = unit & 0xff;
    const ent = OPS[op];
    if (!ent) { complete = false; stoppedAt = op.toString(16); break; }
    const [name, fmt] = ent; const size = FMT_UNITS[fmt] || 1;
    if (i + size > n) { complete = false; stoppedAt = name + ' (truncated)'; break; }
    const A = (unit >> 8) & 0xf, B = (unit >> 12) & 0xf, AA = (unit >> 8) & 0xff;
    const kind = refKind(op);
    let text;
    switch (fmt) {
      case '10x': text = name; break;
      case '12x': text = `${name} v${A}, v${B}`; break;
      case '11n': text = `${name} v${A}, #${B & 8 ? B - 16 : B}`; break;
      case '11x': text = `${name} v${AA}`; break;
      case '10t': text = `${name} ${rel(i, s8(AA))}`; break;
      case '20t': text = `${name} ${rel(i, s16(u(i + 1)))}`; break;
      case '22x': text = `${name} v${AA}, v${u(i + 1)}`; break;
      case '21t': text = `${name} v${AA}, ${rel(i, s16(u(i + 1)))}`; break;
      case '21s': text = `${name} v${AA}, #${s16(u(i + 1))}`; break;
      case '21h': text = `${name} v${AA}, #${hexh(u(i + 1), op)}`; break;
      case '21c': text = `${name} v${AA}, ${rd(kind, u(i + 1))}`; break;
      case '23x': text = `${name} v${AA}, v${u(i + 1) & 0xff}, v${(u(i + 1) >> 8) & 0xff}`; break;
      case '22b': text = `${name} v${AA}, v${u(i + 1) & 0xff}, #${s8((u(i + 1) >> 8) & 0xff)}`; break;
      case '22t': text = `${name} v${A}, v${B}, ${rel(i, s16(u(i + 1)))}`; break;
      case '22s': text = `${name} v${A}, v${B}, #${s16(u(i + 1))}`; break;
      case '22c': text = `${name} v${A}, v${B}, ${rd(kind, u(i + 1))}`; break;
      case '30t': text = `${name} ${rel(i, (u(i + 1) | (u(i + 2) << 16)) | 0)}`; break;
      case '31t': text = `${name} v${AA}, ${rel(i, (u(i + 1) | (u(i + 2) << 16)) | 0)}`; break;
      case '31i': text = `${name} v${AA}, #${(u(i + 1) | (u(i + 2) << 16)) | 0}`; break;
      case '31c': text = `${name} v${AA}, ${rd('string', (u(i + 1) | (u(i + 2) << 16)) >>> 0)}`; break;
      case '32x': text = `${name} v${u(i + 1)}, v${u(i + 2)}`; break;
      case '35c': { const g = (unit >> 12) & 0xf; const regs = [u(i + 2) & 0xf, (u(i + 2) >> 4) & 0xf, (u(i + 2) >> 8) & 0xf, (u(i + 2) >> 12) & 0xf, (unit >> 8) & 0xf].slice(0, g).map((r) => 'v' + r); text = `${name} {${regs.join(', ')}}, ${rd(kind, u(i + 1))}`; break; }
      case '3rc': { const cnt = AA, start = u(i + 2); text = `${name} {v${start}..v${start + cnt - 1}}, ${rd(kind, u(i + 1))}`; break; }
      case '51l': { const lo = (u(i + 1) | (u(i + 2) << 16)) >>> 0, hi = (u(i + 3) | (u(i + 4) << 16)) >>> 0; text = `${name} v${AA}, #0x${hi.toString(16)}${lo.toString(16).padStart(8, '0')}`; break; }
      case '45cc': case '4rcc': text = `${name} {…}, ${rd('method', u(i + 1))}, ${rd('proto', u(i + 3))}`; break;
      default: text = name;
    }
    out.push({ off: i, op: name, text });
    i += size;
  }
  return { instructions: out, complete, stoppedAt, units: i };
}
function rel(i, d) { return 'L_' + ((i + d) * 2).toString(16); }
function hexh(v, op) { return '0x' + v.toString(16) + (op === 0x15 || op === 0x19 ? '0000' : ''); }

// ---------------------------------------------------------------- DEX container

function uleb(b, p) { let r = 0, s = 0, x; do { x = b[p.o++]; r |= (x & 0x7f) << s; s += 7; } while (x & 0x80); return r >>> 0; }

function mutf8(b, off) {
  // modified UTF-8 with a ULEB128 utf16 length prefix; decoded close enough for names/strings
  const p = { o: off }; uleb(b, p); let s = '';
  for (;;) {
    const a = b[p.o++]; if (a === 0 || a === undefined) break;
    if (a < 0x80) s += String.fromCharCode(a);
    else if ((a & 0xe0) === 0xc0) { const c = b[p.o++]; s += String.fromCharCode(((a & 0x1f) << 6) | (c & 0x3f)); }
    else if ((a & 0xf0) === 0xe0) { const c = b[p.o++], d = b[p.o++]; s += String.fromCharCode(((a & 0x0f) << 12) | ((c & 0x3f) << 6) | (d & 0x3f)); }
    else s += '?';
    if (s.length > 4096) break;
  }
  return s;
}

function readDex(buf, opts) {
  const magic = buf.toString('latin1', 0, 4);
  if (magic !== 'dex\n') throw new Error('not a DEX (no dex\\n magic)');
  const version = buf.toString('latin1', 4, 7);
  const u32 = (o) => buf.readUInt32LE(o);
  const H = {
    stringIds: { size: u32(0x38), off: u32(0x3c) }, typeIds: { size: u32(0x40), off: u32(0x44) },
    protoIds: { size: u32(0x48), off: u32(0x4c) }, fieldIds: { size: u32(0x50), off: u32(0x54) },
    methodIds: { size: u32(0x58), off: u32(0x5c) }, classDefs: { size: u32(0x60), off: u32(0x64) },
  };
  const strOff = (i) => u32(H.stringIds.off + i * 4);
  const strCache = new Map();
  const str = (i) => { if (i >= H.stringIds.size) return `str#${i}`; if (!strCache.has(i)) strCache.set(i, mutf8(buf, strOff(i))); return strCache.get(i); };
  const typeStr = (i) => (i < H.typeIds.size ? str(u32(H.typeIds.off + i * 4)) : `type#${i}`);
  const protoStr = (i) => { if (i >= H.protoIds.size) return `proto#${i}`; const base = H.protoIds.off + i * 12; return `(${str(u32(base))})${typeStr(u32(base + 4))}`.slice(0, 80); };
  const fieldStr = (i) => { if (i >= H.fieldIds.size) return `field#${i}`; const base = H.fieldIds.off + i * 8; return `${typeStr(buf.readUInt16LE(base))}.${str(u32(base + 4))}:${typeStr(buf.readUInt16LE(base + 2))}`; };
  const methodStr = (i) => { if (i >= H.methodIds.size) return `method#${i}`; const base = H.methodIds.off + i * 8; return `${typeStr(buf.readUInt16LE(base))}.${str(u32(base + 4))}`; };
  const resolve = (kind, idx) => kind === 'string' ? JSON.stringify(str(idx).slice(0, 60)) : kind === 'type' ? typeStr(idx) : kind === 'field' ? fieldStr(idx) : kind === 'method' ? methodStr(idx) : kind === 'proto' ? protoStr(idx) : `@${idx}`;

  const result = {
    version, counts: { strings: H.stringIds.size, types: H.typeIds.size, protos: H.protoIds.size, fields: H.fieldIds.size, methods: H.methodIds.size, classes: H.classDefs.size },
    classes: [], decoded: [],
  };
  const want = opts && opts.decodeMethods;
  let attempted = 0, full = 0; const unknown = new Set();
  for (let c = 0; c < H.classDefs.size && c < 200000; c += 1) {
    const base = H.classDefs.off + c * 32;
    const classIdx = u32(base), access = u32(base + 4), classDataOff = u32(base + 24);
    const cname = typeStr(classIdx);
    const cls = { name: cname, access, directMethods: 0, virtualMethods: 0 };
    if (classDataOff) {
      const p = { o: classDataOff };
      const sf = uleb(buf, p), inf = uleb(buf, p), dm = uleb(buf, p), vm = uleb(buf, p);
      cls.directMethods = dm; cls.virtualMethods = vm;
      // skip the field lists, then read the methods (each: idx_diff, access, code_off), uleb
      for (let k = 0; k < sf + inf; k += 1) { uleb(buf, p); uleb(buf, p); }
      let mIdx = 0;
      const readMethods = (count) => {
        for (let k = 0; k < count; k += 1) {
          const diff = uleb(buf, p); mIdx += diff; const macc = uleb(buf, p); const codeOff = uleb(buf, p);
          if (!want) continue;
          const mn = methodStr(mIdx);
          if (!want(mn)) continue;
          if (result.decoded.length >= (opts.max || 60)) { result.decodedTruncated = true; return; }
          if (!codeOff) { result.decoded.push({ method: mn, note: 'no code (abstract or native)' }); continue; }
          const registers = buf.readUInt16LE(codeOff), insnsSize = u32(codeOff + 12);
          const insnsOff = codeOff + 16;
          attempted += 1;
          const d = decodeInsns((idx) => buf.readUInt16LE(insnsOff + idx * 2), insnsSize, resolve);
          if (d.complete) full += 1; else if (d.stoppedAt) unknown.add(d.stoppedAt);
          // try/catch regions (code_item tries + encoded catch handlers)
          let handlers;
          const triesSize = buf.readUInt16LE(codeOff + 6);
          if (triesSize > 0) {
            try {
              let triesOff = insnsOff + insnsSize * 2; if (insnsSize & 1) triesOff += 2; // 4-byte alignment
              const listOff = triesOff + triesSize * 8;
              const sleb = (b, p) => { let r = 0, s = 0, x; do { x = b[p.o++]; r |= (x & 0x7f) << s; s += 7; } while (x & 0x80); if (x & 0x40) r |= (~0 << s); return r; };
              const byOff = {}; const pp = { o: listOff }; const nLists = uleb(buf, pp);
              for (let i = 0; i < nLists; i += 1) { const hoff = pp.o - listOff; const sz = sleb(buf, pp); const arr = []; for (let k = 0; k < Math.abs(sz); k += 1) { const tIdx = uleb(buf, pp); const addr = uleb(buf, pp); arr.push({ type: resolve('type', tIdx), addr }); } if (sz <= 0) arr.push({ type: '*', addr: uleb(buf, pp) }); byOff[hoff] = arr; }
              handlers = [];
              for (let t = 0; t < triesSize; t += 1) { const o = triesOff + t * 8; const start = u32(o), count = buf.readUInt16LE(o + 4), hOff = buf.readUInt16LE(o + 6); handlers.push({ try: `${start.toString(16).padStart(4, '0')}..${(start + count).toString(16).padStart(4, '0')}`, catches: byOff[hOff] || [] }); }
            } catch { handlers = undefined; }
          }
          result.decoded.push({ method: mn, registers, units: insnsSize, count: d.instructions.length, complete: d.complete, stoppedAt: d.stoppedAt, handlers, instructions: d.instructions, pseudo: (opts && opts.pseudo) ? liftDalvik(d.instructions) : undefined });
        }
      };
      readMethods(dm); if (!result.decodedTruncated) readMethods(vm);
    }
    result.classes.push(cls);
  }
  if (want) result.cilCoverage = { attempted, fullyDecoded: full, percent: attempted ? Math.round((full / attempted) * 100) : null, unknownOpcodes: [...unknown], truncated: Boolean(result.decodedTruncated) };
  return result;
}

// ---------------------------------------------------------------- APK (ZIP) -> classes.dex

/** Pull every `classes*.dex` out of a ZIP (stored or deflated). Minimal central-dir walk. */
function dexEntriesFromZip(buf) {
  // find the End Of Central Directory record
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 65557; i -= 1) { if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; } }
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10); let cd = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let k = 0; k < count && cd + 46 <= buf.length; k += 1) {
    if (buf.readUInt32LE(cd) !== 0x02014b50) break;
    const method = buf.readUInt16LE(cd + 10), compSize = buf.readUInt32LE(cd + 20), nameLen = buf.readUInt16LE(cd + 28), extraLen = buf.readUInt16LE(cd + 30), commentLen = buf.readUInt16LE(cd + 32), lho = buf.readUInt32LE(cd + 42);
    const name = buf.toString('latin1', cd + 46, cd + 46 + nameLen);
    if (/^classes\d*\.dex$/.test(name)) {
      const lnLen = buf.readUInt16LE(lho + 26), lxLen = buf.readUInt16LE(lho + 28);
      const dataOff = lho + 30 + lnLen + lxLen;
      const raw = buf.subarray(dataOff, dataOff + compSize);
      try { out.push({ name, data: method === 8 ? inflateRawSync(raw) : Buffer.from(raw) }); } catch { /* bad entry */ }
    }
    cd += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

/**
 * Lift a decoded Dalvik method to readable pseudo-Java. Our own, over our own DEX reader.
 * Dalvik is register-based with its pool indices already resolved to names, so the lift is a
 * forward substitution over the registers: a register holds the expression last written to
 * it, substituted into later uses; a field or array store, an invoke whose result nobody
 * takes, a return and a throw are the statements. `new-instance` + `invoke-direct <init>`
 * fold into `new Type(args)`; `invoke` + `move-result` folds the call into the destination.
 * Branch targets get a label and a `goto`; no if/while structuring. Nothing is executed.
 */
const BINJ = { add: '+', sub: '-', mul: '*', div: '/', rem: '%', and: '&', or: '|', xor: '^', shl: '<<', shr: '>>', ushr: '>>>' };
const IFJ = { 'if-eq': '==', 'if-ne': '!=', 'if-lt': '<', 'if-ge': '>=', 'if-gt': '>', 'if-le': '<=', 'if-eqz': '==', 'if-nez': '!=', 'if-ltz': '<', 'if-gez': '>=', 'if-gtz': '>', 'if-lez': '<=' };
const shortType = (d) => { if (!d) return d; let s = d; let arr = ''; while (s[0] === '[') { arr += '[]'; s = s.slice(1); } if (s[0] === 'L') s = s.slice(1, -1).split('/').pop(); else s = ({ V: 'void', Z: 'boolean', B: 'byte', S: 'short', C: 'char', I: 'int', J: 'long', F: 'float', D: 'double' }[s] || s); return s + arr; };
const methShort = (ref) => String(ref).split('.').pop();
const fieldShort = (ref) => String(ref).split('.').pop().split(':')[0];
const classOf = (ref) => shortType(String(ref).split(/;?\./)[0] + (String(ref).includes(';') ? ';' : ''));

function liftDalvik(instructions) {
  const env = new Map();
  const out = [];
  const val = (r) => (env.has(r) ? env.get(r) : r);
  const labels = new Set();
  for (const ins of instructions) { const m = /\bL_([0-9a-f]+)\b/.exec(ins.text); if (m && /^(if-|goto)/.test(ins.op)) labels.add(parseInt(m[1], 16)); }
  const newInst = new Map();
  for (let k = 0; k < instructions.length; k += 1) {
    const ins = instructions[k]; const byte = ins.off * 2;
    if (labels.has(byte)) { for (const [r, e] of env) if (e !== r) out.push({ off: ins.off, text: `${r} = ${e};` }); env.clear(); out.push({ off: ins.off, text: `L_${byte.toString(16)}:` }); }
    const op = ins.op; const rest = ins.text.slice(ins.op.length).trim();
    const regs = [...rest.matchAll(/v(\d+)/g)].map((x) => 'v' + x[1]);
    const label = (/(L_[0-9a-f]+)/.exec(rest) || [])[1];
    const strM = /"((?:[^"\\]|\\.)*)"/.exec(rest);
    const immM = /#(-?(?:0x)?[0-9a-fA-F]+)/.exec(rest);
    const refM = /,\s*([\[A-Za-z][\w$/;.:<>\[\]]*)\s*$/.exec(rest) || (op === 'new-instance' || op === 'const-class' || op === 'check-cast' ? /,\s*(\S+)\s*$/.exec(rest) : null);
    const ref = refM ? refM[1] : null;
    const push = (t) => out.push({ off: ins.off, text: t });
    const emit = () => { /* flush a pending invoke with no result */ };
    if (op === 'nop' || /^monitor-/.test(op)) continue;
    if (op === 'const-string') { env.set(regs[0], strM ? '"' + strM[1] + '"' : '""'); continue; }
    if (op === 'const-class') { env.set(regs[0], shortType(ref) + '.class'); continue; }
    if (/^const/.test(op)) { env.set(regs[0], immM ? immM[1].replace('0x', '0x') : '0'); continue; }
    if (/^move-result/.test(op) || op === 'move-exception') { if (!env.has('$ret')) env.set(regs[0], op === 'move-exception' ? 'ex' : '$result'); else { env.set(regs[0], env.get('$ret')); env.delete('$ret'); } continue; }
    if (/^move/.test(op)) { env.set(regs[0], val(regs[1])); continue; }
    if (op === 'return-void') { push('return;'); continue; }
    if (/^return/.test(op)) { push(`return ${val(regs[0])};`); continue; }
    if (op === 'throw') { push(`throw ${val(regs[0])};`); continue; }
    if (op === 'check-cast') { env.set(regs[0], `((${shortType(ref)})${val(regs[0])})`); continue; }
    if (op === 'instance-of') { env.set(regs[0], `(${val(regs[1])} instanceof ${shortType(ref)})`); continue; }
    if (op === 'array-length') { env.set(regs[0], `${val(regs[1])}.length`); continue; }
    if (op === 'new-instance') { newInst.set(regs[0], shortType(ref)); env.set(regs[0], `new ${shortType(ref)}`); continue; }
    if (op === 'new-array') { env.set(regs[0], `new ${shortType(ref).replace('[]', '')}[${val(regs[1])}]`); continue; }
    if (/^aget/.test(op)) { env.set(regs[0], `${val(regs[1])}[${val(regs[2])}]`); continue; }
    if (/^aput/.test(op)) { push(`${val(regs[1])}[${val(regs[2])}] = ${val(regs[0])};`); continue; }
    if (/^iget/.test(op)) { env.set(regs[0], `${val(regs[1])}.${fieldShort(ref)}`); continue; }
    if (/^iput/.test(op)) { push(`${val(regs[1])}.${fieldShort(ref)} = ${val(regs[0])};`); continue; }
    if (/^sget/.test(op)) { env.set(regs[0], `${classOf(ref)}.${fieldShort(ref)}`); continue; }
    if (/^sput/.test(op)) { push(`${classOf(ref)}.${fieldShort(ref)} = ${val(regs[0])};`); continue; }
    if (/^invoke/.test(op)) {
      const isStatic = /static/.test(op); const method = methShort(ref);
      let expr;
      if (!isStatic && method === '<init>' && regs.length && newInst.has(regs[0])) { expr = `new ${newInst.get(regs[0])}(${regs.slice(1).map(val).join(', ')})`; env.set(regs[0], expr); newInst.delete(regs[0]); continue; }
      if (isStatic) expr = `${classOf(ref)}.${method}(${regs.map(val).join(', ')})`;
      else expr = `${val(regs[0])}.${method}(${regs.slice(1).map(val).join(', ')})`;
      const next = instructions[k + 1];
      if (next && /^move-result/.test(next.op)) env.set('$ret', expr); else push(`${expr};`);
      continue;
    }
    const base = op.split('-')[0];
    if (BINJ[base] && /2addr/.test(op)) { env.set(regs[0], `(${val(regs[0])} ${BINJ[base]} ${val(regs[1])})`); continue; }
    if (BINJ[base] && /lit/.test(op)) { env.set(regs[0], base === 'rsub' ? `(${immM ? immM[1] : '0'} - ${val(regs[1])})` : `(${val(regs[1])} ${BINJ[base]} ${immM ? immM[1] : '0'})`); continue; }
    if (op === 'rsub-int' || op === 'rsub-int/lit8') { env.set(regs[0], `(${immM ? immM[1] : '0'} - ${val(regs[1])})`); continue; }
    if (BINJ[base]) { env.set(regs[0], `(${val(regs[1])} ${BINJ[base]} ${val(regs[2])})`); continue; }
    if (/^neg-/.test(op)) { env.set(regs[0], `(-${val(regs[1])})`); continue; }
    if (/^not-/.test(op)) { env.set(regs[0], `(~${val(regs[1])})`); continue; }
    if (/-to-/.test(op)) { env.set(regs[0], `(${op.split('-to-')[1]})${val(regs[1])}`); continue; }
    if (/^cmp/.test(op)) { env.set(regs[0], `cmp(${val(regs[1])}, ${val(regs[2])})`); continue; }
    if (op === 'goto' || /^goto/.test(op)) { push(`goto ${label};`); continue; }
    if (IFJ[op]) { const z = /z$/.test(op); const cond = z ? `${val(regs[0])} ${IFJ[op]} 0` : `${val(regs[0])} ${IFJ[op]} ${val(regs[1])}`; push(`if (${cond}) goto ${label};`); continue; }
    void emit;
    push(`// ${ins.text}`);
  }
  return out;
}

export { readDex, decodeInsns, dexEntriesFromZip, liftDalvik, OPS };
