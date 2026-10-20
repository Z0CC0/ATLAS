/**
 * ATLAS — DWARF debug information read from an ELF's .debug_* sections: the abbreviation
 * table and the .debug_info DIEs, to recover function names and their PC ranges (and the
 * compile unit's name and producer). The layout, forms and attribute/tag codes are from the
 * DWARF specification (versions 2 through 5), not from any tool's source. 32-bit DWARF (the
 * common case) is handled; the line-number program and type graph are not reconstructed here.
 * Nothing is executed.
 */

function leb(b, o, signed) {
  let r = 0n, s = 0n, byte; const start = o;
  do { byte = b[o]; o += 1; r |= BigInt(byte & 0x7f) << s; s += 7n; } while (byte & 0x80);
  if (signed && (byte & 0x40)) r |= (~0n) << s;
  return { v: Number(r), o, bytes: o - start };
}
const AT = { name: 0x03, low_pc: 0x11, high_pc: 0x12, producer: 0x25, comp_dir: 0x1b, external: 0x3f, decl_file: 0x3a, decl_line: 0x3b, str_offsets_base: 0x72, addr_base: 0x73 };
const TAG = { compile_unit: 0x11, subprogram: 0x2e, variable: 0x34 };

/** Parse the .debug_abbrev table starting at offset `base`. Returns code -> abbreviation. */
function parseAbbrev(b, base) {
  const table = {}; let o = base;
  for (;;) {
    const c = leb(b, o); o = c.o; if (c.v === 0) break;
    const tag = leb(b, o); o = tag.o; const hasChildren = b[o]; o += 1;
    const attrs = [];
    for (;;) {
      const at = leb(b, o); o = at.o; const form = leb(b, o); o = form.o;
      let implicit = null; if (form.v === 0x21) { const ic = leb(b, o, true); o = ic.o; implicit = ic.v; } // implicit_const
      if (at.v === 0 && form.v === 0) break;
      attrs.push([at.v, form.v, implicit]);
    }
    table[c.v] = { tag: tag.v, hasChildren, attrs };
  }
  return table;
}

/** Read one attribute value by form. Returns { v, o } (v may be a number, bigint or string). */
function readForm(b, o, form, implicit, cx) {
  const u16 = () => { const v = b.readUInt16LE(o); o += 2; return v; };
  const u32 = () => { const v = b.readUInt32LE(o); o += 4; return v; };
  const str = (at) => { let e = at; while (b[e]) e += 1; return b.toString('utf8', at, e); };
  switch (form) {
    case 0x01: { const n = cx.addrSize; let v = 0n; for (let i = 0; i < n; i += 1) v |= BigInt(b[o + i]) << BigInt(8 * i); o += n; return { v: Number(v), o }; } // addr
    case 0x08: { const s = str(o); o += s.length + 1; return { v: s, o }; } // string (inline)
    case 0x0e: { const off = u32(); return { v: cx.str ? cstr(cx.str, off) : `strp@${off}`, o }; } // strp
    case 0x1f: { const off = u32(); return { v: cx.lineStr ? cstr(cx.lineStr, off) : `lstrp@${off}`, o }; } // line_strp
    case 0x0b: { const v = b[o]; o += 1; return { v, o }; } // data1
    case 0x05: { const v = u16(); return { v, o }; } // data2
    case 0x06: { const v = u32(); return { v, o }; } // data4
    case 0x07: { const v = Number(b.readBigUInt64LE(o)); o += 8; return { v, o }; } // data8
    case 0x0f: { const r = leb(b, o); return { v: r.v, o: r.o }; } // udata
    case 0x0d: { const r = leb(b, o, true); return { v: r.v, o: r.o }; } // sdata
    case 0x0c: { const v = b[o]; o += 1; return { v, o }; } // flag
    case 0x19: return { v: 1, o }; // flag_present
    case 0x17: { const v = u32(); return { v, o }; } // sec_offset
    case 0x10: { const v = u32(); return { v, o }; } // ref_addr
    case 0x11: { const v = b[o]; o += 1; return { v, o, ref: true }; }
    case 0x12: { const v = u16(); return { v, o, ref: true }; }
    case 0x13: { const v = u32(); return { v, o, ref: true }; }
    case 0x15: { const r = leb(b, o); return { v: r.v, o: r.o, ref: true }; }
    case 0x18: { const r = leb(b, o); o = r.o + r.v; return { v: null, o }; } // exprloc: skip
    case 0x09: { const r = leb(b, o); o = r.o + r.v; return { v: null, o }; } // block
    case 0x0a: { const n = b[o]; o += 1 + n; return { v: null, o }; } // block1
    case 0x03: { const n = u16(); o += n; return { v: null, o }; } // block2
    case 0x04: { const n = u32(); o += n; return { v: null, o }; } // block4
    case 0x21: return { v: implicit, o }; // implicit_const
    case 0x1a: { const r = leb(b, o); return { v: strx(cx, r.v), o: r.o }; } // strx
    case 0x25: { const i = b[o]; o += 1; return { v: strx(cx, i), o }; } // strx1
    case 0x26: { const i = u16(); return { v: strx(cx, i), o }; } // strx2
    case 0x27: { const i = (b[o]) | (b[o + 1] << 8) | (b[o + 2] << 16); o += 3; return { v: strx(cx, i), o }; } // strx3
    case 0x28: { const i = u32(); return { v: strx(cx, i), o }; } // strx4
    case 0x1b: { const r = leb(b, o); return { v: addrx(cx, r.v), o: r.o }; } // addrx
    case 0x29: { const i = b[o]; o += 1; return { v: addrx(cx, i), o }; } // addrx1
    case 0x2a: { const i = u16(); return { v: addrx(cx, i), o }; } // addrx2
    case 0x2b: { const i = (b[o]) | (b[o + 1] << 8) | (b[o + 2] << 16); o += 3; return { v: addrx(cx, i), o }; } // addrx3
    case 0x2c: { const i = u32(); return { v: addrx(cx, i), o }; } // addrx4
    case 0x16: { const r = leb(b, o); return readForm(b, r.o, r.v, null, cx); } // indirect
    default: return { v: null, o, unknown: true };
  }
}
function cstr(buf, off) { if (!buf || off >= buf.length) return `@${off}`; let e = off; while (e < buf.length && buf[e]) e += 1; return buf.toString('utf8', off, e); }
function strx(cx, i) { if (!cx.strOffsets) return `strx${i}`; const off = cx.strOffsets.readUInt32LE(cx.strOffBase + i * 4); return cstr(cx.str, off); }
function addrx(cx, i) { if (!cx.addr) return null; return Number(cx.addr.readBigUInt64LE(cx.addrBase + i * 8)); }

/** Parse .debug_info into a list of functions { name, low, high } and the CU metadata. */
function parseInfo(sections) {
  const info = sections['.debug_info']; if (!info) return null;
  const abbrevSec = sections['.debug_abbrev'];
  const cx = { str: sections['.debug_str'], lineStr: sections['.debug_line_str'], strOffsets: sections['.debug_str_offsets'], addr: sections['.debug_addr'], strOffBase: 8, addrBase: 8, addrSize: 8 };
  const functions = []; const units = []; let o = 0;
  while (o + 11 <= info.length) {
    const unitLen = info.readUInt32LE(o); if (unitLen === 0 || unitLen === 0xffffffff) break; // 64-bit DWARF not handled
    const unitEnd = o + 4 + unitLen; const version = info.readUInt16LE(o + 4);
    let p, abbrevOff, addrSize;
    if (version >= 5) { addrSize = info[o + 7]; abbrevOff = info.readUInt32LE(o + 8); p = o + 12; }
    else { abbrevOff = info.readUInt32LE(o + 6); addrSize = info[o + 10]; p = o + 11; }
    cx.addrSize = addrSize;
    const abbrev = abbrevSec ? parseAbbrev(abbrevSec, abbrevOff) : {};
    let cuName = null, producer = null;
    while (p < unitEnd) {
      const code = leb(info, p); p = code.o; if (code.v === 0) continue; // null DIE (end of siblings)
      const ab = abbrev[code.v]; if (!ab) break;
      let low = null, high = null, name = null, highIsOffset = false;
      for (const [at, form, implicit] of ab.attrs) {
        const r = readForm(info, p, form, implicit, cx); p = r.o;
        if (at === AT.name) name = r.v; else if (at === AT.low_pc) low = r.v;
        else if (at === AT.high_pc) { high = r.v; highIsOffset = form !== 0x01; } // constant class -> offset from low_pc
        else if (at === AT.producer) producer = r.v; else if (at === AT.comp_dir || at === AT.str_offsets_base || at === AT.addr_base) { /* kept default */ }
      }
      if (ab.tag === TAG.compile_unit && name) cuName = name;
      if (ab.tag === TAG.subprogram && name && low != null) functions.push({ name, low, high: high == null ? null : (highIsOffset ? low + high : high) });
    }
    units.push({ version, name: cuName, producer });
    o = unitEnd;
  }
  return { functions, units };
}

/** Collect the .debug_* sections of an ELF (name -> Buffer slice) and parse DWARF from them. */
function readDwarf(buf, sections) {
  const map = {};
  for (const s of sections) if (s.name && s.name.startsWith('.debug_') && s.off != null && s.size) map[s.name] = buf.subarray(s.off, s.off + s.size);
  if (!map['.debug_info']) return null;
  return parseInfo(map);
}

export { readDwarf, parseInfo, parseAbbrev };
