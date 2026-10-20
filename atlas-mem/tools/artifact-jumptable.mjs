/**
 * ATLAS — recover a switch jump table behind an indirect jump (x86-64). Compilers lower a
 * dense switch to a table of code addresses (MSVC: a table of absolute 8-byte pointers read by
 * `jmp [base+idx*8]`) or a table of 4-byte offsets relative to the table (GCC/Clang PIC:
 * `movsxd off,[base+idx*4]; add target,base; jmp target`). This reads the table from the image
 * and returns the case targets. It is deliberately conservative: if the pattern or the bound is
 * not clear, or any entry would land outside the code, it returns null and the caller leaves the
 * CFG untouched. Nothing is executed.
 */

// parse a `lea reg, [rip+0xNN]` (or -0xNN) -> { reg, disp }
const LEA_RIP = /^lea\s+(\w+),\s*\[rip([+-]0x[0-9a-f]+)\]/;
// a table read: `movsxd t, [base+idx*4]` / `mov t, [base+idx*4]` (4-byte offset table)
const LOAD4 = /^(?:movsxd|mov)\s+(\w+),\s*\[(\w+)\+(\w+)\*4\]/;
// an absolute-pointer jump: `jmp [base+idx*8]` or `jmp qword [base+idx*8]`
const JMP8 = /^jmp\s+(?:qword\s+)?\[(\w+)\+(\w+)\*8\]/;
// a bound: `cmp idx, 0xNN` just before a `ja`/`jae`/`jnbe` guards 0..NN
const CMP = /^cmp\s+(\w+),\s*(0x[0-9a-f]+|\d+)/;

/**
 * @param insns array of { addr, len, text } for one function (addr = VA), in order
 * @param ctx   { readI32(va), readU64(va), codeLo, codeHi }
 * @param jmpAddr VA of the indirect `jmp reg` (or the `jmp [..]`) that ends the block
 * Returns { tableVA, kind, count, targets:[VA] } or null.
 */
function resolveJumpTable(insns, ctx, jmpAddr) {
  const idx = insns.findIndex((i) => i.addr === jmpAddr); if (idx < 0) return null;
  const jmp = insns[idx];
  // look back a short window for the table base and the index bound
  const lo = Math.max(0, idx - 12); const win = insns.slice(lo, idx + 1);
  const leaByReg = {}; // reg -> tableVA
  let bound = null;
  for (const i of win) {
    const m = LEA_RIP.exec(i.text); if (m) { leaByReg[m[1]] = (i.addr + i.len + parseInt(m[2], 16)) >>> 0; continue; }
    const c = CMP.exec(i.text); if (c) bound = (c[2].startsWith('0x') ? parseInt(c[2], 16) : Number(c[2])) + 1; // 0..N inclusive
  }
  const cap = bound && bound > 0 && bound <= 4096 ? bound : 256;
  const inCode = (va) => va >= ctx.codeLo && va < ctx.codeHi;
  // absolute pointer table: jmp [base+idx*8]
  const a = JMP8.exec(jmp.text);
  if (a && leaByReg[a[1]] != null) {
    const tableVA = leaByReg[a[1]]; const targets = [];
    for (let i = 0; i < cap; i += 1) { const t = ctx.readU64(tableVA + i * 8); if (t == null || !inCode(t)) break; targets.push(t); }
    if (targets.length) return { tableVA, kind: 'abs64', count: targets.length, targets };
    return null;
  }
  // relative 4-byte offset table: a movsxd from [base+idx*4] where base is the lea'd table
  if (/^jmp\s+\w+$/.test(jmp.text)) {
    for (const i of win) {
      const l = LOAD4.exec(i.text); if (l && leaByReg[l[2]] != null) {
        const tableVA = leaByReg[l[2]]; const targets = [];
        for (let k = 0; k < cap; k += 1) { const off = ctx.readI32(tableVA + k * 4); if (off == null) break; const t = (tableVA + off) >>> 0; if (!inCode(t)) break; targets.push(t); }
        if (targets.length) return { tableVA, kind: 'rel32', count: targets.length, targets };
        return null;
      }
    }
  }
  return null;
}

export { resolveJumpTable };
