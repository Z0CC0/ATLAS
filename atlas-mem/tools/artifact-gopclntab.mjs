/**
 * ATLAS — the Go runtime's function table (`runtime.pclntab`), read from the file so a
 * stripped Go binary still names its functions. Written from the layout in the Go sources
 * (src/runtime/symtab.go `pcHeader` / `_func`, src/debug/gosym/pclntab.go `go12line`):
 *
 *   header   magic u32 | pad u8 u8 | minLC u8 | ptrSize u8 | nfunc uintptr | nfiles uintptr |
 *            textStart uintptr (1.18+) | funcnameOffset | cuOffset | filetabOffset |
 *            pctabOffset | pclnOffset          (every offset relative to the header)
 *   ftab     at pclnOffset: nfunc pairs (entry, funcoff) + one closing entry — the fields are
 *            u32 in 1.18+ (entry = offset from textStart), uintptr before (entry = address)
 *   _func    at pclnOffset + funcoff: entry (same width as above) then nameOff i32, the
 *            name being the C string at funcnameOffset + nameOff
 *
 * Magics: 0xFFFFFFF1 (1.20+), 0xFFFFFFF0 (1.18–1.19), 0xFFFFFFFA (1.16–1.17). The 1.2–1.15
 * table (0xFFFFFFFB) is recognised and reported but not read. No dependencies, nothing run.
 */

const MAGICS = [
  [0xfffffff1, 'go1.20+', true],
  [0xfffffff0, 'go1.18-1.19', true],
  [0xfffffffa, 'go1.16-1.17', false],
  [0xfffffffb, 'go1.2-1.15', null],
];

const MAX_FUNCS = 4_000_000;

const cstr = (b, o, max) => { if (o < 0 || o >= b.length) return null; let e = o; const lim = Math.min(b.length, o + max); while (e < lim && b[e] !== 0) e += 1; return b.toString('utf8', o, e); };
const printable = (s) => s.length > 0 && !/[^\x20-\x7e]/.test(s);

/** A file range to scan, from a PE section, an ELF section or a Mach-O segment. */
function ranges(sections, format) {
  const out = [];
  for (const s of sections || []) {
    const off = s.raw ?? s.off ?? s.fileoff; const size = s.rawSize ?? s.size ?? s.filesize;
    if (off == null || !size || off < 0) continue;
    out.push({ name: s.name || '', off, size });
  }
  // the named table first, then the sections where the Go linker puts it, then the rest
  const rank = (n) => {
    if (/gopclntab$/.test(n)) return 0;
    if (format === 'pe') return n === '.rdata' ? 1 : n === '.text' ? 2 : n === '.data' ? 3 : 4;
    if (format === 'elf') return n === '.rodata' ? 1 : n === '.data.rel.ro' ? 2 : n === '.text' ? 3 : 4;
    return n === '__TEXT' ? 1 : n === '__DATA_CONST' ? 2 : 3;
  };
  return out.sort((a, b) => rank(a.name) - rank(b.name));
}

/** The header at `p`, or null when the bytes do not read as one. */
function header(b, p, magicInfo) {
  const [magic, version, textStartField] = magicInfo;
  if (p + 8 > b.length) return null;
  if (b[p + 4] !== 0 || b[p + 5] !== 0) return null;
  const minLC = b[p + 6], ptrSize = b[p + 7];
  if (![1, 2, 4].includes(minLC) || ![4, 8].includes(ptrSize)) return null;
  if (textStartField === null) return { magic, version, ptrSize, minLC, readable: false };
  const nField = textStartField ? 8 : 7;
  if (p + 8 + nField * ptrSize > b.length) return null;
  const rp = (o) => (ptrSize === 8 ? Number(b.readBigUInt64LE(o)) : b.readUInt32LE(o));
  let o = p + 8; const f = [];
  for (let i = 0; i < nField; i += 1) { f.push(rp(o)); o += ptrSize; }
  const [nfunc, nfiles] = f;
  const textStart = textStartField ? f[2] : null;
  const [funcnameOffset, cuOffset, filetabOffset, pctabOffset, pclnOffset] = f.slice(textStartField ? 3 : 2);
  const room = b.length - p;
  if (!(nfunc > 0 && nfunc <= MAX_FUNCS)) return null;
  if (nfiles > MAX_FUNCS) return null;
  for (const x of [funcnameOffset, cuOffset, filetabOffset, pctabOffset, pclnOffset]) if (!(x >= 8 && x < room)) return null;
  const fieldSize = textStartField ? 4 : ptrSize;
  if (pclnOffset + (nfunc * 2 + 1) * fieldSize > room) return null;
  return { magic, version, ptrSize, minLC, readable: true, nfunc, nfiles, textStart, funcnameOffset, cuOffset, filetabOffset, pctabOffset, pclnOffset, fieldSize };
}

/** The functions of a header already validated at `p`. */
function functions(b, p, h) {
  const { ptrSize, fieldSize, nfunc, pclnOffset, funcnameOffset, textStart } = h;
  const rf = fieldSize === 4 ? (o) => b.readUInt32LE(o) : ptrSize === 8 ? (o) => Number(b.readBigUInt64LE(o)) : (o) => b.readUInt32LE(o);
  const ftab = p + pclnOffset, funcdata = p + pclnOffset, names = p + funcnameOffset;
  const out = []; let bad = 0;
  for (let i = 0; i < nfunc; i += 1) {
    const e = ftab + i * 2 * fieldSize;
    const entry = rf(e), funcoff = rf(e + fieldSize);
    const fn = funcdata + funcoff;
    if (fn + fieldSize + 4 > b.length) { bad += 1; continue; }
    if (rf(fn) !== entry) { bad += 1; continue; } // the _func repeats its entry: a mismatch is not a function
    const nameOff = b.readInt32LE(fn + fieldSize);
    const name = cstr(b, names + nameOff, 4096);
    if (!name) { bad += 1; continue; }
    const addr = textStart != null ? textStart + entry : entry;
    out.push({ name, addr });
  }
  return { functions: out, bad };
}

/**
 * The Go pclntab of a binary: `{ version, magic, offset, ptrSize, minLC, textStart, nfunc,
 * count, functions: [{ name, addr }] }` (addr is a virtual address: imageBase-relative on PE
 * once imageBase is subtracted, VA on ELF and Mach-O), or null when no table is found.
 * `textHint` is the text section's virtual address, used when the header's textStart reads 0.
 * A 1.2–1.15 table returns the same shape with count 0 and a `limitation`.
 */
function readGoPclntab(buf, sections, format, textHint) {
  if (!buf || buf.length < 16) return null;
  let legacy = null;
  const seen = new Set();
  for (const r of ranges(sections, format)) {
    const start = Math.max(0, r.off), end = Math.min(buf.length, r.off + r.size);
    if (end - start < 16) continue;
    for (const m of MAGICS) {
      const pat = Buffer.alloc(4); pat.writeUInt32LE(m[0], 0);
      let at = buf.indexOf(pat, start);
      while (at >= 0 && at + 8 <= end) {
        if ((at & 7) === 0 && !seen.has(at)) {
          seen.add(at);
          const h = header(buf, at, m);
          // 1.18+: the header's textStart is written through a relocation and reads 0 in a PIE
          // or an ASLR PE; debug/gosym uses the text section's address instead, so do we
          if (h && h.readable && h.textStart != null) { if (h.textStart === 0 && textHint != null) { h.textStart = textHint; h.textStartSource = 'text-section'; } else h.textStartSource = 'header'; }
          if (h && !h.readable) { if (!legacy) legacy = { h, at }; }
          else if (h) {
            const { functions: fns, bad } = functions(buf, at, h);
            const sample = fns.slice(0, 32);
            const ok = sample.length && sample.filter((f) => printable(f.name)).length * 2 >= sample.length && bad * 4 <= h.nfunc;
            if (ok) return { version: h.version, magic: h.magic, offset: at, ptrSize: h.ptrSize, minLC: h.minLC, textStart: h.textStart, textStartSource: h.textStartSource, nfunc: h.nfunc, count: fns.length, functions: fns, unreadable: bad || undefined };
          }
        }
        at = buf.indexOf(pat, at + 1);
      }
    }
  }
  if (legacy) return { version: legacy.h.version, magic: legacy.h.magic, offset: legacy.at, ptrSize: legacy.h.ptrSize, minLC: legacy.h.minLC, textStart: null, nfunc: null, count: 0, functions: [], limitation: 'pclntab in the Go 1.2-1.15 layout (magic 0xFFFFFFFB): recognised, not read' };
  return null;
}

export { readGoPclntab };
