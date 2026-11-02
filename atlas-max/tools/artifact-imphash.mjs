/**
 * Import hash: a fingerprint of a binary's import table, the way malware-triage tools key on it.
 * For a PE it follows the pefile convention — each imported function as "dll.func" (the DLL name
 * lowercased with its extension dropped, the function name lowercased), in table order, joined by
 * commas, MD5'd. Two builds of the same program linked the same way share an imphash even when the
 * code bytes differ. For an ELF/Mach-O there is no standard; a parallel hash is computed over the
 * sorted imported-symbol names and labelled as such, so it is never mistaken for a real imphash.
 */
import { createHash } from 'node:crypto';

const md5 = (s) => createHash('md5').update(s).digest('hex');

/** @param {{format:string, imports?:Array<{dll:string,names:string[]}>, imported?:string[]}} r */
function importHash(r) {
  if (r.format === 'pe' && r.imports && r.imports.length) {
    const parts = [];
    for (const imp of r.imports) {
      const dll = String(imp.dll || '').toLowerCase().replace(/\.(dll|ocx|sys|drv|exe)$/i, '');
      for (const fn of (imp.names || [])) parts.push(`${dll}.${String(fn).toLowerCase()}`);
    }
    if (!parts.length) return null;
    return { kind: 'imphash', value: md5(parts.join(',')), functions: parts.length };
  }
  const syms = r.imported;
  if (syms && syms.length) {
    const sorted = [...new Set(syms.map((s) => String(s)))].sort();
    return { kind: 'import-symbol-hash', value: md5(sorted.join(',')), functions: sorted.length };
  }
  return null;
}

export { importHash };
