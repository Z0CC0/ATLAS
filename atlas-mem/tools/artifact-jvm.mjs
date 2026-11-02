/**
 * ATLAS — a Java .class file read as a constant pool, methods, and JVM bytecode, lifted to
 * pseudo-Java. The class-file layout, the constant-pool tags and the opcode table are from
 * the specification (The Java Virtual Machine Specification, Java SE, chapters 4 and 6), not
 * from any tool's source. The lift turns the operand stack back into expressions the way the
 * CIL and Dalvik lifters do. Nothing is executed.
 */

// JVM opcode -> [mnemonic, operand bytes after the opcode]. -1 means a variable-length operand
// (tableswitch / lookupswitch), handled specially in decode().
const OP = new Array(256).fill(null);
const set = (c, n, len) => { OP[c] = [n, len || 0]; };
const range = (start, len, names) => names.forEach((n, i) => set(start + i, n, len));
set(0x00, 'nop'); set(0x01, 'aconst_null');
range(0x02, 0, ['iconst_m1', 'iconst_0', 'iconst_1', 'iconst_2', 'iconst_3', 'iconst_4', 'iconst_5', 'lconst_0', 'lconst_1', 'fconst_0', 'fconst_1', 'fconst_2', 'dconst_0', 'dconst_1']);
set(0x10, 'bipush', 1); set(0x11, 'sipush', 2); set(0x12, 'ldc', 1); set(0x13, 'ldc_w', 2); set(0x14, 'ldc2_w', 2);
range(0x15, 1, ['iload', 'lload', 'fload', 'dload', 'aload']);
range(0x1a, 0, ['iload_0', 'iload_1', 'iload_2', 'iload_3', 'lload_0', 'lload_1', 'lload_2', 'lload_3', 'fload_0', 'fload_1', 'fload_2', 'fload_3', 'dload_0', 'dload_1', 'dload_2', 'dload_3', 'aload_0', 'aload_1', 'aload_2', 'aload_3']);
range(0x2e, 0, ['iaload', 'laload', 'faload', 'daload', 'aaload', 'baload', 'caload', 'saload']);
range(0x36, 1, ['istore', 'lstore', 'fstore', 'dstore', 'astore']);
range(0x3b, 0, ['istore_0', 'istore_1', 'istore_2', 'istore_3', 'lstore_0', 'lstore_1', 'lstore_2', 'lstore_3', 'fstore_0', 'fstore_1', 'fstore_2', 'fstore_3', 'dstore_0', 'dstore_1', 'dstore_2', 'dstore_3', 'astore_0', 'astore_1', 'astore_2', 'astore_3']);
range(0x4f, 0, ['iastore', 'lastore', 'fastore', 'dastore', 'aastore', 'bastore', 'castore', 'sastore']);
range(0x57, 0, ['pop', 'pop2', 'dup', 'dup_x1', 'dup_x2', 'dup2', 'dup2_x1', 'dup2_x2', 'swap']);
range(0x60, 0, ['iadd', 'ladd', 'fadd', 'dadd', 'isub', 'lsub', 'fsub', 'dsub', 'imul', 'lmul', 'fmul', 'dmul', 'idiv', 'ldiv', 'fdiv', 'ddiv', 'irem', 'lrem', 'frem', 'drem', 'ineg', 'lneg', 'fneg', 'dneg', 'ishl', 'lshl', 'ishr', 'lshr', 'iushr', 'lushr', 'iand', 'land', 'ior', 'lor', 'ixor', 'lxor']);
set(0x84, 'iinc', 2);
range(0x85, 0, ['i2l', 'i2f', 'i2d', 'l2i', 'l2f', 'l2d', 'f2i', 'f2l', 'f2d', 'd2i', 'd2l', 'd2f', 'i2b', 'i2c', 'i2s']);
range(0x94, 0, ['lcmp', 'fcmpl', 'fcmpg', 'dcmpl', 'dcmpg']);
range(0x99, 2, ['ifeq', 'ifne', 'iflt', 'ifge', 'ifgt', 'ifle', 'if_icmpeq', 'if_icmpne', 'if_icmplt', 'if_icmpge', 'if_icmpgt', 'if_icmple', 'if_acmpeq', 'if_acmpne']);
set(0xa7, 'goto', 2); set(0xa8, 'jsr', 2); set(0xa9, 'ret', 1); set(0xaa, 'tableswitch', -1); set(0xab, 'lookupswitch', -1);
range(0xac, 0, ['ireturn', 'lreturn', 'freturn', 'dreturn', 'areturn', 'return']);
range(0xb2, 2, ['getstatic', 'putstatic', 'getfield', 'putfield', 'invokevirtual', 'invokespecial', 'invokestatic']);
set(0xb9, 'invokeinterface', 4); set(0xba, 'invokedynamic', 4); set(0xbb, 'new', 2); set(0xbc, 'newarray', 1); set(0xbd, 'anewarray', 2);
set(0xbe, 'arraylength'); set(0xbf, 'athrow'); set(0xc0, 'checkcast', 2); set(0xc1, 'instanceof', 2); set(0xc2, 'monitorenter'); set(0xc3, 'monitorexit');
set(0xc4, 'wide', -1); set(0xc5, 'multianewarray', 3); set(0xc6, 'ifnull', 2); set(0xc7, 'ifnonnull', 2); set(0xc8, 'goto_w', 4); set(0xc9, 'jsr_w', 4);

/** Parse the constant pool. Returns an array (1-indexed) of entries. */
function constantPool(buf, o, count) {
  const cp = new Array(count); let i = 1;
  while (i < count) {
    const tag = buf[o]; o += 1; let e;
    if (tag === 1) { const len = buf.readUInt16BE(o); e = { tag, str: buf.toString('utf8', o + 2, o + 2 + len) }; o += 2 + len; }
    else if (tag === 3 || tag === 4) { e = { tag, val: tag === 3 ? buf.readInt32BE(o) : buf.readFloatBE(o) }; o += 4; }
    else if (tag === 5 || tag === 6) { e = { tag, val: tag === 5 ? buf.readBigInt64BE(o) : buf.readDoubleBE(o) }; o += 8; }
    else if (tag === 7 || tag === 8 || tag === 16 || tag === 19 || tag === 20) { e = { tag, ref: buf.readUInt16BE(o) }; o += 2; }
    else if (tag === 9 || tag === 10 || tag === 11 || tag === 12 || tag === 17 || tag === 18) { e = { tag, a: buf.readUInt16BE(o), b: buf.readUInt16BE(o + 2) }; o += 4; }
    else if (tag === 15) { e = { tag, kind: buf[o], ref: buf.readUInt16BE(o + 1) }; o += 3; }
    else { e = { tag, bad: true }; break; }
    cp[i] = e; i += (tag === 5 || tag === 6) ? 2 : 1; // long/double take two pool slots
  }
  return { cp, end: o };
}

function utf8(cp, i) { const e = cp[i]; return e && e.tag === 1 ? e.str : `#${i}`; }
function className(cp, i) { const e = cp[i]; return e && e.tag === 7 ? utf8(cp, e.ref).replace(/\//g, '.') : `#${i}`; }
// a Fieldref / Methodref rendered as Owner.name
function memberName(cp, i) {
  const e = cp[i]; if (!e) return `#${i}`;
  if (e.tag === 18 || e.tag === 17) { const nt = cp[e.b]; return nt ? utf8(cp, nt.a) : `#${i}`; } // InvokeDynamic / Dynamic: the call-site name
  if (!(e.tag === 9 || e.tag === 10 || e.tag === 11)) return `#${i}`;
  const owner = className(cp, e.a); const nt = cp[e.b]; const nm = nt ? utf8(cp, nt.a) : '?';
  return `${owner.split('.').pop()}.${nm}`;
}
function constStr(cp, i) {
  const e = cp[i]; if (!e) return `#${i}`;
  if (e.tag === 8) return JSON.stringify(utf8(cp, e.ref));
  if (e.tag === 3 || e.tag === 4) return String(e.val);
  if (e.tag === 5 || e.tag === 6) return String(e.val);
  if (e.tag === 7) return className(cp, i) + '.class';
  return `#${i}`;
}

/** Decode a Code attribute's bytecode into { off, text } lines. */
function decode(code, cp) {
  const out = []; let o = 0;
  while (o < code.length) {
    const pc = o; const op = code[o]; o += 1; const ent = OP[op];
    if (!ent) { out.push({ off: pc, text: `.byte 0x${op.toString(16)}` }); continue; }
    const [name, len] = ent;
    if (len === -1) { // tableswitch / lookupswitch / wide
      if (name === 'wide') { const op2 = code[o]; o += 1; const idx = code.readUInt16BE(o); o += 2; let t = `wide ${OP[op2] ? OP[op2][0] : op2} ${idx}`; if (op2 === 0x84) { o += 2; } out.push({ off: pc, text: t }); continue; }
      o = (o + 3) & ~3; // pad to 4-byte boundary
      if (name === 'tableswitch') { const def = code.readInt32BE(o), lo = code.readInt32BE(o + 4), hi = code.readInt32BE(o + 8); o += 12; const n = hi - lo + 1; const cases = []; for (let k = 0; k < n; k += 1) { cases.push(`${lo + k}:${pc + code.readInt32BE(o)}`); o += 4; } out.push({ off: pc, text: `tableswitch default:${pc + def} ${cases.join(' ')}` }); }
      else { const def = code.readInt32BE(o), np = code.readInt32BE(o + 4); o += 8; const cases = []; for (let k = 0; k < np; k += 1) { const m = code.readInt32BE(o), t = code.readInt32BE(o + 4); cases.push(`${m}:${pc + t}`); o += 8; } out.push({ off: pc, text: `lookupswitch default:${pc + def} ${cases.join(' ')}` }); }
      continue;
    }
    let arg = '';
    if (name === 'iinc') { arg = ' ' + code[o] + ' ' + code.readInt8(o + 1); out.push({ off: pc, text: name + arg }); o += 2; continue; } // index(u8) + const(i8)
    if (len === 1) { arg = ' ' + (name === 'bipush' ? code.readInt8(o) : code[o]); }
    else if (len === 2) {
      const v = code.readUInt16BE(o);
      if (/^if|^goto|^jsr/.test(name)) arg = ' ' + (pc + code.readInt16BE(o)); // branch: absolute target
      else if (name === 'sipush') arg = ' ' + code.readInt16BE(o);
      else if (/^(getstatic|putstatic|getfield|putfield)$/.test(name)) arg = ' ' + memberName(cp, v);
      else if (/^invoke/.test(name)) arg = ' ' + memberName(cp, v);
      else if (name === 'new' || name === 'anewarray' || name === 'checkcast' || name === 'instanceof') arg = ' ' + className(cp, v);
      else if (name === 'ldc' || name === 'ldc_w' || name === 'ldc2_w') arg = ' ' + constStr(cp, v);
      else arg = ' #' + v;
    } else if (len === 4) {
      if (name === 'goto_w' || name === 'jsr_w') arg = ' ' + (pc + code.readInt32BE(o));
      else arg = ' ' + memberName(cp, code.readUInt16BE(o));
    } else if (len === 3) { arg = ' ' + className(cp, code.readUInt16BE(o)) + ', ' + code[o + 2]; }
    if (name === 'ldc') arg = ' ' + constStr(cp, code[o]);
    out.push({ off: pc, text: name + arg });
    o += len;
  }
  return out;
}

const LD = /^(iload|lload|fload|dload|aload)(_(\d)|\s+(\d+))/;
const ST = /^(istore|lstore|fstore|dstore|astore)(_(\d)|\s+(\d+))/;
const BIN = { iadd: '+', ladd: '+', fadd: '+', dadd: '+', isub: '-', lsub: '-', fsub: '-', dsub: '-', imul: '*', lmul: '*', fmul: '*', dmul: '*', idiv: '/', ldiv: '/', fdiv: '/', ddiv: '/', irem: '%', lrem: '%', iand: '&', land: '&', ior: '|', lor: '|', ixor: '^', lxor: '^', ishl: '<<', lshl: '<<', ishr: '>>', lshr: '>>', iushr: '>>>', lushr: '>>>' };
const CONST = { aconst_null: 'null', iconst_m1: '-1', iconst_0: '0', iconst_1: '1', iconst_2: '2', iconst_3: '3', iconst_4: '4', iconst_5: '5', lconst_0: '0L', lconst_1: '1L', fconst_0: '0.0f', fconst_1: '1.0f', fconst_2: '2.0f', dconst_0: '0.0', dconst_1: '1.0' };
const CMP = { ifeq: '== 0', ifne: '!= 0', iflt: '< 0', ifge: '>= 0', ifgt: '> 0', ifle: '<= 0', ifnull: '== null', ifnonnull: '!= null' };
const ICMP = { if_icmpeq: '==', if_icmpne: '!=', if_icmplt: '<', if_icmpge: '>=', if_icmpgt: '>', if_icmple: '<=', if_acmpeq: '==', if_acmpne: '!=' };

/** Lift a decoded method to pseudo-Java as label+goto lines for structureLinear. Each stack
 * value carries the offset of the instruction that produced it, so a statement that collapses
 * a chain is keyed to the chain's FIRST offset — the offset a branch target points at. */
function lift(insns) {
  const out = []; const st = []; // operand stack of { x: expression, o: origin offset }
  const push = (x, o) => st.push({ x, o });
  const pop = () => (st.length ? st.pop() : { x: '?', o: 0 });
  const label = (t) => `L_${Number(t).toString(16)}`; // hex, to match structureLinear's offOf
  const emit = (off, text) => out.push({ off, text });
  for (const ins of insns) {
    const sp = ins.text.indexOf(' '); const op = sp < 0 ? ins.text : ins.text.slice(0, sp); const rest = sp < 0 ? '' : ins.text.slice(sp + 1); const O = ins.off;
    if (op === 'nop' || op === 'wide') continue;
    if (CONST[op] != null) { push(CONST[op], O); continue; }
    if (op === 'bipush' || op === 'sipush' || op === 'ldc' || op === 'ldc_w' || op === 'ldc2_w') { push(rest, O); continue; }
    let m = LD.exec(ins.text); if (m) { push('v' + (m[3] != null ? m[3] : m[4]), O); continue; }
    m = ST.exec(ins.text); if (m) { const a = pop(); emit(Math.min(O, a.o), `v${m[3] != null ? m[3] : m[4]} = ${a.x};`); continue; }
    if (op.endsWith('aload')) { const i = pop(), a = pop(); push(`${a.x}[${i.x}]`, Math.min(a.o, O)); continue; }
    if (op.endsWith('astore')) { const v = pop(), i = pop(), a = pop(); emit(Math.min(O, a.o), `${a.x}[${i.x}] = ${v.x};`); continue; }
    if (BIN[op]) { const b = pop(), a = pop(); push(`(${a.x} ${BIN[op]} ${b.x})`, Math.min(a.o, O)); continue; }
    if (/^[ilfd]neg$/.test(op)) { const a = pop(); push(`(-${a.x})`, Math.min(a.o, O)); continue; }
    if (/^(i2l|i2f|i2d|l2i|l2f|l2d|f2i|f2l|f2d|d2i|d2l|d2f|i2b|i2c|i2s)$/.test(op)) { const a = pop(); push(`(${op.slice(2)})${a.x}`, Math.min(a.o, O)); continue; }
    if (op === 'iinc') { const [v, n] = rest.split(' '); emit(O, `v${v} += ${n};`); continue; }
    if (op === 'dup') { const t = pop(); st.push(t); st.push(t); continue; }
    if (op === 'pop' || op === 'pop2') { pop(); continue; }
    if (op === 'getstatic') { push(rest, O); continue; }
    if (op === 'getfield') { const a = pop(); push(`${a.x}.${rest.split('.').pop()}`, Math.min(a.o, O)); continue; }
    if (op === 'putstatic') { const a = pop(); emit(Math.min(O, a.o), `${rest} = ${a.x};`); continue; }
    if (op === 'putfield') { const v = pop(), o = pop(); emit(Math.min(O, o.o), `${o.x}.${rest.split('.').pop()} = ${v.x};`); continue; }
    if (op === 'new') { push(`new ${rest}`, O); continue; }
    if (op === 'newarray' || op === 'anewarray') { const a = pop(); push(`new ${op === 'anewarray' ? rest : 'array'}[${a.x}]`, Math.min(a.o, O)); continue; }
    if (op === 'arraylength') { const a = pop(); push(`${a.x}.length`, Math.min(a.o, O)); continue; }
    if (op === 'checkcast') { const a = pop(); push(`(${rest})${a.x}`, Math.min(a.o, O)); continue; }
    if (op === 'instanceof') { const a = pop(); push(`(${a.x} instanceof ${rest})`, Math.min(a.o, O)); continue; }
    if (/^invoke/.test(op)) {
      const name = rest.split('.').pop(); const isStatic = op === 'invokestatic' || op === 'invokedynamic';
      const recv = isStatic ? rest.split('.').slice(0, -1).join('.') : pop().x; // arity is unknown here, so arguments are opaque
      const call = `${recv}.${name}(...)`;
      if (name === '<init>') emit(O, `${call};`); else push(call, O);
      continue;
    }
    if (CMP[op]) { const a = pop(); emit(Math.min(O, a.o), `if (${a.x} ${CMP[op]}) goto ${label(rest)};`); continue; }
    if (ICMP[op]) { const b = pop(), a = pop(); emit(Math.min(O, a.o), `if (${a.x} ${ICMP[op]} ${b.x}) goto ${label(rest)};`); continue; }
    if (op === 'goto' || op === 'goto_w') { emit(O, `goto ${label(rest)};`); continue; }
    if (/^[ilfda]return$/.test(op)) { const a = pop(); emit(Math.min(O, a.o), `return ${a.x};`); continue; }
    if (op === 'return') { emit(O, 'return;'); continue; }
    if (op === 'athrow') { const a = pop(); emit(Math.min(O, a.o), `throw ${a.x};`); continue; }
    if (op === 'tableswitch' || op === 'lookupswitch') { const key = pop(); const parts = rest.split(' '); const cs = parts.map((p) => { const [k, t] = p.split(':'); return k === 'default' ? `default: goto ${label(t)};` : `case ${k}: goto ${label(t)};`; }); emit(Math.min(O, key.o), `switch (${key.x}) { ${cs.join(' ')} }`); continue; }
    emit(O, `// ${ins.text}`);
  }
  return out;
}

/** Read a whole .class file: version, this/super, fields, methods with decoded code. */
function readClass(buf) {
  if (buf.length < 10 || buf.readUInt32BE(0) !== 0xcafebabe) throw new Error('not a Java .class file');
  const major = buf.readUInt16BE(6);
  const cpCount = buf.readUInt16BE(8);
  const { cp, end } = constantPool(buf, 10, cpCount);
  let o = end;
  const access = buf.readUInt16BE(o); o += 2;
  const thisClass = className(cp, buf.readUInt16BE(o)); o += 2;
  const superClass = buf.readUInt16BE(o) ? className(cp, buf.readUInt16BE(o)) : null; o += 2;
  const ifaceN = buf.readUInt16BE(o); o += 2; const interfaces = [];
  for (let i = 0; i < ifaceN; i += 1) { interfaces.push(className(cp, buf.readUInt16BE(o))); o += 2; }
  const readMembers = () => {
    const n = buf.readUInt16BE(o); o += 2; const arr = [];
    for (let i = 0; i < n; i += 1) {
      const flags = buf.readUInt16BE(o); const name = utf8(cp, buf.readUInt16BE(o + 2)); const desc = utf8(cp, buf.readUInt16BE(o + 4)); o += 6;
      const attrN = buf.readUInt16BE(o); o += 2; let code = null;
      for (let a = 0; a < attrN; a += 1) {
        const an = utf8(cp, buf.readUInt16BE(o)); const alen = buf.readUInt32BE(o + 2); const abody = o + 6;
        if (an === 'Code') { const maxStack = buf.readUInt16BE(abody), maxLocals = buf.readUInt16BE(abody + 2), clen = buf.readUInt32BE(abody + 4); code = { maxStack, maxLocals, bytes: buf.subarray(abody + 8, abody + 8 + clen) }; }
        o = abody + alen;
      }
      arr.push({ flags, name, desc, code });
    }
    return arr;
  };
  const fields = readMembers();
  const methods = readMembers();
  return { major, access, thisClass, superClass, interfaces, fields, methods, cp };
}

export { readClass, decode, lift, OP };
