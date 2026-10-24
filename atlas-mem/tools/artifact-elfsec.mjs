/**
 * ELF security / provenance metadata, read from the notes and version sections:
 *   - build id: the .note.gnu.build-id note (what a symbol server keys on);
 *   - GNU program properties: whether the toolchain marked the binary for Intel CET (IBT,
 *     shadow stack) on x86-64, or for AArch64 BTI / PAC — the hardware control-flow hardening;
 *   - symbol versioning: the libraries and versions the binary needs (.gnu.version_r), which
 *     pin the minimum glibc / library versions it will load against.
 * Little-endian ELF only (the common case); nothing is executed.
 */

const SHT_NOTE = 7;

function note(b, off, size) {
  const out = [];
  let p = off; const end = Math.min(off + size, b.length);
  while (p + 12 <= end) {
    const namesz = b.readUInt32LE(p), descsz = b.readUInt32LE(p + 4), type = b.readUInt32LE(p + 8);
    const nameOff = p + 12; const descOff = nameOff + ((namesz + 3) & ~3);
    const name = namesz ? b.toString('latin1', nameOff, nameOff + namesz - 1) : '';
    out.push({ type, name, descOff, descsz });
    p = descOff + ((descsz + 3) & ~3);
    if (descsz === 0 && namesz === 0) break;
  }
  return out;
}

/** @param {Buffer} b @param {Array<{name:string,type:number,off:number,size:number,link:number,entsize:number}>} sections */
function readElfSecurity(b, sections, is64) {
  const out = {};
  const byName = (n) => sections.find((s) => s.name === n);

  // ---- build id ----
  try {
    const s = byName('.note.gnu.build-id') || sections.find((x) => x.type === SHT_NOTE && x.name.includes('build-id'));
    if (s) { for (const nt of note(b, s.off, s.size)) if (nt.type === 3 && nt.name === 'GNU') { out.buildId = b.toString('hex', nt.descOff, nt.descOff + nt.descsz); break; } }
  } catch { /* no build id */ }

  // ---- GNU program properties: CET (x86-64) / BTI+PAC (aarch64) ----
  try {
    const s = byName('.note.gnu.property');
    if (s) {
      for (const nt of note(b, s.off, s.size)) {
        if (nt.type !== 5 || nt.name !== 'GNU') continue; // NT_GNU_PROPERTY_TYPE_0
        let p = nt.descOff; const end = nt.descOff + nt.descsz; const align = is64 ? 8 : 4;
        while (p + 8 <= end) {
          const prType = b.readUInt32LE(p), prSz = b.readUInt32LE(p + 4); const data = p + 8;
          if (prType === 0xc0000002 && prSz >= 4) { const f = b.readUInt32LE(data); out.cet = { ibt: Boolean(f & 1), shstk: Boolean(f & 2) }; } // GNU_PROPERTY_X86_FEATURE_1_AND
          if (prType === 0xc0000000 && prSz >= 4) { const f = b.readUInt32LE(data); out.aarch64 = { bti: Boolean(f & 1), pac: Boolean(f & 2) }; } // GNU_PROPERTY_AARCH64_FEATURE_1_AND
          p = data + ((prSz + align - 1) & ~(align - 1));
        }
      }
    }
  } catch { /* no properties */ }

  // ---- symbol versioning: needed library versions (.gnu.version_r + its string table) ----
  try {
    const vr = byName('.gnu.version_r');
    if (vr && vr.link != null && sections[vr.link]) {
      const str = sections[vr.link]; const cstr = (o) => { let e = o; while (e < b.length && b[e]) e += 1; return b.toString('latin1', o, e); };
      const needs = []; let p = vr.off; let guard = 0;
      while (p + 16 <= vr.off + vr.size && guard < 256) {
        guard += 1;
        const cnt = b.readUInt16LE(p + 2), fileOff = b.readUInt32LE(p + 4), auxOff = b.readUInt32LE(p + 8), next = b.readUInt32LE(p + 12);
        const file = cstr(str.off + fileOff); const vers = [];
        let a = p + auxOff; for (let k = 0; k < cnt && k < 64; k += 1) { const nameOff = b.readUInt32LE(a + 8), aNext = b.readUInt32LE(a + 12); vers.push(cstr(str.off + nameOff)); if (!aNext) break; a += aNext; }
        needs.push({ file, versions: vers });
        if (!next) break; p += next;
      }
      if (needs.length) out.needVersions = needs;
    }
  } catch { /* no version info */ }

  return Object.keys(out).length ? out : null;
}

export { readElfSecurity, note };
