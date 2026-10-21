/**
 * ATLAS — compiled artifacts read from their headers: PE (with the .NET metadata, the
 * version resource and the manifest when present), ELF, Mach-O, and what Go and Rust
 * leave in any of them. Nothing is disassembled here and nothing is run: these are the
 * tables the loader reads, read the same way, so every fact has a file offset.
 *
 * Every reader returns `{ format, ...facts, limitations: [] }` or throws with a message
 * the caller turns into a record error.
 */

import { inflateSync } from 'node:zlib';
import * as cil from './artifact-cil.mjs';
import { demangle } from './artifact-demangle.mjs';

const u8 = (b, o) => b[o];
const u16 = (b, o) => b.readUInt16LE(o);
const u32 = (b, o) => b.readUInt32LE(o);
const u64 = (b, o) => Number(b.readBigUInt64LE(o));
const cstr = (b, o, max) => { let e = o; const lim = Math.min(b.length, o + (max || 4096)); while (e < lim && b[e] !== 0) e += 1; return b.toString('utf8', o, e); };
const fixed = (b, o, n) => { const s = b.toString('latin1', o, o + n); const z = s.indexOf('\0'); return z < 0 ? s : s.slice(0, z); };

// ---------------------------------------------------------------- PE

const MACHINES = { 0x14c: 'x86', 0x8664: 'x86-64', 0x1c0: 'arm', 0xaa64: 'arm64', 0x5032: 'riscv32', 0x5064: 'riscv64', 0x6264: 'loongarch64', 0x200: 'ia64' };
const SUBSYSTEMS = { 1: 'native', 2: 'windows-gui', 3: 'windows-cui', 9: 'windows-ce', 10: 'efi-application', 16: 'windows-boot' };
const DLL_CHARS = [[0x20, 'high-entropy-va'], [0x40, 'dynamic-base'], [0x80, 'force-integrity'], [0x100, 'nx-compat'], [0x200, 'no-isolation'], [0x400, 'no-seh'], [0x800, 'no-bind'], [0x1000, 'app-container'], [0x2000, 'wdm-driver'], [0x4000, 'control-flow-guard'], [0x8000, 'terminal-server-aware']];

function readPe(b, opts) {
  if (b.length < 0x40 || u16(b, 0) !== 0x5a4d) throw new Error('not a PE file (no MZ)');
  const peOff = u32(b, 0x3c);
  if (peOff + 24 > b.length || u32(b, peOff) !== 0x4550) throw new Error('not a PE file (no PE signature)');
  const coff = peOff + 4;
  const machine = u16(b, coff), nSections = u16(b, coff + 2), timestamp = u32(b, coff + 4), optSize = u16(b, coff + 16), characteristics = u16(b, coff + 18);
  const opt = coff + 20;
  const magic = u16(b, opt);
  const plus = magic === 0x20b;
  if (magic !== 0x10b && !plus) throw new Error(`unknown optional header magic 0x${magic.toString(16)}`);
  const entry = u32(b, opt + 16);
  const imageBase = plus ? u64(b, opt + 24) : u32(b, opt + 28);
  const subsystem = u16(b, opt + 68), dllChars = u16(b, opt + 70);
  const nDirs = u32(b, opt + (plus ? 108 : 92));
  const dirBase = opt + (plus ? 112 : 96);
  const dir = (i) => (i < nDirs ? { rva: u32(b, dirBase + i * 8), size: u32(b, dirBase + i * 8 + 4) } : { rva: 0, size: 0 });
  const secBase = opt + optSize;
  const sections = [];
  for (let i = 0; i < nSections; i += 1) {
    const s = secBase + i * 40;
    if (s + 40 > b.length) break;
    const ch = u32(b, s + 36);
    sections.push({ name: fixed(b, s, 8), vaddr: u32(b, s + 12), vsize: u32(b, s + 8), raw: u32(b, s + 20), rawSize: u32(b, s + 16), flags: [(ch & 0x20) ? 'code' : null, (ch & 0x40) ? 'data' : null, (ch & 0x80) ? 'bss' : null, (ch & 0x20000000) ? 'exec' : null, (ch & 0x40000000) ? 'read' : null, (ch & 0x80000000) ? 'write' : null].filter(Boolean) });
  }
  const toOff = (rva) => { for (const s of sections) if (rva >= s.vaddr && rva < s.vaddr + Math.max(s.vsize, s.rawSize)) return s.raw + (rva - s.vaddr); return null; };
  const limitations = [];
  // imports, and the import address table (the slot RVA a `call [rip+x]` lands on -> name)
  const imports = [];
  const iat = []; // { rva, name } for each imported function's IAT slot
  const imp = dir(1);
  if (imp.rva) {
    let d = toOff(imp.rva);
    for (let k = 0; d !== null && d + 20 <= b.length && k < 512; k += 1, d += 20) {
      const nameRva = u32(b, d + 12), oft = u32(b, d), ftRva = u32(b, d + 16);
      if (!nameRva && !ftRva) break;
      const nameOff = toOff(nameRva);
      const dll = nameOff !== null ? cstr(b, nameOff, 256) : `?rva=${nameRva}`;
      const shortDll = dll.replace(/\.dll$/i, '');
      const names = [];
      let t = toOff(oft || ftRva);
      for (let j = 0; t !== null && j < 4096; j += 1) {
        const v = plus ? (t + 8 <= b.length ? b.readBigUInt64LE(t) : 0n) : BigInt(t + 4 <= b.length ? u32(b, t) : 0);
        if (v === 0n) break;
        let fn;
        if (plus ? (v >> 63n) & 1n : (v >> 31n) & 1n) fn = `#${Number(v & 0xffffn)}`;
        else { const h = toOff(Number(v & 0x7fffffffn)); fn = h !== null ? cstr(b, h + 2, 512) : '?'; }
        names.push(fn);
        if (iat.length < 20000) iat.push({ rva: ftRva + j * (plus ? 8 : 4), name: `${shortDll}!${fn}` });
        t += plus ? 8 : 4;
      }
      imports.push({ dll, count: names.length, names });
    }
  }
  // exports
  let exportsOut = null;
  const exp = dir(0);
  if (exp.rva) {
    const e = toOff(exp.rva);
    if (e !== null && e + 40 <= b.length) {
      const nameOff = toOff(u32(b, e + 12)), nNames = u32(b, e + 24), namesRva = toOff(u32(b, e + 32));
      const eatRva = toOff(u32(b, e + 28)), ordsRva = toOff(u32(b, e + 36)); // address table and name-ordinal table
      const names = [];
      const addrs = []; // { rva, name } for each named export, so a call to its address resolves
      if (namesRva !== null) for (let i = 0; i < Math.min(nNames, 20000); i += 1) {
        const o = toOff(u32(b, namesRva + i * 4)); if (o === null) continue;
        const nm = cstr(b, o, 512); names.push(nm);
        if (eatRva !== null && ordsRva !== null && ordsRva + i * 2 + 2 <= b.length) { const ord = b.readUInt16LE(ordsRva + i * 2); if (eatRva + ord * 4 + 4 <= b.length) { const fnRva = u32(b, eatRva + ord * 4); if (fnRva && addrs.length < 20000) addrs.push({ rva: fnRva, name: nm }); } }
      }
      exportsOut = { name: nameOff !== null ? cstr(b, nameOff, 256) : null, functions: u32(b, e + 20), named: nNames, names: names.slice(0, 2000), addrs };
      if (nNames > 2000) limitations.push(`exports: ${nNames} names, the first 2,000 listed`);
    }
  }
  // CLR
  const clr = dir(14);
  let dotnet = null;
  if (clr.rva) { try { dotnet = readClr(b, toOff(clr.rva), toOff, limitations, opts && opts.clr); } catch (e) { limitations.push(`.NET metadata not read: ${e.message}`); } }
  // resources: version info and manifest
  let version = null, manifest = null;
  const res = dir(2);
  if (res.rva) { try { ({ version, manifest } = readResources(b, toOff(res.rva), toOff)); } catch (e) { limitations.push(`resources not read: ${e.message}`); } }
  const secFlags = sections.filter((s) => s.flags.includes('exec') && s.flags.includes('write')).map((s) => s.name);
  const hardening = {
    aslr: Boolean(dllChars & 0x40), highEntropy: Boolean(dllChars & 0x20), nx: Boolean(dllChars & 0x100), cfg: Boolean(dllChars & 0x4000), seh: !(dllChars & 0x400) && machine === 0x14c ? 'safeseh-unknown' : undefined, writableCode: secFlags,
    authenticode: dir(4).size > 0, relocations: dir(5).size > 0,
  };
  // a reproducible build (every .NET assembly, many others) stores a hash where the loader
  // expects a date; a year past next year is that, not a date
  const stampDate = timestamp ? new Date(timestamp * 1000) : null;
  const stampIsHash = stampDate && stampDate.getUTCFullYear() > new Date().getUTCFullYear() + 1;
  if (stampIsHash) limitations.push('the timestamp field holds a build hash, not a date (reproducible build)');
  // x64 exception directory (.pdata): a RUNTIME_FUNCTION table that bounds every function —
  // [beginRVA, endRVA) — so functions can be enumerated even with no symbols
  let pdata = null;
  const exc = dir(3);
  if (exc.rva && exc.size && plus) {
    let d = toOff(exc.rva); const n = Math.floor(exc.size / 12); const funcs = [];
    for (let k = 0; d !== null && k < n && d + 12 <= b.length; k += 1, d += 12) { const begin = u32(b, d), endA = u32(b, d + 4); if (!begin) continue; funcs.push({ begin, end: endA, size: endA - begin }); }
    if (funcs.length) pdata = { count: funcs.length, functions: funcs };
  }
  return {
    format: 'pe', machine: MACHINES[machine] || `0x${machine.toString(16)}`, pe32plus: plus, timestamp: stampDate && !stampIsHash ? stampDate.toISOString() : null, timestampRaw: timestamp, entry, imageBase, subsystem: SUBSYSTEMS[subsystem] || subsystem,
    dll: Boolean(characteristics & 0x2000), dllCharacteristics: DLL_CHARS.filter(([f]) => dllChars & f).map(([, n]) => n), hardening, sections, imports, iat, exports: exportsOut, pdata, dotnet, version, manifest, limitations,
  };
}

/** The RT_VERSION string table and the RT_MANIFEST text, by walking the resource tree. */
function readResources(b, root, toOff) {
  if (root === null) return { version: null, manifest: null };
  const entriesOf = (dirOff) => { if (dirOff + 16 > b.length) return []; const n = u16(b, dirOff + 12) + u16(b, dirOff + 14); const out = []; for (let i = 0; i < Math.min(n, 4096); i += 1) { const e = dirOff + 16 + i * 8; if (e + 8 > b.length) break; out.push({ id: u32(b, e), off: u32(b, e + 4) }); } return out; };
  const leafOf = (typeId) => { const t = entriesOf(root).find((e) => (e.id & 0x80000000) === 0 && e.id === typeId); if (!t) return null; const names = entriesOf(root + (t.off & 0x7fffffff)); if (!names.length) return null; const langs = entriesOf(root + (names[0].off & 0x7fffffff)); if (!langs.length) return null; const leaf = root + (langs[0].off & 0x7fffffff); if (leaf + 16 > b.length) return null; const off = toOff(u32(b, leaf)); const size = u32(b, leaf + 4); return off === null ? null : b.subarray(off, Math.min(b.length, off + size)); };
  let version = null, manifest = null;
  const v = leafOf(16);
  if (v) {
    // VS_VERSIONINFO: find the StringFileInfo children; each String is wLength, wValueLength, wType, szKey, padding, value (UTF-16)
    const text = v.toString('utf16le');
    const out = {};
    for (const key of ['CompanyName', 'FileDescription', 'FileVersion', 'InternalName', 'LegalCopyright', 'OriginalFilename', 'ProductName', 'ProductVersion']) {
      const i = text.indexOf(key + '\0');
      if (i < 0) continue;
      let j = i + key.length + 1; while (j < text.length && text.charCodeAt(j) === 0) j += 1;
      const e = text.indexOf('\0', j);
      if (e > j) out[key] = text.slice(j, e);
    }
    const fixedIdx = v.indexOf(Buffer.from([0xbd, 0x04, 0xef, 0xfe]));
    if (fixedIdx >= 0 && fixedIdx + 52 <= v.length) { const ms = u32(v, fixedIdx + 8), ls = u32(v, fixedIdx + 12); out.fileVersionFixed = `${ms >>> 16}.${ms & 0xffff}.${ls >>> 16}.${ls & 0xffff}`; }
    version = Object.keys(out).length ? out : null;
  }
  const m = leafOf(24);
  if (m) {
    const s = m.toString('utf8').replace(/^﻿/, '');
    const level = /requestedExecutionLevel[^>]*level\s*=\s*["']([^"']+)["']/.exec(s)?.[1] || null;
    const dpi = /<dpiAware[^>]*>([^<]+)</.exec(s)?.[1] || null;
    manifest = { bytes: m.length, requestedExecutionLevel: level, dpiAware: dpi, longPathAware: /longPathAware[^>]*>\s*true/i.test(s), supportedOS: (s.match(/Id="\{[^}]+\}"/g) || []).length };
  }
  return { version, manifest };
}

// ---------------------------------------------------------------- .NET metadata (ECMA-335 II.22–24)

/** Column kinds: n = fixed bytes, S/G/B = heap index, T:<n> = index into table n, C:<group> = coded index. */
const CODED = {
  TypeDefOrRef: [2, [0x02, 0x01, 0x1b]], HasConstant: [2, [0x04, 0x08, 0x17]], HasCustomAttribute: [5, [0x06, 0x04, 0x01, 0x02, 0x08, 0x09, 0x0a, 0x00, 0x0e, 0x17, 0x14, 0x11, 0x1a, 0x1b, 0x20, 0x23, 0x26, 0x27, 0x28, 0x2a, 0x2c]],
  HasFieldMarshal: [1, [0x04, 0x08]], HasDeclSecurity: [2, [0x02, 0x06, 0x20]], MemberRefParent: [3, [0x02, 0x01, 0x1a, 0x06, 0x1b]], HasSemantics: [1, [0x14, 0x11]], MethodDefOrRef: [1, [0x06, 0x0a]],
  MemberForwarded: [1, [0x04, 0x06]], Implementation: [2, [0x26, 0x23, 0x27]], CustomAttributeType: [3, [null, null, 0x06, 0x0a, null]], ResolutionScope: [2, [0x00, 0x1a, 0x23, 0x01]], TypeOrMethodDef: [1, [0x02, 0x06]],
};
const SCHEMA = {
  0x00: ['Module', [2, 'S', 'G', 'G', 'G']], 0x01: ['TypeRef', ['C:ResolutionScope', 'S', 'S']], 0x02: ['TypeDef', [4, 'S', 'S', 'C:TypeDefOrRef', 'T:0x04', 'T:0x06']], 0x03: ['FieldPtr', ['T:0x04']], 0x04: ['Field', [2, 'S', 'B']], 0x05: ['MethodPtr', ['T:0x06']],
  0x06: ['MethodDef', [4, 2, 2, 'S', 'B', 'T:0x08']], 0x07: ['ParamPtr', ['T:0x08']], 0x08: ['Param', [2, 2, 'S']], 0x09: ['InterfaceImpl', ['T:0x02', 'C:TypeDefOrRef']], 0x0a: ['MemberRef', ['C:MemberRefParent', 'S', 'B']], 0x0b: ['Constant', [1, 1, 'C:HasConstant', 'B']],
  0x0c: ['CustomAttribute', ['C:HasCustomAttribute', 'C:CustomAttributeType', 'B']], 0x0d: ['FieldMarshal', ['C:HasFieldMarshal', 'B']], 0x0e: ['DeclSecurity', [2, 'C:HasDeclSecurity', 'B']], 0x0f: ['ClassLayout', [2, 4, 'T:0x02']], 0x10: ['FieldLayout', [4, 'T:0x04']], 0x11: ['StandAloneSig', ['B']],
  0x12: ['EventMap', ['T:0x02', 'T:0x14']], 0x13: ['EventPtr', ['T:0x14']], 0x14: ['Event', [2, 'S', 'C:TypeDefOrRef']], 0x15: ['PropertyMap', ['T:0x02', 'T:0x17']], 0x16: ['PropertyPtr', ['T:0x17']], 0x17: ['Property', [2, 'S', 'B']], 0x18: ['MethodSemantics', [2, 'T:0x06', 'C:HasSemantics']],
  0x19: ['MethodImpl', ['T:0x02', 'C:MethodDefOrRef', 'C:MethodDefOrRef']], 0x1a: ['ModuleRef', ['S']], 0x1b: ['TypeSpec', ['B']], 0x1c: ['ImplMap', [2, 'C:MemberForwarded', 'S', 'T:0x1a']], 0x1d: ['FieldRVA', [4, 'T:0x04']], 0x1e: ['EncLog', [4, 4]], 0x1f: ['EncMap', [4]],
  0x20: ['Assembly', [4, 2, 2, 2, 2, 4, 'B', 'S', 'S']], 0x21: ['AssemblyProcessor', [4]], 0x22: ['AssemblyOS', [4, 4, 4]], 0x23: ['AssemblyRef', [2, 2, 2, 2, 4, 'B', 'S', 'S', 'B']], 0x24: ['AssemblyRefProcessor', [4, 'T:0x23']], 0x25: ['AssemblyRefOS', [4, 4, 4, 'T:0x23']],
  0x26: ['File', [4, 'S', 'B']], 0x27: ['ExportedType', [4, 4, 'S', 'S', 'C:Implementation']], 0x28: ['ManifestResource', [4, 4, 'S', 'C:Implementation']], 0x29: ['NestedClass', ['T:0x02', 'T:0x02']], 0x2a: ['GenericParam', [2, 2, 'C:TypeOrMethodDef', 'S']], 0x2b: ['MethodSpec', ['C:MethodDefOrRef', 'B']], 0x2c: ['GenericParamConstraint', ['T:0x2a', 'C:TypeDefOrRef']],
};

function readClr(b, off, toOff, limitations, clrOpts) {
  if (off === null || off + 72 > b.length) throw new Error('CLR header outside the file');
  const metaRva = u32(b, off + 8), metaSize = u32(b, off + 12), flags = u32(b, off + 16);
  const entryToken = u32(b, off + 20);
  const m = toOff(metaRva);
  if (m === null || u32(b, m) !== 0x424a5342) throw new Error('metadata root not found (no BSJB)');
  const verLen = u32(b, m + 12);
  const runtimeVersion = cstr(b, m + 16, verLen);
  let p = m + 16 + verLen;
  const nStreams = u16(b, p + 2); p += 4;
  const streams = {};
  for (let i = 0; i < nStreams; i += 1) { const o = u32(b, p), sz = u32(b, p + 4); let q = p + 8; const name = cstr(b, q, 32); q += Math.ceil((name.length + 1) / 4) * 4; streams[name] = { off: m + o, size: sz }; p = q; }
  const tables = streams['#~'] || streams['#-'];
  if (!tables) throw new Error('no table stream');
  const strHeap = streams['#Strings'], usHeap = streams['#US'];
  const t = tables.off;
  const heapSizes = u8(b, t + 6);
  const valid = b.readBigUInt64LE(t + 8);
  const rows = {};
  let q = t + 24;
  for (let i = 0; i < 64; i += 1) if ((valid >> BigInt(i)) & 1n) { rows[i] = u32(b, q); q += 4; }
  const sIdx = heapSizes & 1 ? 4 : 2, gIdx = heapSizes & 2 ? 4 : 2, bIdx = heapSizes & 4 ? 4 : 2;
  const tIdx = (tab) => ((rows[tab] || 0) < 65536 ? 2 : 4);
  const cIdx = (name) => { const [bits, tabs] = CODED[name]; const max = Math.max(...tabs.map((x) => (x === null ? 0 : rows[x] || 0))); return max < (1 << (16 - bits)) ? 2 : 4; };
  const colSize = (c) => (typeof c === 'number' ? c : c === 'S' ? sIdx : c === 'G' ? gIdx : c === 'B' ? bIdx : c.startsWith('T:') ? tIdx(Number(c.slice(2))) : cIdx(c.slice(2)));
  const layout = {};
  let cursor = q;
  for (let i = 0; i < 0x2d; i += 1) {
    if (!rows[i]) continue;
    const [name, cols] = SCHEMA[i] || [null, null];
    if (!cols) { limitations.push(`metadata table 0x${i.toString(16)} unknown to this reader: tables after it not read`); break; }
    const sizes = cols.map(colSize);
    const rowSize = sizes.reduce((a, c) => a + c, 0);
    layout[i] = { name, off: cursor, rowSize, sizes, cols };
    cursor += rowSize * rows[i];
  }
  const rd = (sz, o) => (sz === 2 ? u16(b, o) : sz === 4 ? u32(b, o) : u8(b, o));
  const cell = (tab, row, col) => { const L = layout[tab]; if (!L || row < 1 || row > rows[tab]) return null; let o = L.off + (row - 1) * L.rowSize; for (let i = 0; i < col; i += 1) o += L.sizes[i]; return rd(L.sizes[col], o); };
  const str = (i) => (strHeap && i < strHeap.size ? cstr(b, strHeap.off + i, 1024) : '');
  // module, assembly, references
  const moduleName = rows[0] ? str(cell(0, 1, 1)) : null;
  const assembly = rows[0x20] ? { name: str(cell(0x20, 1, 7)), version: `${cell(0x20, 1, 1)}.${cell(0x20, 1, 2)}.${cell(0x20, 1, 3)}.${cell(0x20, 1, 4)}`, culture: str(cell(0x20, 1, 8)) || null } : null;
  const assemblyRefs = [];
  for (let r = 1; r <= (rows[0x23] || 0) && r <= 2000; r += 1) assemblyRefs.push({ name: str(cell(0x23, r, 6)), version: `${cell(0x23, r, 0)}.${cell(0x23, r, 1)}.${cell(0x23, r, 2)}.${cell(0x23, r, 3)}` });
  const moduleRefs = [];
  for (let r = 1; r <= (rows[0x1a] || 0) && r <= 2000; r += 1) moduleRefs.push(str(cell(0x1a, r, 0)));
  // types and methods
  const types = [];
  const nTypes = rows[0x02] || 0, nMethods = rows[0x06] || 0;
  for (let r = 1; r <= nTypes && r <= 50000; r += 1) {
    const flags = cell(0x02, r, 0), name = str(cell(0x02, r, 1)), ns = str(cell(0x02, r, 2));
    const first = cell(0x02, r, 5), next = r < nTypes ? cell(0x02, r + 1, 5) : nMethods + 1;
    const vis = flags & 7;
    types.push({ name: ns ? `${ns}.${name}` : name, methods: Math.max(0, next - first), public: vis === 1 || vis === 2, interface: Boolean(flags & 0x20), abstract: Boolean(flags & 0x80), sealed: Boolean(flags & 0x100) });
  }
  const methodName = (r) => { const nm = str(cell(0x06, r, 3)); for (let ti = types.length - 1; ti >= 0; ti -= 1) { if (cell(0x02, ti + 1, 5) <= r) return `${types[ti].name}::${nm}`; } return nm; };
  // turning a metadata token into a name: the tables the loader reads, read the same way
  const typeRefName = (r) => { const nm = str(cell(0x01, r, 1)), ns = str(cell(0x01, r, 2)); return ns ? `${ns}.${nm}` : nm || `typeref#${r}`; };
  const typeName = (r) => (types[r - 1] ? types[r - 1].name : `type#${r}`);
  const memberRefName = (r) => {
    const v = cell(0x0a, r, 0), nm = str(cell(0x0a, r, 1)); const tags = [0x02, 0x01, 0x1a, 0x06, 0x1b]; const pt = tags[v & 7], pr = v >> 3;
    let cls = '?'; if (pt === 0x02) cls = typeName(pr); else if (pt === 0x01) cls = typeRefName(pr); else if (pt === 0x1a) cls = moduleRefs[pr - 1] || `moduleref#${pr}`; else if (pt === 0x06) cls = methodName(pr);
    return `${cls}::${nm}`;
  };
  const methodSpecName = (r) => { const v = cell(0x2b, r, 0); return (v & 1) === 0 ? methodName(v >> 1) : memberRefName(v >> 1); };
  const resolveToken = (tok) => {
    const tbl = tok >>> 24, row = tok & 0xffffff; if (!row) return `0x${tok.toString(16)}`;
    switch (tbl) {
      case 0x06: return methodName(row);
      case 0x0a: return memberRefName(row);
      case 0x01: return typeRefName(row);
      case 0x02: return typeName(row);
      case 0x04: return 'field ' + (str(cell(0x04, row, 1)) || `#${row}`);
      case 0x1b: return `typespec#${row}`;
      case 0x2b: return methodSpecName(row);
      default: return `tok(0x${tbl.toString(16)}:${row})`;
    }
  };
  const readUserString = (tok) => {
    const off = tok & 0xffffff; // the low three bytes of the ldstr token are the #US offset; 0x70 marks the heap
    if (!usHeap || off >= usHeap.size) return `str#${off}`;
    let o = usHeap.off + off; let len = u8(b, o);
    if ((len & 0x80) === 0) o += 1; else if ((len & 0xc0) === 0x80) { len = ((len & 0x3f) << 8) | u8(b, o + 1); o += 2; } else { len = ((len & 0x1f) << 24) | (u8(b, o + 1) << 16) | (u8(b, o + 2) << 8) | u8(b, o + 3); o += 4; }
    return len === 0 ? '' : b.toString('utf16le', o, o + len - 1);
  };
  // a method's signature, for the lift: how many arguments a call pops (params + a receiver
  // when the method has `this`), and whether it returns void. Read from the #Blob heap.
  const blobHeap = streams['#Blob'];
  const cblob = (p) => { const x = b[p.o]; if ((x & 0x80) === 0) { p.o += 1; return x; } if ((x & 0xc0) === 0x80) { const v = ((x & 0x3f) << 8) | b[p.o + 1]; p.o += 2; return v; } const v = ((x & 0x1f) << 24) | (b[p.o + 1] << 16) | (b[p.o + 2] << 8) | b[p.o + 3]; p.o += 4; return v; };
  const sigInfo = (blobIdx) => {
    if (!blobHeap || !blobIdx || blobIdx >= blobHeap.size) return { hasThis: false, paramCount: 0, retVoid: false };
    try { const p = { o: blobHeap.off + blobIdx }; cblob(p); const flags = b[p.o++]; const hasThis = Boolean(flags & 0x20); if (flags & 0x10) cblob(p); const pc = cblob(p); const retVoid = b[p.o] === 0x01; return { hasThis, paramCount: pc, retVoid }; } catch { return { hasThis: false, paramCount: 0, retVoid: false }; }
  };
  const methodSig = (token) => { const tbl = token >>> 24, row = token & 0xffffff; if (!row) return { hasThis: false, paramCount: 0, retVoid: false }; if (tbl === 0x06) return sigInfo(cell(0x06, row, 4)); if (tbl === 0x0a) return sigInfo(cell(0x0a, row, 2)); if (tbl === 0x2b) { const v = cell(0x2b, row, 0); return (v & 1) ? sigInfo(cell(0x0a, v >> 1, 2)) : sigInfo(cell(0x06, v >> 1, 4)); } return { hasThis: false, paramCount: 0, retVoid: false }; };
  // P/Invoke
  const pinvoke = [];
  for (let r = 1; r <= (rows[0x1c] || 0) && r <= 5000; r += 1) {
    const coded = cell(0x1c, r, 1); const tag = coded & 1, idx = coded >> 1;
    const target = tag === 1 ? methodName(idx) : `field#${idx}`;
    pinvoke.push({ method: target, entry: str(cell(0x1c, r, 2)), dll: moduleRefs[cell(0x1c, r, 3) - 1] || '?' });
  }
  // user strings
  const userStrings = [];
  if (usHeap) {
    let o = usHeap.off + 1; const end = usHeap.off + usHeap.size;
    while (o < end && userStrings.length < 20000) {
      let len = u8(b, o);
      if ((len & 0x80) === 0) o += 1; else if ((len & 0xc0) === 0x80) { len = ((len & 0x3f) << 8) | u8(b, o + 1); o += 2; } else { len = ((len & 0x1f) << 24) | (u8(b, o + 1) << 16) | (u8(b, o + 2) << 8) | u8(b, o + 3); o += 4; }
      if (len === 0) continue;
      const s = b.toString('utf16le', o, o + len - 1);
      if (s.length >= 4) userStrings.push(s);
      o += len;
    }
  }
  const entryMethod = (entryToken >>> 24) === 0x06 && (entryToken & 0xffffff) ? methodName(entryToken & 0xffffff) : null;
  const result = {
    runtimeVersion, flags: { ilOnly: Boolean(flags & 1), require32: Boolean(flags & 2), strongNameSigned: Boolean(flags & 8), nativeEntry: Boolean(flags & 0x10) }, metadataBytes: metaSize, streams: Object.keys(streams),
    module: moduleName, assembly, assemblyRefs, moduleRefs, entryMethod,
    counts: { types: nTypes, methods: nMethods, fields: rows[0x04] || 0, memberRefs: rows[0x0a] || 0, typeRefs: rows[0x01] || 0, pinvoke: pinvoke.length, userStrings: userStrings.length },
    types: types.slice(0, 500), pinvoke, userStrings: userStrings.slice(0, 300),
  };
  // CIL: decode the bodies of the methods the caller asked for. A body is tiny (header byte,
  // low two bits 0x2, size in the high six) or fat (12-byte header). IL only; native and
  // runtime methods have no byte stream to read.
  if (clrOpts && clrOpts.decodeMethods) {
    const decoded = []; let attempted = 0, full = 0; const unknown = new Set();
    const want = clrOpts.decodeMethods, max = clrOpts.max || 60;
    for (let r = 1; r <= nMethods && r <= 500000; r += 1) {
      const nm = methodName(r);
      if (!want(nm)) continue;
      if (decoded.length >= max) { decoded.truncated = true; break; }
      const rva = cell(0x06, r, 0), implFlags = cell(0x06, r, 1);
      if (!rva || (implFlags & 3) !== 0) { decoded.push({ method: nm, rva, note: 'no IL body (native, runtime or abstract)' }); continue; }
      const bo = toOff(rva);
      if (bo === null || bo >= b.length) { decoded.push({ method: nm, rva, note: 'body RVA not in any section' }); continue; }
      const b0 = b[bo]; let codeStart, codeSize, maxStack = 8, localTok = 0;
      if ((b0 & 3) === 2) { codeSize = b0 >> 2; codeStart = bo + 1; }
      else if ((b0 & 3) === 3) { maxStack = b.readUInt16LE(bo + 2); codeSize = b.readUInt32LE(bo + 4); localTok = b.readUInt32LE(bo + 8); codeStart = bo + 12; }
      else { decoded.push({ method: nm, rva, note: `unknown method-body header 0x${b0.toString(16)}` }); continue; }
      if (codeStart + codeSize > b.length) { decoded.push({ method: nm, rva, note: 'code extends past the file' }); continue; }
      attempted += 1;
      const d = cil.decode(b, codeStart, codeSize, { token: resolveToken, string: readUserString });
      if (d.complete) full += 1; else if (d.stoppedAt) unknown.add(d.stoppedAt);
      const entry = { method: nm, rva, codeSize, maxStack, localVarSigTok: localTok, count: d.instructions.length, complete: d.complete, stoppedAt: d.stoppedAt, instructions: d.instructions };
      if (clrOpts.pseudo) entry.pseudo = cil.lift(d.instructions, { sig: methodSig });
      decoded.push(entry);
    }
    result.decoded = decoded;
    result.cilCoverage = { attempted, fullyDecoded: full, percent: attempted ? Math.round((full / attempted) * 100) : null, unknownOpcodes: [...unknown], truncated: Boolean(decoded.truncated) };
  }
  return result;
}

// ---------------------------------------------------------------- ELF

const ELF_MACHINES = { 3: 'x86', 62: 'x86-64', 40: 'arm', 183: 'arm64', 243: 'riscv', 8: 'mips', 20: 'powerpc', 21: 'powerpc64', 22: 's390', 258: 'loongarch' };
const ELF_TYPES = { 1: 'relocatable', 2: 'executable', 3: 'shared-object (or PIE executable)', 4: 'core' };

function readElf(b) {
  if (b.length < 64 || b[0] !== 0x7f || b.toString('latin1', 1, 4) !== 'ELF') throw new Error('not an ELF file');
  const is64 = b[4] === 2, le = b[5] === 1;
  if (!le) throw new Error('big-endian ELF: not read by this reader');
  const r16 = (o) => b.readUInt16LE(o), r32 = (o) => b.readUInt32LE(o), r64 = (o) => Number(b.readBigUInt64LE(o)), addr = (o) => (is64 ? r64(o) : r32(o));
  const type = r16(16), machine = r16(18);
  const entry = addr(24);
  const phoff = is64 ? r64(32) : r32(28), shoff = is64 ? r64(40) : r32(32);
  const phentsize = r16(is64 ? 54 : 42), phnum = r16(is64 ? 56 : 44), shentsize = r16(is64 ? 58 : 46), shnum = r16(is64 ? 60 : 48), shstrndx = r16(is64 ? 62 : 50);
  const limitations = [];
  // program headers
  const segments = [];
  for (let i = 0; i < phnum && i < 512; i += 1) {
    const o = phoff + i * phentsize; if (o + phentsize > b.length) break;
    const pType = r32(o);
    const flags = is64 ? r32(o + 4) : r32(o + 24);
    const off = is64 ? r64(o + 8) : r32(o + 4), vaddr = is64 ? r64(o + 16) : r32(o + 8), filesz = is64 ? r64(o + 32) : r32(o + 16), memsz = is64 ? r64(o + 40) : r32(o + 20);
    segments.push({ type: { 1: 'LOAD', 2: 'DYNAMIC', 3: 'INTERP', 4: 'NOTE', 6: 'PHDR', 7: 'TLS', 0x6474e550: 'GNU_EH_FRAME', 0x6474e551: 'GNU_STACK', 0x6474e552: 'GNU_RELRO', 0x6474e553: 'GNU_PROPERTY' }[pType] || `0x${pType.toString(16)}`, off, vaddr, filesz, memsz, flags: [(flags & 4) ? 'r' : '', (flags & 2) ? 'w' : '', (flags & 1) ? 'x' : ''].join('') });
  }
  const interp = segments.find((s) => s.type === 'INTERP');
  const interpreter = interp ? cstr(b, interp.off, 256) : null;
  const toOff = (va) => { for (const s of segments) if (s.type === 'LOAD' && va >= s.vaddr && va < s.vaddr + s.filesz) return s.off + (va - s.vaddr); return null; };
  // sections
  const sections = [];
  if (shoff && shnum) {
    const raw = [];
    for (let i = 0; i < shnum && i < 4096; i += 1) { const o = shoff + i * shentsize; if (o + shentsize > b.length) break; raw.push({ nameIdx: r32(o), type: r32(o + 4), flags: addr(o + 8), addr: addr(is64 ? o + 16 : o + 12), off: is64 ? r64(o + 24) : r32(o + 16), size: is64 ? r64(o + 32) : r32(o + 20), link: r32(is64 ? o + 40 : o + 24), entsize: is64 ? r64(o + 56) : r32(o + 36) }); }
    const strtab = raw[shstrndx];
    for (const s of raw) sections.push({ ...s, name: strtab ? cstr(b, strtab.off + s.nameIdx, 128) : `#${s.nameIdx}` });
  } else limitations.push('no section headers: stripped of them; dynamic information read from the program headers only');
  // dynamic section
  const needed = []; let rpath = null, runpath = null, soname = null; let dynStrOff = null, dynStrSize = 0, symtabVa = null, syment = 0;
  const dyn = segments.find((s) => s.type === 'DYNAMIC');
  if (dyn) {
    const ent = is64 ? 16 : 8; const tags = [];
    for (let o = dyn.off; o + ent <= Math.min(b.length, dyn.off + dyn.filesz); o += ent) { const tag = is64 ? r64(o) : r32(o); const val = is64 ? r64(o + 8) : r32(o + 4); if (tag === 0) break; tags.push([tag, val]); }
    const strVa = tags.find(([t]) => t === 5)?.[1]; dynStrSize = tags.find(([t]) => t === 10)?.[1] || 0;
    dynStrOff = strVa !== undefined ? toOff(strVa) : null;
    const dstr = (i) => (dynStrOff !== null ? cstr(b, dynStrOff + i, 512) : `?${i}`);
    for (const [tag, val] of tags) { if (tag === 1) needed.push(dstr(val)); else if (tag === 14) soname = dstr(val); else if (tag === 15) rpath = dstr(val); else if (tag === 29) runpath = dstr(val); else if (tag === 6) symtabVa = val; else if (tag === 11) syment = val; }
  }
  // dynamic symbols: undefined = imported, defined = exported
  const imported = [], exported = [];
  const dynsym = sections.find((s) => s.name === '.dynsym');
  const symOff = dynsym ? dynsym.off : symtabVa !== null ? toOff(symtabVa) : null;
  const symSize = dynsym ? dynsym.size : null;
  const symEnt = dynsym ? dynsym.entsize || (is64 ? 24 : 16) : syment || (is64 ? 24 : 16);
  if (symOff !== null && dynStrOff !== null) {
    const n = symSize !== null ? Math.floor(symSize / symEnt) : 20000;
    for (let i = 1; i < n && i < 50000; i += 1) {
      const o = symOff + i * symEnt; if (o + symEnt > b.length) break;
      const nameIdx = r32(o); const info = is64 ? b[o + 4] : b[o + 12]; const shndx = is64 ? r16(o + 6) : r16(o + 14);
      if (!nameIdx) continue;
      const name = cstr(b, dynStrOff + nameIdx, 512); const kind = info & 0xf; const bind = info >> 4;
      if (kind === 4 || bind === 0) continue; // file, local
      if (shndx === 0) imported.push(name); else exported.push(name);
      if (symSize === null && name === '' ) break;
    }
  }
  // PLT resolution: map each PLT stub address to its imported symbol, via .rela.plt + .dynsym.
  // In code a `call <stub>` targets the .plt (or .plt.sec on CET builds) entry for that slot.
  const plt = [], got = [];
  const relPlt = sections.find((s) => s.name === '.rela.plt') || sections.find((s) => s.name === '.rel.plt');
  const pltSecS = sections.find((s) => s.name === '.plt.sec');
  const pltS = sections.find((s) => s.name === '.plt');
  if (relPlt && symOff !== null && dynStrOff !== null) {
    const isRela = relPlt.name === '.rela.plt';
    const entSz = isRela ? (is64 ? 24 : 12) : (is64 ? 16 : 8);
    const nrel = entSz ? Math.floor(relPlt.size / entSz) : 0;
    const stubBase = pltSecS ? pltSecS.addr : (pltS ? pltS.addr : null);
    const stubSize = pltSecS ? (nrel ? Math.max(16, Math.round(pltSecS.size / nrel)) : 16)
      : (pltS && nrel ? Math.max(16, Math.round(pltS.size / (nrel + 1))) : 16);
    const plt0 = !pltSecS; // a classic .plt has a resolver trampoline at index 0
    for (let k = 0; k < nrel && k < 20000; k += 1) {
      const ro = relPlt.off + k * entSz; if (ro + entSz > b.length) break;
      const rOffset = addr(ro);
      const symIdx = is64 ? r32(ro + 12) : (r32(ro + 4) >>> 8);
      const so = symOff + symIdx * symEnt; if (so + 4 > b.length) continue;
      const ni = r32(so); if (!ni) continue;
      const name = cstr(b, dynStrOff + ni, 512); if (!name) continue;
      got.push({ va: rOffset, name });
      if (stubBase !== null) plt.push({ addr: stubBase + (plt0 ? k + 1 : k) * stubSize, name });
    }
  }
  const stack = segments.find((s) => s.type === 'GNU_STACK');
  const hardening = { pie: type === 3, nx: stack ? !stack.flags.includes('x') : null, relro: segments.some((s) => s.type === 'GNU_RELRO') ? 'partial-or-full' : false, canary: imported.some((s) => s.startsWith('__stack_chk_fail')), fortify: imported.some((s) => /_chk$/.test(s)), stripped: !sections.some((s) => s.name === '.symtab'), writableExec: segments.filter((s) => s.type === 'LOAD' && s.flags.includes('w') && s.flags.includes('x')).length };
  return { format: 'elf', class: is64 ? 64 : 32, type: ELF_TYPES[type] || type, machine: ELF_MACHINES[machine] || machine, entry, interpreter, soname, needed, rpath, runpath, segments, sections: sections.map((s) => ({ name: s.name, off: s.off, size: s.size, addr: s.addr })), imported: imported.slice(0, 3000), exported: exported.slice(0, 3000), plt, got, counts: { imported: imported.length, exported: exported.length, sections: sections.length, plt: plt.length }, hardening, limitations };
}

// ---------------------------------------------------------------- Mach-O

const MACHO_CPU = { 7: 'x86', 0x01000007: 'x86-64', 12: 'arm', 0x0100000c: 'arm64', 18: 'powerpc' };
const MACHO_FILETYPES = { 1: 'object', 2: 'executable', 6: 'dylib', 8: 'bundle', 9: 'dylib-stub', 10: 'dsym', 11: 'kext' };
const PLATFORMS = { 1: 'macos', 2: 'ios', 3: 'tvos', 4: 'watchos', 5: 'bridgeos', 6: 'mac-catalyst', 7: 'ios-simulator', 8: 'tvos-simulator', 9: 'watchos-simulator', 10: 'driverkit', 11: 'visionos' };
const ver32 = (v) => `${v >>> 16}.${(v >>> 8) & 0xff}.${v & 0xff}`;

function readMachO(b, depth) {
  const magic = b.readUInt32BE(0);
  if (magic === 0xcafebabe) {
    if (depth) throw new Error('nested fat file');
    const n = b.readUInt32BE(4); const slices = [];
    for (let i = 0; i < Math.min(n, 16); i += 1) { const o = 8 + i * 20; const cpu = b.readUInt32BE(o), off = b.readUInt32BE(o + 8), size = b.readUInt32BE(o + 12); slices.push({ cpu: MACHO_CPU[cpu] || cpu, off, size, inside: readMachO(b.subarray(off, off + size), 1) }); }
    return { format: 'mach-o', fat: true, slices, limitations: [] };
  }
  const le = magic === 0xcffaedfe || magic === 0xcefaedfe;
  if (!le) throw new Error('not a Mach-O file this reader knows (big-endian or foreign magic)');
  const is64 = magic === 0xcffaedfe;
  const r32 = (o) => b.readUInt32LE(o), r64 = (o) => Number(b.readBigUInt64LE(o));
  const cpu = r32(4), filetype = r32(12), ncmds = r32(16), flags = r32(24);
  const segments = []; const dylibs = []; let id = null; const rpaths = []; let uuid = null, build = null, entry = null, signed = false, symtab = null, dysym = null, stubsSec = null;
  let o = is64 ? 32 : 28;
  const limitations = [];
  for (let i = 0; i < ncmds && i < 1024; i += 1) {
    if (o + 8 > b.length) break;
    const cmd = r32(o), size = r32(o + 4);
    if (size < 8) break;
    const str = (rel) => cstr(b, o + r32(o + rel), 1024);
    if (cmd === 0x19 || cmd === 0x1) { const segname = fixed(b, o + 8, 16); const nsects = r32(o + (is64 ? 64 : 48)); const sects = []; let so = o + (is64 ? 72 : 56); for (let k = 0; k < nsects && k < 256; k += 1) { const sn = fixed(b, so, 16); sects.push(sn); if (is64 && sn === '__stubs') stubsSec = { addr: r64(so + 32), size: r64(so + 40), first: r32(so + 68), stub: r32(so + 72) }; so += is64 ? 80 : 68; } segments.push({ name: segname, vmaddr: is64 ? r64(o + 24) : r32(o + 24), vmsize: is64 ? r64(o + 32) : r32(o + 28), fileoff: is64 ? r64(o + 40) : r32(o + 32), filesize: is64 ? r64(o + 48) : r32(o + 36), maxprot: r32(o + (is64 ? 56 : 40)), initprot: r32(o + (is64 ? 60 : 44)), sections: sects }); }
    else if (cmd === 0xc || cmd === 0x18 || cmd === 0x1f || cmd === 0x20) dylibs.push({ name: str(8), weak: cmd === 0x18, reexport: cmd === 0x1f, version: ver32(r32(o + 16)) });
    else if (cmd === 0xd) id = { name: str(8), version: ver32(r32(o + 16)) };
    else if (cmd === 0x8000001c) rpaths.push(str(8));
    else if (cmd === 0x1b) uuid = [...b.subarray(o + 8, o + 24)].map((x) => x.toString(16).padStart(2, '0')).join('');
    else if (cmd === 0x32) build = { platform: PLATFORMS[r32(o + 8)] || r32(o + 8), minos: ver32(r32(o + 12)), sdk: ver32(r32(o + 16)) };
    else if (cmd === 0x24 || cmd === 0x25 || cmd === 0x26 || cmd === 0x2f || cmd === 0x30) build = build || { platform: { 0x24: 'macos', 0x25: 'ios', 0x26: 'watchos', 0x2f: 'tvos' }[cmd] || 'other', minos: ver32(r32(o + 8)), sdk: ver32(r32(o + 12)) };
    else if (cmd === 0x80000028) entry = r64(o + 8);
    else if (cmd === 0x1d) signed = true;
    else if (cmd === 0x2) symtab = { symoff: r32(o + 8), nsyms: r32(o + 12), stroff: r32(o + 16), strsize: r32(o + 20) };
    else if (cmd === 0xb) dysym = { indirectsymoff: r32(o + 56), nindirectsyms: r32(o + 60) };
    o += size;
  }
  const imported = [], exported = [];
  if (symtab && symtab.symoff + symtab.nsyms * (is64 ? 16 : 12) <= b.length) {
    for (let i = 0; i < symtab.nsyms && i < 50000; i += 1) {
      const so = symtab.symoff + i * (is64 ? 16 : 12);
      const strx = r32(so), ntype = b[so + 4];
      if (ntype & 0xe0) continue; // debugging symbol
      const name = cstr(b, symtab.stroff + strx, 512);
      if (!name) continue;
      const kind = ntype & 0x0e;
      if (kind === 0 && (ntype & 0x01)) imported.push(name); else if ((ntype & 0x01) && kind === 0xe) exported.push(name);
    }
  } else limitations.push('no symbol table: imports and exports not listed');
  // lazy-binding stubs: __stubs[j] -> indirect symbol table[reserved1+j] -> symtab name
  const stubs = [];
  if (is64 && stubsSec && stubsSec.stub && dysym && symtab) {
    const nStub = Math.floor(stubsSec.size / stubsSec.stub);
    for (let j = 0; j < nStub && j < 20000; j += 1) {
      const io = dysym.indirectsymoff + (stubsSec.first + j) * 4; if (io + 4 > b.length) break;
      const symIdx = r32(io); if (symIdx & 0xc0000000) continue; // ABS or LOCAL: no name
      const no = symtab.symoff + symIdx * 16; if (no + 4 > b.length) continue;
      const name = cstr(b, symtab.stroff + r32(no), 512);
      if (name) stubs.push({ addr: stubsSec.addr + j * stubsSec.stub, name });
    }
  }
  return { format: 'mach-o', fat: false, class: is64 ? 64 : 32, cpu: MACHO_CPU[cpu] || cpu, filetype: MACHO_FILETYPES[filetype] || filetype, flags: { pie: Boolean(flags & 0x200000), twoLevel: Boolean(flags & 0x80), noHeapExec: Boolean(flags & 0x1000000) }, id, dylibs, rpaths, uuid, build, entry, signed, segments, imported: imported.slice(0, 3000), exported: exported.slice(0, 3000), stubs, counts: { imported: imported.length, exported: exported.length, dylibs: dylibs.length, stubs: stubs.length }, limitations };
}

// ---------------------------------------------------------------- what Go and Rust leave behind

const GO_MAGIC = Buffer.from('\xff Go buildinf:', 'latin1');

function readGo(b) {
  const i = b.indexOf(GO_MAGIC);
  if (i < 0) return null;
  const ptrSize = b[i + 14], flags = b[i + 15];
  const out = { offset: i, pointerSize: ptrSize, version: null, path: null, main: null, deps: [], settings: {} };
  const varint = (o) => { let v = 0, s = 0, k = o; for (;;) { const c = b[k]; k += 1; v += (c & 0x7f) * 2 ** s; if (!(c & 0x80)) break; s += 7; } return [v, k]; };
  let text = null;
  if (flags & 2) { let [len, o] = varint(i + 32); out.version = b.toString('utf8', o, o + len); o += len; [len, o] = varint(o); text = b.toString('utf8', o, o + len); }
  else {
    // older layout: two pointers to Go strings (ptr, len)
    const rp = (o) => (ptrSize === 8 ? Number(b.readBigUInt64LE(o)) : b.readUInt32LE(o));
    const addrs = [rp(i + 16), rp(i + 16 + ptrSize)];
    out.limitations = ['build info in the pre-1.18 layout: version and module data are behind virtual addresses this reader does not map'];
    void addrs;
  }
  if (text) {
    const lines = text.split('\n');
    for (const line of lines) {
      const [k, ...rest] = line.split('\t');
      if (k === 'path') out.path = rest[0];
      else if (k === 'mod') out.main = { path: rest[0], version: rest[1] || null };
      else if (k === 'dep') out.deps.push({ path: rest[0], version: rest[1] || null, sum: rest[2] || null, replaced: false });
      else if (k === '=>') { const last = out.deps.at(-1); if (last) { last.replaced = true; last.replacedBy = { path: rest[0], version: rest[1] || null }; } }
      else if (k === 'build') { const eq = rest[0]?.indexOf('='); if (eq > 0) out.settings[rest[0].slice(0, eq)] = rest[0].slice(eq + 1); }
    }
  }
  return out;
}

function readRust(b, sectionsOrNull) {
  const out = { rustc: null, crates: [], auditable: null };
  const text = b.toString('latin1');
  const m = /rustc\/([0-9a-f]{40})\/library\/|rustc version ([0-9.]+(?:-[\w.]+)?)/.exec(text);
  if (m) out.rustc = m[1] ? { commit: m[1] } : { version: m[2] };
  const seen = new Map();
  const re = /(?:\.cargo[\\/]registry[\\/]src[\\/][^\\/]+[\\/]|\/vendor\/)([A-Za-z0-9_-]+?)-(\d+\.\d+\.\d+(?:[-+][\w.]+)?)[\\/]/g;
  let x; let guard = 0;
  while ((x = re.exec(text)) && guard < 100000) { guard += 1; const key = `${x[1]}@${x[2]}`; seen.set(key, (seen.get(key) || 0) + 1); }
  out.crates = [...seen.entries()].map(([k, n]) => { const at = k.lastIndexOf('@'); return { name: k.slice(0, at), version: k.slice(at + 1), paths: n }; }).sort((a, c) => a.name.localeCompare(c.name));
  // cargo auditable: a zlib-compressed JSON in a section named .dep-v0
  const sec = sectionsOrNull ? sectionsOrNull.find((s) => s.name === '.dep-v0') : null;
  if (sec) { try { const raw = b.subarray(sec.raw ?? sec.off, (sec.raw ?? sec.off) + (sec.rawSize ?? sec.size)); const j = JSON.parse(inflateSync(raw).toString('utf8')); out.auditable = { packages: (j.packages || []).map((p) => ({ name: p.name, version: p.version, source: p.source || null, root: Boolean(p.root) })) }; } catch (e) { out.auditableError = e.message; } }
  if (!out.rustc && !out.crates.length && !out.auditable) return null;
  return out;
}

/** Strings worth a line: URLs, Windows and POSIX paths, registry keys, with counts. */
function interestingStrings(b) {
  const text = b.toString('latin1');
  const count = (re) => { const m = new Map(); let x; let guard = 0; while ((x = re.exec(text)) && guard < 200000) { guard += 1; const v = x[0].slice(0, 160); m.set(v, (m.get(v) || 0) + 1); } return [...m.entries()].sort((a, c) => c[1] - a[1]).slice(0, 60).map(([value, n]) => ({ value, count: n })); };
  return {
    urls: count(/\b(?:https?|wss?|ftp):\/\/[A-Za-z0-9][A-Za-z0-9.-]*(?::\d+)?(?:\/[^\s"'<>\x00-\x1f]{0,120})?/g),
    registry: count(/\b(?:HKEY_[A-Z_]+|HKLM|HKCU)\\[^\s"\x00-\x1f]{3,120}/g),
    windowsPaths: count(/\b[A-Za-z]:\\(?:[^\\\s"\x00-\x1f]+\\){1,8}[^\\\s"\x00-\x1f]{1,60}/g),
    posixPaths: count(/(?:^|[\s"'\x00])(\/(?:usr|etc|var|opt|home|tmp|proc|sys|dev|bin|sbin|lib|Library|Applications|System)\/[^\s"'\x00-\x1f]{1,120})/g).map((e) => ({ value: e.value.trim().replace(/^\x00/, ''), count: e.count })),
  };
}

function readBinary(b, opts) {
  if (b.length >= 2 && b[0] === 0x4d && b[1] === 0x5a) { const r = readPe(b, opts); r.go = readGo(b); r.rust = readRust(b, r.sections); r.strings = interestingStrings(b); return r; }
  if (b.length >= 4 && b[0] === 0x7f && b.toString('latin1', 1, 4) === 'ELF') { const r = readElf(b); r.go = readGo(b); r.rust = readRust(b, r.sections); r.strings = interestingStrings(b); return r; }
  if (b.length >= 4 && [0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(b.readUInt32BE(0))) { const r = readMachO(b, 0); if (!r.fat) { r.go = readGo(b); r.rust = readRust(b, null); r.strings = interestingStrings(b); } return r; }
  throw new Error('not a PE, ELF or Mach-O file');
}

/**
 * A symbol resolver for a disassembled instruction (addr = file offset, len, mnem, text).
 * Resolves a PE import through the IAT (`call [rip+x]`), a PE direct call/jmp to a named
 * export, and an ELF direct call/jmp to a PLT stub (`name@plt`). Returns '' when unresolved.
 */
function buildSym(r, localNames) {
  const fmt = r.format;
  const iat = new Map((r.iat || []).map((e) => [e.rva, e.name]));
  const exp = new Map((((r.exports && r.exports.addrs) || [])).map((e) => [e.rva, e.name]));
  const plt = new Map((r.plt || []).map((e) => [e.addr, e.name]));
  const stub = new Map((r.stubs || []).map((e) => [e.addr, e.name]));
  const off2addr = (off) => {
    if (fmt === 'pe') { for (const s of r.sections) { const sz = Math.max(s.vsize || 0, s.rawSize || 0); if (off >= s.raw && off < s.raw + sz) return s.vaddr + (off - s.raw); } return null; }
    if (fmt === 'elf') { for (const s of (r.segments || [])) { if (s.type === 'LOAD' && off >= s.off && off < s.off + s.filesz) return s.vaddr + (off - s.off); } return null; }
    if (fmt === 'mach-o') { for (const s of (r.segments || [])) { if (off >= s.fileoff && off < s.fileoff + s.filesize) return s.vmaddr + (off - s.fileoff); } return null; }
    return null;
  };
  const has = iat.size || exp.size || plt.size || stub.size || (localNames && localNames.size);
  return (ins) => {
    if (!has || !/^(call|jmp)$/.test(ins.mnem || '')) return '';
    if (fmt === 'pe' && iat.size) {
      const m = /\[rip([+-])0x([0-9a-f]+)\]/.exec(ins.text || '');
      if (m) { const disp = parseInt(m[2], 16) * (m[1] === '-' ? -1 : 1); const ir = off2addr(ins.addr); if (ir != null) { const n = iat.get(ir + ins.len + disp); if (n) return demangle(n); } }
    }
    const dm = /^\S+\s+(-?)0x([0-9a-f]+)$/.exec(ins.text || ''); // a direct self-relative call/jmp
    if (dm) {
      const v = parseInt(dm[2], 16) * (dm[1] ? -1 : 1); const a = off2addr(ins.addr + v);
      if (a != null) {
        if (fmt === 'pe') { const n = exp.get(a); if (n) return `${(r.exports && r.exports.name) || 'this'}!${demangle(n)}`; }
        else if (fmt === 'elf') { const n = plt.get(a); if (n) return `${demangle(n)}@plt`; }
        else if (fmt === 'mach-o') { const n = stub.get(a); if (n) return `${demangle(n)}@stub`; }
        if (localNames) { const ln = localNames.get(a); if (ln) return demangle(ln); } // a local function from DWARF / a sibling PDB
      }
    }
    return '';
  };
}

export { readBinary, readPe, readElf, readMachO, readGo, readRust, readClr, interestingStrings, buildSym };
