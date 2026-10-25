/**
 * Call graph of a native binary: the caller->callee edges between the functions already
 * enumerated from the exception/unwind tables and the symbols. For each function it walks the
 * instructions from the known entry (reliable: a real function start, not a guessed offset)
 * and reads the target of every *direct* call — x86-64 `call rel32`, ARM64 `bl` — then maps
 * that target back to the function that contains it. Honest by construction:
 *   - only direct calls are followed; an indirect call (through a register, an import thunk, a
 *     vtable) has no static target, so it is counted, not invented;
 *   - an edge exists only when both ends land on an enumerated function, or on a node discovered
 *     by a direct call into code that no table lists (those are walked too, in a second pass);
 *   - nothing is executed and the bytes are read as they are.
 */

/** Parse a direct-call target (absolute file offset) from one decoded instruction, or null. */
function callTargetX86(insn) {
  if (insn.mnem !== 'call') return null;
  const ops = insn.text.replace(/^\S+\s+/, '').trim();
  const m = /^(-?)0x([0-9a-f]+)$/.exec(ops);
  if (!m) return null; // indirect: call reg / call [mem]
  return insn.addr + parseInt(m[2], 16) * (m[1] ? -1 : 1);
}
function callTargetArm64(insn) {
  if (insn.mnem !== 'bl') return null; // blr is indirect
  const m = /\.([+-])0x([0-9a-f]+)/.exec(insn.text);
  if (!m) return null;
  return insn.addr + parseInt(m[2], 16) * (m[1] === '-' ? -1 : 1);
}

/**
 * @param {object} p
 * @param {'x86-64'|'arm64'} p.arch
 * @param {Array<{va:number, off:number, end:number, name?:string}>} p.entries  function set, each with a file offset and an exclusive end
 * @param {(pos:number)=>({addr:number,len:number,text:string,mnem:string,bad?:boolean}|null)} p.decodeAt
 * @param {number} [p.maxBytes]  cap on total bytes walked (default 8 MiB; `--budget <MiB>` at the command)
 * @returns {{edges:Array<[number,number]>, outDeg:Map<number,number>, inDeg:Map<number,number>, indirectCalls:number, external:number, scannedBytes:number, truncated:boolean}}
 */
function buildCallGraph(p) {
  const callTarget = p.arch === 'arm64' ? callTargetArm64 : callTargetX86;
  const maxBytes = p.maxBytes || 8 * 1024 * 1024;
  // index the functions by file-offset range for containing-function lookup (sorted starts + binary search)
  const byStart = p.entries.map((e, i) => ({ off: e.off, end: e.end, i })).sort((a, b) => a.off - b.off);
  const starts = byStart.map((x) => x.off);
  const containing = (off) => {
    // greatest start <= off, then check its range
    let lo = 0, hi = starts.length - 1, best = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (starts[mid] <= off) { best = mid; lo = mid + 1; } else hi = mid - 1; }
    if (best < 0) return -1;
    const c = byStart[best];
    return off < c.end ? c.i : -1;
  };
  const edgeSet = new Set(); // "from,to" dedup
  const edges = [];
  const outDeg = new Map(); const inDeg = new Map();
  const imports = new Map(); // import name -> call count, for direct calls that land on a PLT stub / import thunk
  const resolveExternal = typeof p.resolveExternal === 'function' ? p.resolveExternal : () => null;
  // a direct call into code that no table lists (an x64 leaf function has no .pdata entry, a
  // stripped static function no symbol) discovers a node: index past the entries, named by the caller
  const codeRanges = Array.isArray(p.codeRanges) ? p.codeRanges : [];
  const inCode = (off) => codeRanges.some(([lo, hi]) => off >= lo && off < hi);
  const discovered = []; const discoveredIdx = new Map(); // file offset -> node index
  const discover = (off) => { let i = discoveredIdx.get(off); if (i === undefined) { i = p.entries.length + discovered.length; discovered.push(off); discoveredIdx.set(off, i); } return i; };
  let indirectCalls = 0, external = 0, scannedBytes = 0, truncated = false;
  const link = (from, to) => { const k = from + ',' + to; if (!edgeSet.has(k)) { edgeSet.add(k); edges.push([from, to]); outDeg.set(from, (outDeg.get(from) || 0) + 1); inDeg.set(to, (inDeg.get(to) || 0) + 1); } };
  const walk = (from, start, stop, open) => {
    let pos = start;
    let guard = 0;
    while (pos < stop && guard < 200000) {
      guard += 1;
      if (open && pos !== start && discoveredIdx.has(pos)) break; // an open-ended walk stops where a node discovered on the way begins
      const d = p.decodeAt(pos);
      if (!d) break;
      const len = Math.max(1, d.len);
      scannedBytes += len;
      if (!d.bad) {
        const isCall = p.arch === 'arm64' ? d.mnem === 'bl' || d.mnem === 'blr' : d.mnem === 'call';
        if (isCall) {
          const t = callTarget({ addr: pos, text: d.text, mnem: d.mnem });
          if (t == null) indirectCalls += 1;
          else if (t < 0) external += 1; // a target before the file start: garbage bytes decoded as a call
          else {
            const to = containing(t);
            if (to < 0) {
              // a direct call that leaves the enumerated set: an import through its PLT stub /
              // thunk when the caller can name it, otherwise padding, data or an unlisted function
              const name = resolveExternal(t);
              if (name) imports.set(name, (imports.get(name) || 0) + 1);
              else if (inCode(t)) link(from, discover(t));
              else external += 1;
            } else link(from, to);
          }
        }
      }
      pos += len;
    }
  };
  for (const e of byStart) {
    if (scannedBytes >= maxBytes) { truncated = true; break; }
    walk(e.i, e.off, e.end);
  }
  // second pass: a discovered node is walked too, so its own callees enter the graph. Its extent is
  // not in any table: it runs to the next enumerated start, or to the end of its code range, and a
  // discovered node found on the way joins the queue (bounded by the same byte budget)
  const nextStart = (off) => { let lo = 0, hi = starts.length - 1, best = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (starts[mid] > off) { best = mid; hi = mid - 1; } else lo = mid + 1; } return best < 0 ? Infinity : starts[best]; };
  const rangeEnd = (off) => { const r = codeRanges.find(([lo, hi]) => off >= lo && off < hi); return r ? r[1] : off; };
  for (let q = 0; q < discovered.length; q += 1) {
    if (scannedBytes >= maxBytes) { truncated = true; break; }
    const off = discovered[q];
    const later = discovered.filter((d) => d > off); // a sibling discovered after this one bounds it too
    walk(p.entries.length + q, off, Math.min(nextStart(off), rangeEnd(off), later.length ? Math.min(...later) : Infinity), true);
  }
  return { edges, outDeg, inDeg, imports, discovered, indirectCalls, external, scannedBytes, truncated };
}

export { buildCallGraph, callTargetX86, callTargetArm64 };
