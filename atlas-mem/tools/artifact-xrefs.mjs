/**
 * String cross-references: which function points at which string literal. Strings are the most
 * legible thing in a stripped binary — an error message, a URL, a format string names what the
 * code around it does. This finds, for each enumerated function, the string constants whose
 * address it materialises:
 *   - x86-64: `lea reg, [rip+disp]` (the normal way a PIC binary takes a .rodata address) and
 *     `mov reg, imm64` (an absolute address);
 *   - ARM64: the `adrp reg, page` + `add reg, reg, #off` pair that builds a full address.
 * An address that lands on the start of a known string is an edge. Honest: only these direct
 * address-forming patterns are read; a string reached through a table, a GOT slot or a computed
 * offset is not attributed, and nothing is executed.
 */

/** Printable-ASCII string literals with their virtual address, from the data sections. */
function extractStrings(buf, dataSections, minLen) {
  minLen = minLen || 4;
  const out = [];
  for (const s of dataSections) {
    const start = s.off, end = Math.min(s.off + s.size, buf.length), base = s.va;
    if (base == null) continue;
    let i = start;
    while (i < end) {
      let j = i;
      while (j < end && buf[j] >= 0x20 && buf[j] < 0x7f) j += 1;
      const len = j - i;
      if (len >= minLen && (j >= end || buf[j] === 0)) out.push({ va: base + (i - start), off: i, text: buf.toString('latin1', i, j) });
      i = (j > i ? j : i + 1);
      while (i < end && buf[i] === 0) i += 1; // skip the terminator run
    }
  }
  return out;
}

/**
 * @param {object} p
 * @param {'x86-64'|'arm64'} p.arch
 * @param {Array<{va:number, off:number, end:number, name?:string}>} p.entries
 * @param {(pos:number)=>({addr:number,len:number,text:string,mnem:string,bad?:boolean}|null)} p.decodeAt
 * @param {(off:number)=>number|null} p.offToVa
 * @param {Map<number,number>} p.strByVa  string start VA -> index into the string list
 * @param {number} [p.maxBytes]
 */
function buildStringXrefs(p) {
  const maxBytes = p.maxBytes || 8 * 1024 * 1024;
  const byFunc = new Map(); // funcIdx -> Set(strIdx)
  const byStr = new Map();  // strIdx  -> Set(funcIdx)
  const link = (fi, si) => {
    if (!byFunc.has(fi)) byFunc.set(fi, new Set()); byFunc.get(fi).add(si);
    if (!byStr.has(si)) byStr.set(si, new Set()); byStr.get(si).add(fi);
  };
  let scanned = 0, truncated = false;
  for (let fi = 0; fi < p.entries.length; fi += 1) {
    if (scanned >= maxBytes) { truncated = true; break; }
    const e = p.entries[fi];
    let pos = e.off; const stop = e.end;
    const adrp = new Map(); // reg -> page base VA, for the arm64 adrp+add pair
    let guard = 0;
    while (pos < stop && guard < 200000) {
      guard += 1;
      const d = p.decodeAt(pos); if (!d) break;
      const len = Math.max(1, d.len); scanned += len;
      if (!d.bad) {
        let targetVa = null;
        if (p.arch === 'x86-64') {
          if (d.mnem === 'lea') { const m = /\[rip([+-])0x([0-9a-f]+)\]/.exec(d.text); if (m) { const disp = parseInt(m[2], 16) * (m[1] === '-' ? -1 : 1); const va = p.offToVa(pos); if (va != null) targetVa = va + len + disp; } }
          else if (d.mnem === 'mov') { const m = /,\s*0x([0-9a-f]{6,})$/.exec(d.text); if (m) targetVa = parseInt(m[1], 16); }
        } else { // arm64
          if (d.mnem === 'adrp') { const m = /^adrp\s+(x\d+),\s*\.([+-])0x([0-9a-f]+)/.exec(d.text); if (m) { const va = p.offToVa(pos); if (va != null) adrp.set(m[1], (va - (va % 0x1000)) + parseInt(m[3], 16) * (m[2] === '-' ? -1 : 1)); /* no bitwise: a Mach-O VA sits above 2^32 */ } }
          else if (d.mnem === 'add') { const m = /^add\s+(x\d+),\s*(x\d+),\s*0x([0-9a-f]+)/.exec(d.text); if (m && m[1] === m[2] && adrp.has(m[2])) targetVa = adrp.get(m[2]) + parseInt(m[3], 16); }
          else if (d.mnem === 'ldr' || d.mnem === 'str') { const m = /,\s*(x\d+)\]/.exec(d.text); if (m) adrp.delete(m[1]); } // reg reused as a base: its page value is spent
        }
        if (targetVa != null && p.strByVa.has(targetVa)) link(fi, p.strByVa.get(targetVa));
      }
      pos += len;
    }
  }
  return { byFunc, byStr, truncated, scannedBytes: scanned };
}

export { extractStrings, buildStringXrefs };
