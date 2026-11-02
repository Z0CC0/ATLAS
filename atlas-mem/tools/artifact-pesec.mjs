/**
 * PE security / provenance metadata, read from the bytes as they are:
 *   - the Rich header: the MSVC toolchain fingerprint Microsoft's linker stamps between the
 *     DOS stub and the PE header (product id + build + use count per tool), XOR-masked by a key;
 *   - the load-config GuardFlags: whether Control Flow Guard is actually instrumented, and
 *     whether a stack security cookie is set;
 *   - the delay-import table: DLLs loaded lazily, which the normal import table does not list;
 *   - Authenticode: whether a signature certificate is embedded, its size, and a best-effort
 *     signer common name scanned out of the PKCS#7 DER (a hint, not a verified identity).
 * Nothing is executed and no signature is verified — this reports what is present, honestly.
 */

const KNOWN_PRODID = {
  // a small, well-known slice of the comp.id product map — enough to name the common tools;
  // an id not here is still reported by number
  0x00: 'Unknown', 0x01: 'Import (linker)', 0x5e: 'Utc1900_C', 0x5f: 'Utc1900_CPP',
  0x6d: 'Utc1310_C', 0x6e: 'Utc1310_CPP', 0x83: 'Utc1400_C', 0x84: 'Utc1400_CPP',
  0x91: 'Utc1500_C', 0x92: 'Utc1500_CPP', 0x9d: 'Utc1600_C', 0x9e: 'Utc1600_CPP',
  0xaa: 'Utc1700_C', 0xab: 'Utc1700_CPP', 0xca: 'Utc1800_C', 0xcb: 'Utc1800_CPP',
  0xff: 'Utc1900', 0x105: 'Utc1900_C', 0x106: 'Utc1900_CPP',
  0x104: 'Masm', 0x102: 'Cvtres', 0x101: 'Alias',
};

/** @param {Buffer} b @param {{peOff:number, dir:(i:number)=>{rva:number,size:number}, toOff:(rva:number)=>number|null, plus:boolean, opt:number}} ctx */
function readPeSecurity(b, ctx) {
  const out = {};
  const u16 = (o) => (o + 2 <= b.length ? b.readUInt16LE(o) : 0);
  const u32 = (o) => (o + 4 <= b.length ? b.readUInt32LE(o) : 0);
  const u64 = (o) => (o + 8 <= b.length ? Number(b.readBigUInt64LE(o)) : 0);

  // ---- Rich header: look for 'Rich' (0x68636952) in the DOS stub, before the PE header ----
  try {
    let richAt = -1;
    for (let o = ctx.peOff - 4; o >= 0x40; o -= 4) { if (u32(o) === 0x68636952) { richAt = o; break; } }
    if (richAt > 0) {
      const key = u32(richAt + 4);
      let dans = -1;
      for (let o = richAt - 4; o >= 0x40; o -= 4) { if ((u32(o) ^ key) === 0x536e6144) { dans = o; break; } } // 'DanS'
      if (dans > 0) {
        const tools = [];
        for (let o = dans + 16; o + 8 <= richAt; o += 8) {
          const comp = u32(o) ^ key, count = u32(o + 4) ^ key;
          const prodId = comp >>> 16, build = comp & 0xffff;
          if (!comp && !count) continue;
          tools.push({ prodId, product: KNOWN_PRODID[prodId] || `0x${prodId.toString(16)}`, build, count });
        }
        out.rich = { key: `0x${key.toString(16)}`, tools };
      }
    }
  } catch { /* no rich header */ }

  // ---- load config (data directory 10): Control Flow Guard and the security cookie ----
  try {
    const lc = ctx.dir(10);
    if (lc.rva) {
      const o = ctx.toOff(lc.rva);
      if (o != null) {
        const size = u32(o);
        const p = ctx.plus;
        const cookie = p ? u64(o + 0x58) : u32(o + 0x3c); // SecurityCookie
        // GuardFlags sits after the CF function-table fields; present only on a large-enough struct
        const guardOff = p ? o + 0x90 : o + 0x50;
        const guardFlags = size > (guardOff - o) ? u32(guardOff) : 0;
        const cfgInstrumented = Boolean(guardFlags & 0x100);
        const cfgFuncTable = Boolean(guardFlags & 0x400);
        const rfInstrumented = Boolean(guardFlags & 0x00020000); // return-flow / shadow-stack aware
        out.loadConfig = { size, securityCookie: cookie ? `0x${cookie.toString(16)}` : null, guardFlags: `0x${guardFlags.toString(16)}`, cfgInstrumented, cfgFunctionTable: cfgFuncTable, rfInstrumented };
      }
    }
  } catch { /* no load config */ }

  // ---- delay-import table (data directory 13): DLLs loaded lazily ----
  try {
    const di = ctx.dir(13);
    if (di.rva) {
      let o = ctx.toOff(di.rva);
      const dlls = [];
      for (let k = 0; o != null && k < 512; k += 1, o += 32) {
        const attrs = u32(o), nameRva = u32(o + 4);
        if (!nameRva && !attrs) break;
        if (!nameRva) continue;
        // when Attributes bit0 is set the RVAs are real RVAs; legacy tables stored VAs — handle both
        const nameOff = ctx.toOff((attrs & 1) ? nameRva : (nameRva - 0) /* best effort */);
        if (nameOff == null) continue;
        let name = ''; for (let i = 0; i < 256 && nameOff + i < b.length && b[nameOff + i]; i += 1) name += String.fromCharCode(b[nameOff + i]);
        if (name) dlls.push(name);
      }
      if (dlls.length) out.delayImports = dlls;
    }
  } catch { /* no delay imports */ }

  // ---- Authenticode (data directory 4): the certificate table is a FILE offset, not an RVA ----
  try {
    const sec = ctx.dir(4);
    if (sec.rva && sec.size) {
      const o = sec.rva; // already a file offset for this directory
      const certLen = u32(o), rev = u16(o + 4), type = u16(o + 6);
      const der = b.subarray(o + 8, Math.min(o + certLen, b.length));
      // best-effort signer CN: find the commonName OID (06 03 55 04 03) then the next DER string
      let signer = null;
      for (let i = 0; i + 5 < der.length; i += 1) {
        if (der[i] === 0x06 && der[i + 1] === 0x03 && der[i + 2] === 0x55 && der[i + 3] === 0x04 && der[i + 4] === 0x03) {
          const tag = der[i + 5]; // 0x13 printable, 0x0c utf8, 0x16 ia5
          if (tag === 0x13 || tag === 0x0c || tag === 0x16) { const len = der[i + 6]; if (len > 0 && len < 128 && i + 7 + len <= der.length) { signer = der.subarray(i + 7, i + 7 + len).toString('latin1'); break; } }
        }
      }
      out.authenticode = { present: true, size: sec.size, revision: `0x${rev.toString(16)}`, type, signerHint: signer };
    }
  } catch { /* no signature */ }

  return Object.keys(out).length ? out : null;
}

export { readPeSecurity, KNOWN_PRODID };
