/**
 * Mach-O security metadata: the code-signature contents and the modern loader features.
 *   - the embedded code signature (LC_CODE_SIGNATURE): present or not, its size, whether it is
 *     ad-hoc (unsigned, self-hash only), whether the Hardened Runtime flag is set, and the keys
 *     of the embedded entitlements plist (what the process is allowed to do);
 *   - whether the binary uses chained fixups (LC_DYLD_CHAINED_FIXUPS) and an exports trie.
 * The code-signature SuperBlob is big-endian. The signature is read, never verified.
 */

const CSMAGIC_EMBEDDED = 0xfade0cc0;
const CSMAGIC_CODEDIRECTORY = 0xfade0c02;
const CSMAGIC_ENTITLEMENTS = 0xfade7171;
const CSMAGIC_DER_ENTITLEMENTS = 0xfade7172;
const CS_ADHOC = 0x2;
const CS_RUNTIME = 0x10000;

/**
 * @param {Buffer} b
 * @param {{codeSig:{dataoff:number,datasize:number}|null, chainedFixups:boolean, exportsTrie:boolean}} lc
 */
function readMachoSecurity(b, lc) {
  const out = {};
  if (lc.chainedFixups) out.chainedFixups = true;
  if (lc.exportsTrie) out.exportsTrie = true;
  if (lc.codeSig && lc.codeSig.dataoff) {
    const sig = { present: true, size: lc.codeSig.datasize, adhoc: false, hardenedRuntime: false, entitlementKeys: [] };
    try {
      const base = lc.codeSig.dataoff;
      const be = (o) => b.readUInt32BE(o);
      if (base + 12 <= b.length && be(base) === CSMAGIC_EMBEDDED) {
        const count = be(base + 8);
        for (let i = 0; i < count && i < 64; i += 1) {
          const ix = base + 12 + i * 8; if (ix + 8 > b.length) break;
          const blobOff = base + be(ix + 4); if (blobOff + 8 > b.length) continue;
          const magic = be(blobOff);
          if (magic === CSMAGIC_CODEDIRECTORY) { const flags = be(blobOff + 12); sig.adhoc = Boolean(flags & CS_ADHOC); sig.hardenedRuntime = Boolean(flags & CS_RUNTIME); sig.codeDirectoryFlags = `0x${flags.toString(16)}`; }
          else if (magic === CSMAGIC_ENTITLEMENTS) { const len = be(blobOff + 4); const xml = b.toString('utf8', blobOff + 8, Math.min(blobOff + len, b.length)); const keys = [...xml.matchAll(/<key>([^<]+)<\/key>/g)].map((m) => m[1]); sig.entitlementKeys = keys; }
          else if (magic === CSMAGIC_DER_ENTITLEMENTS) { sig.derEntitlements = true; }
        }
      }
    } catch { /* malformed signature: presence still reported */ }
    out.codeSignature = sig;
  }
  return Object.keys(out).length ? out : null;
}

export { readMachoSecurity };
