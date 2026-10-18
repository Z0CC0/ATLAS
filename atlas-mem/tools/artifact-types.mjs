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
  let fn = name.includes('!') ? name.split('!')[1] : name;
  fn = fn.replace(/@.*/, '').toUpperCase();
  if (PROTOS[fn]) return { name: name.split('!').pop(), proto: PROTOS[fn] };
  if (/[AW]$/.test(fn) && PROTOS[fn.slice(0, -1)]) return { name: name.split('!').pop(), proto: PROTOS[fn.slice(0, -1)] };
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
      if (mnem === 'mov' && ops.length === 2 && !ops[0].startsWith('[') && !ops[1].startsWith('[')) {
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
  return { regTypes: out, signatures, anchored };
}

export { inferTypes, protoFor, signatureText, PROTOS };
