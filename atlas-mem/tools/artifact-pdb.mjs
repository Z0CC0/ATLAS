/**
 * ATLAS — a Windows PDB (program database) read as its MSF container and the CodeView symbol
 * records, to recover real function names and their section:offset (and RVA when the section
 * headers are present). The MSF/PDB layout and the CodeView record kinds are from the public
 * microsoft-pdb documentation and the PE/COFF spec, not from any tool's source. Nothing is
 * executed. The type stream (TPI) and line information are not reconstructed here.
 */

import { demangle } from './artifact-demangle.mjs';

const MSF_MAGIC = 'Microsoft C/C++ MSF 7.00\r\n\x1aDS';

/** Reconstruct every stream from the MSF directory. Returns { streams: Buffer[], blockSize }. */
function readMsf(b) {
  if (b.toString('latin1', 0, MSF_MAGIC.length) !== MSF_MAGIC) throw new Error('not an MSF/PDB file');
  const blockSize = b.readUInt32LE(32); const numDirBytes = b.readUInt32LE(44); const blockMapAddr = b.readUInt32LE(52);
  const block = (i) => b.subarray(i * blockSize, i * blockSize + blockSize);
  const nDirBlocks = Math.ceil(numDirBytes / blockSize);
  const dirBlockList = []; for (let i = 0; i < nDirBlocks; i += 1) dirBlockList.push(b.readUInt32LE(blockMapAddr * blockSize + i * 4));
  const dir = Buffer.concat(dirBlockList.map(block)).subarray(0, numDirBytes);
  let o = 0; const nStreams = dir.readUInt32LE(o); o += 4;
  const sizes = []; for (let i = 0; i < nStreams; i += 1) { sizes.push(dir.readUInt32LE(o)); o += 4; }
  const streams = [];
  for (let i = 0; i < nStreams; i += 1) {
    const size = sizes[i] === 0xffffffff ? 0 : sizes[i]; const nblk = Math.ceil(size / blockSize); const blocks = [];
    for (let k = 0; k < nblk; k += 1) { blocks.push(dir.readUInt32LE(o)); o += 4; }
    streams.push(blocks.length ? Buffer.concat(blocks.map(block)).subarray(0, size) : Buffer.alloc(0));
  }
  return { streams, blockSize };
}

/** Parse the DBI stream header for the symbol-record stream index and the module count. */
function dbiHeader(dbi) {
  if (dbi.length < 64 || dbi.readInt32LE(0) !== -1) return null;
  return {
    age: dbi.readUInt32LE(8), globalStream: dbi.readUInt16LE(12), buildNumber: dbi.readUInt16LE(14),
    publicStream: dbi.readUInt16LE(16), symRecordStream: dbi.readUInt16LE(20),
    modInfoSize: dbi.readInt32LE(24), secContribSize: dbi.readInt32LE(28), secMapSize: dbi.readInt32LE(32),
    sourceInfoSize: dbi.readInt32LE(36), typeServerSize: dbi.readInt32LE(40), optDbgHeaderSize: dbi.readInt32LE(48),
    machine: dbi.readUInt16LE(60),
  };
}

// CodeView symbol kinds that name a function or data with a section:offset
const S_PUB32 = 0x110e, S_GPROC32 = 0x1110, S_LPROC32 = 0x1111, S_LDATA32 = 0x110c, S_GDATA32 = 0x110d, S_PROCREF = 0x1125, S_LPROCREF = 0x1127;

/** Walk a CodeView symbol stream, pulling out named functions/data with section:offset. */
function symbols(stream) {
  const out = []; let o = 0;
  while (o + 4 <= stream.length) {
    const len = stream.readUInt16LE(o); if (len < 2) break; const kind = stream.readUInt16LE(o + 2);
    const rec = stream.subarray(o + 4, o + 2 + len); // record body (after len+kind)
    if (kind === S_PUB32) { const flags = rec.readUInt32LE(0), offset = rec.readUInt32LE(4), seg = rec.readUInt16LE(8); const name = cstr(rec, 10); out.push({ kind: 'pub', name, seg, offset, func: (flags & 2) !== 0 }); }
    else if (kind === S_GPROC32 || kind === S_LPROC32) { const offset = rec.readUInt32LE(28), seg = rec.readUInt16LE(32); const name = cstr(rec, 35); out.push({ kind: kind === S_GPROC32 ? 'gproc' : 'lproc', name, seg, offset, func: true }); }
    else if (kind === S_LDATA32 || kind === S_GDATA32) { const offset = rec.readUInt32LE(4), seg = rec.readUInt16LE(8); const name = cstr(rec, 10); out.push({ kind: 'data', name, seg, offset, func: false }); }
    o += 2 + len; o = (o + 3) & ~3; // records are 4-byte aligned
  }
  return out;
}
function cstr(b, o) { let e = o; while (e < b.length && b[e]) e += 1; return b.toString('utf8', o, e); }

/** Section headers from the DBI optional-debug-header substream (index 5), to map seg:offset -> RVA. */
function sectionHeaders(streams, dbi, hdr) {
  let o = 64 + hdr.modInfoSize + hdr.secContribSize + hdr.secMapSize + hdr.sourceInfoSize + hdr.typeServerSize;
  // skip the EC substream too (its size is the field after; layout: ... ecSubstreamSize then optDbgHeader)
  // the optional debug header is an array of u16 stream indices; entry 5 = section headers
  o = dbi.length - hdr.optDbgHeaderSize;
  if (o < 0 || o + 12 > dbi.length) return null;
  const idx = dbi.readUInt16LE(o + 5 * 2); if (idx === 0xffff || idx >= streams.length) return null;
  const sh = streams[idx]; const secs = [];
  for (let p = 0; p + 40 <= sh.length; p += 40) secs.push({ name: cstr(sh, p).slice(0, 8), vsize: sh.readUInt32LE(p + 8), vaddr: sh.readUInt32LE(p + 12) });
  return secs;
}

/** Read a PDB: recover the named functions (and data) with their RVA where resolvable. */
function readPdb(b) {
  const { streams } = readMsf(b);
  const dbi = streams[3]; const hdr = dbi ? dbiHeader(dbi) : null;
  if (!hdr) throw new Error('no DBI stream');
  const symStream = streams[hdr.symRecordStream] || Buffer.alloc(0);
  const syms = symbols(symStream);
  const secs = sectionHeaders(streams, dbi, hdr);
  const rva = (s) => (secs && secs[s.seg - 1] ? secs[s.seg - 1].vaddr + s.offset : null);
  const functions = syms.filter((s) => s.func).map((s) => { const d = demangle(s.name); return { name: s.name, demangled: d !== s.name ? d : undefined, rva: rva(s), seg: s.seg, offset: s.offset }; });
  return { streamCount: streams.length, machine: hdr.machine, symbolCount: syms.length, functions, hasSections: !!secs };
}

export { readPdb, readMsf, symbols, dbiHeader };
