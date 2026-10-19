/**
 * ATLAS — approximate type recovery for a lifted x86-64 function. Our own, over our own CFG
 * and import resolution. The idea most decompilers rely on, done our way: a resolved import
 * call is ground truth. We ship a compact table of common Win32 / C-runtime / ntdll
 * prototypes (from the public API headers and MS documentation, which are a specification,
 * not a tool's source), so at every `call DLL!func` the argument registers get the parameter
 * types and the return register gets the return type under the Microsoft x64 calling
 * convention (integer / pointer args in rcx, rdx, r8, r9; return in rax). From those anchors
 * a light forward pass carries a type along `mov` copies, narrows width from the register
 * sub-name, and marks sign from a signed vs unsigned conditional jump. Nothing is executed.
 *
 * This is deliberately honest: types that are not anchored to a prototype, a width or a sign
 * test stay `?`, and the call signatures are shown verbatim so the reader can judge. It does
 * not recover user structs or reconstruct a fully-typed C — that remains the frontier.
 */

// Microsoft x64 integer/pointer argument registers, in order, and the return register.
const ARG = ['rcx', 'rdx', 'r8', 'r9'];
const RET = 'rax';

// sub-register -> canonical 64-bit name, with the width each sub-name implies
const CANON = {};
const WIDTH = {};
for (const [q, d, w, b, base] of [
  ['rax', 'eax', 'ax', 'al', 'rax'], ['rcx', 'ecx', 'cx', 'cl', 'rcx'],
  ['rdx', 'edx', 'dx', 'dl', 'rdx'], ['rbx', 'ebx', 'bx', 'bl', 'rbx'],
  ['rsi', 'esi', 'si', 'sil', 'rsi'], ['rdi', 'edi', 'di', 'dil', 'rdi'],
  ['rbp', 'ebp', 'bp', 'bpl', 'rbp'], ['rsp', 'esp', 'sp', 'spl', 'rsp'],
]) { CANON[q] = base; CANON[d] = base; CANON[w] = base; CANON[b] = base; WIDTH[q] = 64; WIDTH[d] = 32; WIDTH[w] = 16; WIDTH[b] = 8; }
for (let i = 8; i <= 15; i += 1) { const q = 'r' + i; CANON[q] = q; CANON[q + 'd'] = q; CANON[q + 'w'] = q; CANON[q + 'b'] = q; WIDTH[q] = 64; WIDTH[q + 'd'] = 32; WIDTH[q + 'w'] = 16; WIDTH[q + 'b'] = 8; }
const canon = (r) => CANON[r] || r;

/**
 * Compact prototype table. Key is the bare function name, upper-cased, with any A/W suffix
 * dropped (so FindFirstFileW matches FINDFIRSTFILE). Value: { ret, args:[...], names?:[...] }.
 * Short, common functions only — enough to type real call sites, not a full SDK.
 */
const PROTOS = {
  // KERNEL32 — process, memory, file, string
  GETPROCADDRESS: { ret: 'FARPROC', args: ['HMODULE', 'LPCSTR'] },
  GETMODULEHANDLE: { ret: 'HMODULE', args: ['LPCTSTR'] },
  LOADLIBRARY: { ret: 'HMODULE', args: ['LPCTSTR'] },
  LOADLIBRARYEX: { ret: 'HMODULE', args: ['LPCTSTR', 'HANDLE', 'DWORD'] },
  FREELIBRARY: { ret: 'BOOL', args: ['HMODULE'] },
  VIRTUALALLOC: { ret: 'LPVOID', args: ['LPVOID', 'SIZE_T', 'DWORD', 'DWORD'] },
  VIRTUALFREE: { ret: 'BOOL', args: ['LPVOID', 'SIZE_T', 'DWORD'] },
  VIRTUALPROTECT: { ret: 'BOOL', args: ['LPVOID', 'SIZE_T', 'DWORD', 'PDWORD'] },
  HEAPALLOC: { ret: 'LPVOID', args: ['HANDLE', 'DWORD', 'SIZE_T'] },
  HEAPFREE: { ret: 'BOOL', args: ['HANDLE', 'DWORD', 'LPVOID'] },
  GETPROCESSHEAP: { ret: 'HANDLE', args: [] },
  CREATEFILE: { ret: 'HANDLE', args: ['LPCTSTR', 'DWORD', 'DWORD', 'LPSECURITY_ATTRIBUTES', 'DWORD', 'DWORD', 'HANDLE'] },
  READFILE: { ret: 'BOOL', args: ['HANDLE', 'LPVOID', 'DWORD', 'LPDWORD', 'LPOVERLAPPED'] },
  WRITEFILE: { ret: 'BOOL', args: ['HANDLE', 'LPCVOID', 'DWORD', 'LPDWORD', 'LPOVERLAPPED'] },
  CLOSEHANDLE: { ret: 'BOOL', args: ['HANDLE'] },
  GETLASTERROR: { ret: 'DWORD', args: [] },
  SETLASTERROR: { ret: 'void', args: ['DWORD'] },
  GETCURRENTPROCESS: { ret: 'HANDLE', args: [] },
  GETCURRENTPROCESSID: { ret: 'DWORD', args: [] },
  GETCURRENTTHREADID: { ret: 'DWORD', args: [] },
  EXITPROCESS: { ret: 'void', args: ['UINT'] },
  TERMINATEPROCESS: { ret: 'BOOL', args: ['HANDLE', 'UINT'] },
  CREATETHREAD: { ret: 'HANDLE', args: ['LPSECURITY_ATTRIBUTES', 'SIZE_T', 'LPTHREAD_START_ROUTINE', 'LPVOID', 'DWORD', 'LPDWORD'] },
  WAITFORSINGLEOBJECT: { ret: 'DWORD', args: ['HANDLE', 'DWORD'] },
  SLEEP: { ret: 'void', args: ['DWORD'] },
  MULTIBYTETOWIDECHAR: { ret: 'int', args: ['UINT', 'DWORD', 'LPCCH', 'int', 'LPWSTR', 'int'] },
  WIDECHARTOMULTIBYTE: { ret: 'int', args: ['UINT', 'DWORD', 'LPCWCH', 'int', 'LPSTR', 'int', 'LPCCH', 'LPBOOL'] },
  GETSTDHANDLE: { ret: 'HANDLE', args: ['DWORD'] },
  GETTICKCOUNT: { ret: 'DWORD', args: [] },
  QUERYPERFORMANCECOUNTER: { ret: 'BOOL', args: ['LARGE_INTEGER*'] },
  GETSYSTEMTIMEASFILETIME: { ret: 'void', args: ['LPFILETIME'] },
  INITIALIZECRITICALSECTION: { ret: 'void', args: ['LPCRITICAL_SECTION'] },
  ENTERCRITICALSECTION: { ret: 'void', args: ['LPCRITICAL_SECTION'] },
  LEAVECRITICALSECTION: { ret: 'void', args: ['LPCRITICAL_SECTION'] },
  // C runtime — memory and strings
  MALLOC: { ret: 'void*', args: ['size_t'] },
  CALLOC: { ret: 'void*', args: ['size_t', 'size_t'] },
  REALLOC: { ret: 'void*', args: ['void*', 'size_t'] },
  FREE: { ret: 'void', args: ['void*'] },
  MEMCPY: { ret: 'void*', args: ['void*', 'const void*', 'size_t'] },
  MEMMOVE: { ret: 'void*', args: ['void*', 'const void*', 'size_t'] },
  MEMSET: { ret: 'void*', args: ['void*', 'int', 'size_t'] },
  MEMCMP: { ret: 'int', args: ['const void*', 'const void*', 'size_t'] },
  STRLEN: { ret: 'size_t', args: ['const char*'] },
  WCSLEN: { ret: 'size_t', args: ['const wchar_t*'] },
  STRCMP: { ret: 'int', args: ['const char*', 'const char*'] },
  STRNCMP: { ret: 'int', args: ['const char*', 'const char*', 'size_t'] },
  STRCPY: { ret: 'char*', args: ['char*', 'const char*'] },
  STRCAT: { ret: 'char*', args: ['char*', 'const char*'] },
  STRCHR: { ret: 'char*', args: ['const char*', 'int'] },
  STRDUP: { ret: 'char*', args: ['const char*'] },
  PUTS: { ret: 'int', args: ['const char*'] },
  PUTCHAR: { ret: 'int', args: ['int'] },
  PRINTF: { ret: 'int', args: ['const char*'] },
  FPRINTF: { ret: 'int', args: ['FILE*', 'const char*'] },
  SPRINTF: { ret: 'int', args: ['char*', 'const char*'] },
  SNPRINTF: { ret: 'int', args: ['char*', 'size_t', 'const char*'] },
  FOPEN: { ret: 'FILE*', args: ['const char*', 'const char*'] },
  FCLOSE: { ret: 'int', args: ['FILE*'] },
  FWRITE: { ret: 'size_t', args: ['const void*', 'size_t', 'size_t', 'FILE*'] },
  FREAD: { ret: 'size_t', args: ['void*', 'size_t', 'size_t', 'FILE*'] },
  EXIT: { ret: 'void', args: ['int'] },
  ABORT: { ret: 'void', args: [] },
  MEMCPY_S: { ret: 'errno_t', args: ['void*', 'size_t', 'const void*', 'size_t'] },
  _ERRNO: { ret: 'int*', args: [] },
  // ntdll
  RTLALLOCATEHEAP: { ret: 'PVOID', args: ['PVOID', 'ULONG', 'SIZE_T'] },
  RTLFREEHEAP: { ret: 'BOOLEAN', args: ['PVOID', 'ULONG', 'PVOID'] },
  NTCLOSE: { ret: 'NTSTATUS', args: ['HANDLE'] },
  // ADVAPI32 — event log / registry
  EVENTREGISTER: { ret: 'ULONG', args: ['LPCGUID', 'PENABLECALLBACK', 'PVOID', 'PREGHANDLE'] },
  EVENTWRITE: { ret: 'ULONG', args: ['REGHANDLE', 'PCEVENT_DESCRIPTOR', 'ULONG', 'PEVENT_DATA_DESCRIPTOR'] },
  EVENTUNREGISTER: { ret: 'ULONG', args: ['REGHANDLE'] },
  REGOPENKEYEX: { ret: 'LSTATUS', args: ['HKEY', 'LPCTSTR', 'DWORD', 'REGSAM', 'PHKEY'] },
  REGQUERYVALUEEX: { ret: 'LSTATUS', args: ['HKEY', 'LPCTSTR', 'LPDWORD', 'LPDWORD', 'LPBYTE', 'LPDWORD'] },
  REGCLOSEKEY: { ret: 'LSTATUS', args: ['HKEY'] },
  // USER32
  MESSAGEBOX: { ret: 'int', args: ['HWND', 'LPCTSTR', 'LPCTSTR', 'UINT'] },
  WSPRINTF: { ret: 'int', args: ['LPTSTR', 'LPCTSTR'] },
};

/** Look up a prototype for a resolved `dll!function` name (A/W suffix tolerant). */
function protoFor(name) {
  if (!name) return null;
  const bare = (name.includes('!') ? name.split('!')[1] : name).replace(/@.*/, '');
  const fn = bare.toUpperCase();
  if (PROTOS[fn]) return { name: bare, proto: PROTOS[fn] };
  if (/[AW]$/.test(fn) && PROTOS[fn.slice(0, -1)]) return { name: bare.slice(0, -1), proto: PROTOS[fn.slice(0, -1)] };
  return null;
}

/** Render a prototype as a C declaration string. */
function signatureText(name, proto) {
  return `${proto.ret} ${name}(${proto.args.join(', ') || 'void'})`;
}

function parse(text) {
  const sp = text.indexOf(' ');
  const mnem = sp < 0 ? text : text.slice(0, sp);
  const ops = sp < 0 ? [] : text.slice(sp + 1).split(', ');
  return { mnem, ops };
}

/**
 * Infer types over a function's CFG. `sym(ins)` resolves a call target to `dll!name`.
 * Returns { regTypes: {reg:type}, signatures: [{at, name, text}], anchored: n }.
 */
function inferTypes(cfg, sym) {
  const regTypes = new Map(); // canonical reg -> type string (best known)
  const signatures = [];
  const seen = new Set();
  let anchored = 0;
  const setType = (reg, t) => { const c = canon(reg); if (!c) return; if (t && t !== '?') regTypes.set(c, t); };
  const slotTypes = new Map(); // stack-slot name (local_30 / arg_10) -> type, matching the frame pass
  const slotName = (op) => { const m = /^\[(rsp|rbp)([+-])0x([0-9a-f]+)\]$/.exec(op || ''); if (!m) return null; const hex = m[3]; return (m[1] === 'rbp' && m[2] === '+') ? `arg_${hex}` : `local_${m[2] === '-' ? 'm' : ''}${hex}`; };

  let pendingCmp = null; // operands of the last cmp/test, for sign from the jump
  for (const b of cfg.blocks) {
    for (const ins of b.insns) {
      const { mnem, ops } = parse(ins.text || '');
      if (mnem === 'call') {
        const name = sym && sym(ins);
        const hit = protoFor(name);
        if (hit) {
          const sig = signatureText(hit.name, hit.proto);
          if (!seen.has(ins.addr)) { signatures.push({ at: ins.addr, name: hit.name, text: sig, args: hit.proto.args, ret: hit.proto.ret }); seen.add(ins.addr); anchored += 1; }
          hit.proto.args.forEach((t, i) => { if (i < ARG.length) setType(ARG[i], t); });
          setType(RET, hit.proto.ret === 'void' ? '?' : hit.proto.ret);
        } else {
          // an unknown call clobbers the volatile registers' known types
          for (const r of [RET, ...ARG, 'r10', 'r11']) regTypes.delete(canon(r));
        }
        pendingCmp = null; continue;
      }
      if (mnem === 'mov' && ops.length === 2 && ops[0].startsWith('[')) {
        // store to memory: a typed register written to a stack slot types that slot
        const sl = slotName(ops[0]); const t = regTypes.get(canon(ops[1])); if (sl && t) slotTypes.set(sl, t);
      } else if (mnem === 'mov' && ops.length === 2 && ops[1].startsWith('[')) {
        // load from memory: a typed stack slot types the destination register, else it is unknown
        const sl = slotName(ops[1]); const t = sl && slotTypes.get(sl); if (t) setType(ops[0], t); else regTypes.delete(canon(ops[0]));
      } else if (mnem === 'mov' && ops.length === 2) {
        const t = regTypes.get(canon(ops[1])); if (t) setType(ops[0], t); else regTypes.delete(canon(ops[0]));
      } else if ((mnem === 'movzx') && ops.length === 2) {
        setType(ops[0], 'uint' + (WIDTH[ops[1].startsWith('[') ? null : ops[1]] || '?'));
      } else if ((mnem === 'movsx' || mnem === 'movsxd') && ops.length === 2) {
        setType(ops[0], 'int' + (WIDTH[ops[1].startsWith('[') ? null : ops[1]] || '?'));
      } else if (mnem === 'lea' && ops.length === 2) {
        setType(ops[0], 'void*'); // an address
      } else if (mnem === 'cmp' || mnem === 'test') {
        pendingCmp = ops;
      } else if (/^j(l|le|g|ge|nl|nle|ng|nge)$/.test(mnem) && pendingCmp) {
        for (const o of pendingCmp) if (!o.startsWith('[') && WIDTH[o]) setType(o, 'int' + WIDTH[o]); // signed test
        pendingCmp = null;
      } else if (/^j(b|be|a|ae|nb|nbe|na|nae|c|nc)$/.test(mnem) && pendingCmp) {
        for (const o of pendingCmp) if (!o.startsWith('[') && WIDTH[o]) setType(o, 'uint' + WIDTH[o]); // unsigned test
        pendingCmp = null;
      }
    }
  }
  const out = {};
  for (const [r, t] of regTypes) out[r] = t;
  const slots = {};
  for (const [s, t] of slotTypes) slots[s] = t;
  return { regTypes: out, slotTypes: slots, signatures, anchored };
}

// ---------------------------------------------------------------- ARM64 type recovery

function splitBrA(s) { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '[') d += 1; else if (ch === ']') d -= 1; if (ch === ',' && d === 0) { out.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; }
function parseArmT(text) { const sp = (text || '').indexOf(' '); return { mnem: sp < 0 ? (text || '') : text.slice(0, sp), ops: sp < 0 ? [] : splitBrA(text.slice(sp + 1)) }; }
const canonA = (r) => (/^w(\d+)$/.test(r) ? 'x' + r.slice(1) : r);

/**
 * API-anchored type recovery for ARM64 (A64 ABI: integer/pointer args in x0..x7, return in
 * x0). A `bl`/`blr` to a resolved import (name@plt / name@stub / dll!name) types the argument
 * registers and the return from the shipped prototype table; an unknown call clears x0..x18;
 * a value stored into an sp slot types that slot. Returns the same shape as the x86 pass.
 */
function inferTypesArm(cfg, sym) {
  const ARG = ['x0', 'x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7']; const RET = 'x0';
  const regTypes = new Map(); const slotTypes = new Map(); const signatures = []; const seen = new Set(); let anchored = 0;
  const setType = (r, t) => { if (t && t !== '?' && /^(x\d+|w\d+)$/.test(r)) regTypes.set(canonA(r), t); };
  const slotName = (op) => { const m = /^\[sp(?:, (-?0x[0-9a-f]+))?\]!?$/.exec(op || ''); if (!m) return null; const d = m[1]; return 'local_' + (d ? (d[0] === '-' ? 'm' + d.replace('-0x', '') : d.replace('0x', '')) : '0'); };
  for (const b of cfg.blocks) for (const ins of b.insns) {
    const { mnem, ops } = parseArmT(ins.text || '');
    if (mnem === 'bl' || mnem === 'blr') {
      const hit = protoFor(sym && sym(ins));
      if (hit) {
        if (!seen.has(ins.addr)) { signatures.push({ at: ins.addr, name: hit.name, text: signatureText(hit.name, hit.proto), args: hit.proto.args, ret: hit.proto.ret }); seen.add(ins.addr); anchored += 1; }
        hit.proto.args.forEach((t, i) => { if (i < ARG.length) setType(ARG[i], t); });
        setType(RET, hit.proto.ret === 'void' ? '?' : hit.proto.ret);
      } else { for (let i = 0; i <= 18; i += 1) regTypes.delete('x' + i); }
    } else if (mnem === 'mov' && /^(x\d+|w\d+)$/.test(ops[1] || '')) {
      const t = regTypes.get(canonA(ops[1])); if (t) setType(ops[0], t); else regTypes.delete(canonA(ops[0]));
    } else if (/^str/.test(mnem)) {
      const sl = slotName(ops[1]); const t = regTypes.get(canonA(ops[0])); if (sl && t) slotTypes.set(sl, t);
    } else if (/^ldr/.test(mnem)) {
      const sl = slotName(ops[1]); const t = sl && slotTypes.get(sl); if (t) setType(ops[0], t); else if (/^(x\d+|w\d+)$/.test(ops[0] || '')) regTypes.delete(canonA(ops[0]));
    }
  }
  const out = {}; for (const [r, t] of regTypes) out[r] = t;
  const slots = {}; for (const [s, t] of slotTypes) slots[s] = t;
  return { regTypes: out, slotTypes: slots, signatures, anchored };
}

export { inferTypes, inferTypesArm, protoFor, signatureText, PROTOS };
