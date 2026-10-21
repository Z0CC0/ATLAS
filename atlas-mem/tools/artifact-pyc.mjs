/**
 * ATLAS — a CPython .pyc file read as its header, the marshalled code object, and the
 * disassembled wordcode. The header and marshal layout are from the CPython source's
 * documented format (Lib/importlib and Python/marshal.c), and the opcode maps are the
 * official opcode.opmap tables transcribed as data per version. Opcode numbers change between
 * Python versions, so the reader picks the map from the magic number and says so. Nothing is
 * executed; the marshalled objects are parsed, never unmarshalled into live Python.
 */

// magic number (first 4 bytes, little-endian u16 of interest) -> Python version label + opmap key
const MAGIC = { 0x0dcb: '3.12', 0x0df3: '3.13', 0x0da7: '3.11' };
// opcode.opmap for each supported version (num -> name); only the versions we can name exactly
const OPMAP = {
  '3.12': { 1: 'POP_TOP', 2: 'PUSH_NULL', 9: 'NOP', 11: 'UNARY_NEGATIVE', 12: 'UNARY_NOT', 15: 'UNARY_INVERT', 25: 'BINARY_SUBSCR', 30: 'GET_LEN', 60: 'STORE_SUBSCR', 68: 'GET_ITER', 71: 'LOAD_BUILD_CLASS', 83: 'RETURN_VALUE', 89: 'POP_EXCEPT', 90: 'STORE_NAME', 91: 'DELETE_NAME', 92: 'UNPACK_SEQUENCE', 93: 'FOR_ITER', 95: 'STORE_ATTR', 97: 'STORE_GLOBAL', 99: 'SWAP', 100: 'LOAD_CONST', 101: 'LOAD_NAME', 102: 'BUILD_TUPLE', 103: 'BUILD_LIST', 104: 'BUILD_SET', 105: 'BUILD_MAP', 106: 'LOAD_ATTR', 107: 'COMPARE_OP', 108: 'IMPORT_NAME', 109: 'IMPORT_FROM', 110: 'JUMP_FORWARD', 114: 'POP_JUMP_IF_FALSE', 115: 'POP_JUMP_IF_TRUE', 116: 'LOAD_GLOBAL', 117: 'IS_OP', 118: 'CONTAINS_OP', 120: 'COPY', 121: 'RETURN_CONST', 122: 'BINARY_OP', 124: 'LOAD_FAST', 125: 'STORE_FAST', 126: 'DELETE_FAST', 128: 'POP_JUMP_IF_NOT_NONE', 129: 'POP_JUMP_IF_NONE', 130: 'RAISE_VARARGS', 132: 'MAKE_FUNCTION', 133: 'BUILD_SLICE', 140: 'JUMP_BACKWARD', 144: 'EXTENDED_ARG', 149: 'COPY_FREE_VARS', 150: 'YIELD_VALUE', 151: 'RESUME', 155: 'FORMAT_VALUE', 156: 'BUILD_CONST_KEY_MAP', 157: 'BUILD_STRING', 162: 'LIST_EXTEND', 171: 'CALL', 172: 'KW_NAMES', 137: 'LOAD_DEREF', 138: 'STORE_DEREF', 136: 'LOAD_CLOSURE', 141: 'LOAD_SUPER_ATTR', 142: 'CALL_FUNCTION_EX', 145: 'LIST_APPEND', 147: 'MAP_ADD', 94: 'UNPACK_EX', 96: 'DELETE_ATTR', 98: 'DELETE_GLOBAL' },
  '3.13': { 32: 'POP_TOP', 34: 'PUSH_NULL', 30: 'NOP', 42: 'UNARY_NEGATIVE', 43: 'UNARY_NOT', 41: 'UNARY_INVERT', 40: 'TO_BOOL', 5: 'BINARY_SUBSCR', 39: 'STORE_SUBSCR', 19: 'GET_ITER', 24: 'LOAD_BUILD_CLASS', 36: 'RETURN_VALUE', 114: 'STORE_NAME', 67: 'DELETE_NAME', 117: 'UNPACK_SEQUENCE', 72: 'FOR_ITER', 108: 'STORE_ATTR', 113: 'STORE_GLOBAL', 115: 'SWAP', 83: 'LOAD_CONST', 92: 'LOAD_NAME', 52: 'BUILD_TUPLE', 47: 'BUILD_LIST', 49: 'BUILD_SET', 48: 'BUILD_MAP', 82: 'LOAD_ATTR', 58: 'COMPARE_OP', 75: 'IMPORT_NAME', 74: 'IMPORT_FROM', 79: 'JUMP_FORWARD', 97: 'POP_JUMP_IF_FALSE', 100: 'POP_JUMP_IF_TRUE', 91: 'LOAD_GLOBAL', 76: 'IS_OP', 59: 'CONTAINS_OP', 61: 'COPY', 103: 'RETURN_CONST', 104: 'SEND', 45: 'BINARY_OP', 85: 'LOAD_FAST', 110: 'STORE_FAST', 65: 'DELETE_FAST', 98: 'POP_JUMP_IF_NONE', 99: 'POP_JUMP_IF_NOT_NONE', 101: 'RAISE_VARARGS', 26: 'MAKE_FUNCTION', 50: 'BUILD_SLICE', 77: 'JUMP_BACKWARD', 71: 'EXTENDED_ARG', 62: 'COPY_FREE_VARS', 118: 'YIELD_VALUE', 149: 'RESUME', 14: 'FORMAT_SIMPLE', 15: 'FORMAT_WITH_SPEC', 46: 'BUILD_CONST_KEY_MAP', 51: 'BUILD_STRING', 81: 'LIST_EXTEND', 53: 'CALL', 57: 'CALL_KW', 84: 'LOAD_DEREF', 109: 'STORE_DEREF', 93: 'LOAD_SUPER_ATTR', 80: 'LIST_APPEND', 95: 'MAP_ADD', 116: 'UNPACK_EX', 63: 'DELETE_ATTR', 66: 'DELETE_GLOBAL', 88: 'LOAD_FAST_LOAD_FAST', 111: 'STORE_FAST_LOAD_FAST' },
};
const CMP_OP = ['<', '<=', '==', '!=', '>', '>=']; // COMPARE_OP low bits
const BIN_OP = ['+', '&', '//', '<<', '@', '*', '%', '|', '**', '>>', '-', '/', '^', '+=', '&=', '//=', '<<=', '@=', '*=', '%=', '|=', '**=', '>>=', '-=', '/=', '^='];

/** Minimal marshal reader: enough to recover code objects, their names, consts and bytecode. */
function unmarshal(buf, start) {
  let o = start; const refs = [];
  const u8 = () => buf[o++];
  const u32 = () => { const v = buf.readUInt32LE(o); o += 4; return v; };
  const rstr = (n) => { const s = buf.toString('latin1', o, o + n); o += n; return s; };
  function obj() {
    let type = u8(); const ref = type & 0x80; type &= 0x7f; const T = String.fromCharCode(type);
    let v, slot = -1;
    if (ref) { slot = refs.length; refs.push(null); }
    if (T === '0') v = null; else if (T === 'N') v = null; else if (T === 'F') v = false; else if (T === 'T') v = true; else if (T === '.' || T === 'S') v = null;
    else if (T === 'i') { v = buf.readInt32LE(o); o += 4; }
    else if (T === 'I') { v = buf.readBigInt64LE(o); o += 8; }
    else if (T === 'g') { v = buf.readDoubleLE(o); o += 8; }
    else if (T === 'l') { const n = buf.readInt32LE(o); o += 4; const k = Math.abs(n); let big = 0n; for (let i = 0; i < k; i += 1) { big |= BigInt(buf.readUInt16LE(o)) << BigInt(15 * i); o += 2; } v = n < 0 ? -big : big; }
    else if (T === 's' || T === 't' || T === 'u' || T === 'a' || T === 'A') { const n = u32(); v = rstr(n); }
    else if (T === 'z' || T === 'Z') { const n = u8(); v = rstr(n); }
    else if (T === ')') { const n = u8(); v = []; for (let i = 0; i < n; i += 1) v.push(obj()); }
    else if (T === '(' || T === '[') { const n = u32(); v = []; for (let i = 0; i < n; i += 1) v.push(obj()); }
    else if (T === '{') { v = {}; for (;;) { const k = obj(); if (k === undefined) break; const val = obj(); if (typeof k === 'string') v[k] = val; } }
    else if (T === 'r') { const i = u32(); v = refs[i]; }
    else if (T === 'c') { v = code(); }
    else { v = undefined; } // unknown marshal type: stop this branch
    if (slot >= 0) refs[slot] = v;
    return v;
  }
  function code() {
    const c = {};
    c.argcount = buf.readInt32LE(o); o += 4; c.posonly = buf.readInt32LE(o); o += 4; c.kwonly = buf.readInt32LE(o); o += 4;
    c.stacksize = buf.readInt32LE(o); o += 4; c.flags = buf.readInt32LE(o); o += 4;
    c.codeObj = obj(); c.consts = obj(); c.names = obj(); c.localsplus = obj(); c.kinds = obj();
    c.filename = obj(); c.name = obj(); c.qualname = obj(); c.firstlineno = buf.readInt32LE(o); o += 4;
    c.linetable = obj(); c.exceptiontable = obj();
    c.isCode = true; return c;
  }
  return obj();
}

const repr = (v) => {
  if (v === null) return 'None'; if (v === true) return 'True'; if (v === false) return 'False';
  if (typeof v === 'string') return JSON.stringify(v); if (typeof v === 'bigint') return v.toString();
  if (v && v.isCode) return `<code ${v.name}>`; if (Array.isArray(v)) return '(' + v.map(repr).join(', ') + ')';
  return String(v);
};

/** Disassemble a code object's wordcode into { off, text } lines, resolving args. */
function disasm(c, version) {
  const map = OPMAP[version] || OPMAP['3.12']; const code = Buffer.from(c.codeObj, 'latin1'); const out = [];
  let ext = 0;
  for (let i = 0; i < code.length; i += 2) {
    const op = code[i], a = code[i + 1]; const name = map[op];
    if (name === 'CACHE' || op === 0) continue; // inline cache slot
    let arg = (ext << 8) | a; const isExt = name === 'EXTENDED_ARG';
    if (isExt) { ext = arg; continue; } ext = 0;
    let txt = name || `<op ${op}>`;
    if (!name) { out.push({ off: i, text: txt }); continue; }
    if (name === 'LOAD_CONST' || name === 'RETURN_CONST' || name === 'KW_NAMES') txt += ' ' + repr((c.consts || [])[arg]);
    else if (/NAME|GLOBAL|ATTR|IMPORT/.test(name)) txt += ' ' + ((c.names || [])[name === 'LOAD_GLOBAL' ? arg >> 1 : arg] || arg);
    else if (/LOAD_FAST|STORE_FAST|DELETE_FAST/.test(name)) txt += ' ' + ((c.localsplus || [])[arg] || `v${arg}`);
    else if (name === 'COMPARE_OP') txt += ' ' + (CMP_OP[arg >> 4] || CMP_OP[arg >> 5] || arg);
    else if (name === 'BINARY_OP') txt += ' ' + (BIN_OP[arg] || arg);
    else if (/^(JUMP_FORWARD|FOR_ITER|SEND)$/.test(name)) txt += ' ' + (i + 2 + arg * 2);
    else if (/POP_JUMP_IF|^JUMP$/.test(name)) txt += ' ' + (i + 2 + arg * 2);
    else if (name === 'JUMP_BACKWARD') txt += ' ' + (i + 2 - arg * 2);
    else if (name === 'CALL' || name === 'CALL_KW') txt += ' ' + arg;
    else if (arg) txt += ' ' + arg;
    out.push({ off: i, text: txt });
  }
  return out;
}

/** Walk the top code object and every nested code object (functions, comprehensions). */
function functions(top) {
  const list = []; const seen = new Set();
  const walk = (c, depth) => { if (!c || !c.isCode || seen.has(c)) return; seen.add(c); list.push({ c, depth }); for (const k of (c.consts || [])) if (k && k.isCode) walk(k, depth + 1); };
  walk(top, 0); return list;
}

const PY_BIN = ['+', '&', '//', '<<', '@', '*', '%', '|', '**', '>>', '-', '/', '^', '+=', '&=', '//=', '<<=', '@=', '*=', '%=', '|=', '**=', '>>=', '-=', '/=', '^='];
const PY_JMPIF = { POP_JUMP_IF_FALSE: '!', POP_JUMP_IF_TRUE: '', POP_JUMP_IF_NONE: ' is None', POP_JUMP_IF_NOT_NONE: ' is not None', JUMP_IF_FALSE_OR_POP: '!', JUMP_IF_TRUE_OR_POP: '' };

/** Lift a disassembled code object to pseudo-Python as label+goto lines for structureLinear.
 * The operand stack carries each value's origin offset so a collapsed statement keys to the
 * first contributing offset — the offset a branch points at. Best-effort for the common opcodes. */
function liftPyc(insns) {
  const out = []; const st = [];
  const push = (x, o) => st.push({ x, o }); const pop = () => (st.length ? st.pop() : { x: '?', o: 0 });
  const emit = (off, text) => out.push({ off, text }); const L = (t) => `L_${Number(t).toString(16)}`; // hex, to match structureLinear's offOf
  for (const ins of insns) {
    const sp = ins.text.indexOf(' '); const op = sp < 0 ? ins.text : ins.text.slice(0, sp); const arg = sp < 0 ? '' : ins.text.slice(sp + 1); const O = ins.off;
    if (/^(RESUME|NOP|CACHE|PRECALL|MAKE_CELL|COPY_FREE_VARS|RETURN_GENERATOR|PUSH_NULL)$/.test(op)) { continue; }
    if (op === 'LOAD_CONST' || op === 'RETURN_CONST') { if (op === 'RETURN_CONST') { emit(O, `return ${arg};`); } else push(arg, O); continue; }
    if (/^LOAD_(FAST|NAME|GLOBAL|DEREF|CLASSDEREF|FAST_CHECK)/.test(op)) { push(arg.replace(/^NULL \+ /, ''), O); continue; }
    if (op === 'STORE_FAST' || op === 'STORE_NAME' || op === 'STORE_GLOBAL' || op === 'STORE_DEREF') { const a = pop(); emit(Math.min(O, a.o), `${arg} = ${a.x};`); continue; }
    if (op === 'LOAD_ATTR' || op === 'LOAD_METHOD') { const a = pop(); push(`${a.x}.${arg.replace(/^NULL\|self \+ /, '')}`, Math.min(O, a.o)); continue; }
    if (op === 'STORE_ATTR') { const o2 = pop(), v = pop(); emit(Math.min(O, v.o), `${o2.x}.${arg} = ${v.x};`); continue; }
    if (op === 'BINARY_OP') { const b = pop(), a = pop(); const sym = (arg.length > 1 && arg.endsWith('=') && arg !== '==') ? arg.slice(0, -1) : arg; push(`(${a.x} ${sym} ${b.x})`, Math.min(a.o, O)); continue; }
    if (op === 'BINARY_SUBSCR') { const i = pop(), a = pop(); push(`${a.x}[${i.x}]`, Math.min(a.o, O)); continue; }
    if (op === 'STORE_SUBSCR') { const i = pop(), a = pop(), v = pop(); emit(Math.min(O, v.o), `${a.x}[${i.x}] = ${v.x};`); continue; }
    if (op === 'COMPARE_OP' || op === 'IS_OP' || op === 'CONTAINS_OP') { const b = pop(), a = pop(); const o3 = op === 'IS_OP' ? 'is' : op === 'CONTAINS_OP' ? 'in' : arg; push(`(${a.x} ${o3} ${b.x})`, Math.min(a.o, O)); continue; }
    if (/^UNARY_/.test(op)) { const a = pop(); push(`${op === 'UNARY_NEGATIVE' ? '-' : op === 'UNARY_NOT' ? 'not ' : op === 'UNARY_INVERT' ? '~' : ''}${a.x}`, Math.min(a.o, O)); continue; }
    if (op === 'CALL' || op === 'CALL_FUNCTION' || op === 'CALL_METHOD' || op === 'CALL_KW') { const n = parseInt(arg, 10) || 0; const args = []; for (let i = 0; i < n; i += 1) args.unshift(pop().x); const fn = pop(); if (st.length && st[st.length - 1].x === '') pop(); push(`${fn.x}(${args.join(', ')})`, Math.min(O, fn.o)); continue; }
    if (/^BUILD_(LIST|TUPLE|SET)/.test(op)) { const n = parseInt(arg, 10) || 0; const e = []; for (let i = 0; i < n; i += 1) e.unshift(pop().x); push(op.includes('LIST') ? `[${e.join(', ')}]` : op.includes('SET') ? `{${e.join(', ')}}` : `(${e.join(', ')})`, O); continue; }
    if (op === 'BUILD_MAP' || op === 'BUILD_CONST_KEY_MAP') { push('{...}', O); continue; }
    if (op === 'RETURN_VALUE') { const a = pop(); emit(Math.min(O, a.o), `return ${a.x};`); continue; }
    if (op === 'YIELD_VALUE') { const a = pop(); emit(Math.min(O, a.o), `yield ${a.x};`); continue; }
    if (op === 'RAISE_VARARGS') { const a = parseInt(arg, 10) ? pop().x : ''; emit(O, `raise ${a};`); continue; }
    if (PY_JMPIF[op] != null) { const a = pop(); emit(Math.min(O, a.o), `if (${PY_JMPIF[op]}${a.x}) goto ${L(arg)};`); continue; }
    if (op === 'JUMP_FORWARD' || op === 'JUMP_BACKWARD' || op === 'JUMP' || op === 'JUMP_ABSOLUTE') { emit(O, `goto ${L(arg)};`); continue; }
    if (op === 'POP_TOP') { const a = pop(); if (/\(.*\)$/.test(a.x)) emit(Math.min(O, a.o), `${a.x};`); continue; } // a bare call result -> a statement
    if (op === 'POP_JUMP_FORWARD_IF_FALSE' || op === 'POP_JUMP_FORWARD_IF_TRUE') { const a = pop(); emit(Math.min(O, a.o), `if (${op.includes('FALSE') ? '!' : ''}${a.x}) goto ${L(arg)};`); continue; }
    if (op === 'IMPORT_NAME') { pop(); pop(); push(`import ${arg}`, O); continue; }
    if (op === 'MAKE_FUNCTION') { push('<function>', O); continue; }
    if (op === 'GET_ITER' || op === 'FOR_ITER' || op === 'END_FOR' || op === 'KW_NAMES') { if (op === 'FOR_ITER') emit(O, `for-iter goto ${L(arg)} on exhaustion;`); continue; }
    if (op === 'COPY' || op === 'SWAP' || op === 'DUP_TOP') { if (op === 'COPY') { const a = st[st.length - (parseInt(arg, 10) || 1)]; if (a) st.push({ ...a }); } continue; }
    emit(O, `// ${ins.text}`);
  }
  return out;
}

/** Read a .pyc: header + magic/version, then the marshalled top-level code object. */
function readPyc(buf) {
  if (buf.length < 20) throw new Error('too short for a .pyc');
  const magic = buf.readUInt16LE(0);
  if (buf[2] !== 0x0d || buf[3] !== 0x0a) throw new Error('not a .pyc (bad magic tail)');
  const version = MAGIC[magic] || null;
  const top = unmarshal(buf, 16); // 16-byte header: magic(4) + bitfield(4) + 8 (hash, or mtime+size)
  if (!top || !top.isCode) throw new Error('no top-level code object');
  return { magicHex: buf.toString('hex', 0, 4), version, top };
}

export { readPyc, disasm, liftPyc, functions, OPMAP };
