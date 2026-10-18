/**
 * ATLAS — a .NET method body read as instructions (CIL / MSIL).
 *
 * The opcode table and the operand kinds are from the specification (ECMA-335, Common
 * Language Infrastructure, Partition III), not from any tool's source: an opcode map is a
 * fact about the format, like the layout of a header. `artifact-bin.mjs` reads the metadata
 * tables and hands this module a method body and a way to turn a token into a name; this
 * module turns the bytes into a listing. Nothing is executed.
 */

// Operand kinds, with the bytes each takes after the opcode.
const SIZE = { none: 0, var8: 1, var16: 2, i1: 1, i4: 4, i8: 8, r4: 4, r8: 8, br8: 1, br32: 4, tok: 4, str: 4, sig: 4, sw: -1 };

// Single-byte opcodes. Built from the spec's contiguous families to stay compact and exact.
const OP = new Array(256).fill(null);
const set = (code, name, kind) => { OP[code] = [name, kind || 'none']; };
const range = (start, kind, names) => names.forEach((n, i) => set(start + i, n, kind));

set(0x00, 'nop'); set(0x01, 'break');
range(0x02, 'none', ['ldarg.0', 'ldarg.1', 'ldarg.2', 'ldarg.3', 'ldloc.0', 'ldloc.1', 'ldloc.2', 'ldloc.3', 'stloc.0', 'stloc.1', 'stloc.2', 'stloc.3']);
set(0x0e, 'ldarg.s', 'var8'); set(0x0f, 'ldarga.s', 'var8'); set(0x10, 'starg.s', 'var8');
set(0x11, 'ldloc.s', 'var8'); set(0x12, 'ldloca.s', 'var8'); set(0x13, 'stloc.s', 'var8');
set(0x14, 'ldnull'); set(0x15, 'ldc.i4.m1');
range(0x16, 'none', ['ldc.i4.0', 'ldc.i4.1', 'ldc.i4.2', 'ldc.i4.3', 'ldc.i4.4', 'ldc.i4.5', 'ldc.i4.6', 'ldc.i4.7', 'ldc.i4.8']);
set(0x1f, 'ldc.i4.s', 'i1'); set(0x20, 'ldc.i4', 'i4'); set(0x21, 'ldc.i8', 'i8'); set(0x22, 'ldc.r4', 'r4'); set(0x23, 'ldc.r8', 'r8');
set(0x25, 'dup'); set(0x26, 'pop'); set(0x27, 'jmp', 'tok'); set(0x28, 'call', 'tok'); set(0x29, 'calli', 'sig'); set(0x2a, 'ret');
range(0x2b, 'br8', ['br.s', 'brfalse.s', 'brtrue.s', 'beq.s', 'bge.s', 'bgt.s', 'ble.s', 'blt.s', 'bne.un.s', 'bge.un.s', 'bgt.un.s', 'ble.un.s', 'blt.un.s']);
range(0x38, 'br32', ['br', 'brfalse', 'brtrue', 'beq', 'bge', 'bgt', 'ble', 'blt', 'bne.un', 'bge.un', 'bgt.un', 'ble.un', 'blt.un']);
set(0x45, 'switch', 'sw');
range(0x46, 'none', ['ldind.i1', 'ldind.u1', 'ldind.i2', 'ldind.u2', 'ldind.i4', 'ldind.u4', 'ldind.i8', 'ldind.i', 'ldind.r4', 'ldind.r8', 'ldind.ref', 'stind.ref', 'stind.i1', 'stind.i2', 'stind.i4', 'stind.i8', 'stind.r4', 'stind.r8', 'add', 'sub', 'mul', 'div', 'div.un', 'rem', 'rem.un', 'and', 'or', 'xor', 'shl', 'shr', 'shr.un', 'neg', 'not', 'conv.i1', 'conv.i2', 'conv.i4', 'conv.i8', 'conv.r4', 'conv.r8', 'conv.u4', 'conv.u8']);
set(0x6f, 'callvirt', 'tok'); set(0x70, 'cpobj', 'tok'); set(0x71, 'ldobj', 'tok'); set(0x72, 'ldstr', 'str'); set(0x73, 'newobj', 'tok');
set(0x74, 'castclass', 'tok'); set(0x75, 'isinst', 'tok'); set(0x76, 'conv.r.un'); set(0x79, 'unbox', 'tok'); set(0x7a, 'throw');
set(0x7b, 'ldfld', 'tok'); set(0x7c, 'ldflda', 'tok'); set(0x7d, 'stfld', 'tok'); set(0x7e, 'ldsfld', 'tok'); set(0x7f, 'ldsflda', 'tok'); set(0x80, 'stsfld', 'tok'); set(0x81, 'stobj', 'tok');
range(0x82, 'none', ['conv.ovf.i1.un', 'conv.ovf.i2.un', 'conv.ovf.i4.un', 'conv.ovf.i8.un', 'conv.ovf.u1.un', 'conv.ovf.u2.un', 'conv.ovf.u4.un', 'conv.ovf.u8.un', 'conv.ovf.i.un', 'conv.ovf.u.un']);
set(0x8c, 'box', 'tok'); set(0x8d, 'newarr', 'tok'); set(0x8e, 'ldlen'); set(0x8f, 'ldelema', 'tok');
range(0x90, 'none', ['ldelem.i1', 'ldelem.u1', 'ldelem.i2', 'ldelem.u2', 'ldelem.i4', 'ldelem.u4', 'ldelem.i8', 'ldelem.i', 'ldelem.r4', 'ldelem.r8', 'ldelem.ref', 'stelem.i', 'stelem.i1', 'stelem.i2', 'stelem.i4', 'stelem.i8', 'stelem.r4', 'stelem.r8', 'stelem.ref']);
set(0xa3, 'ldelem', 'tok'); set(0xa4, 'stelem', 'tok'); set(0xa5, 'unbox.any', 'tok');
range(0xb3, 'none', ['conv.ovf.i1', 'conv.ovf.u1', 'conv.ovf.i2', 'conv.ovf.u2', 'conv.ovf.i4', 'conv.ovf.u4', 'conv.ovf.i8', 'conv.ovf.u8']);
set(0xc2, 'refanyval', 'tok'); set(0xc3, 'ckfinite'); set(0xc6, 'mkrefany', 'tok'); set(0xd0, 'ldtoken', 'tok');
set(0xd1, 'conv.u2'); set(0xd2, 'conv.u1'); set(0xd3, 'conv.i'); set(0xd4, 'conv.ovf.i'); set(0xd5, 'conv.ovf.u');
range(0xd6, 'none', ['add.ovf', 'add.ovf.un', 'mul.ovf', 'mul.ovf.un', 'sub.ovf', 'sub.ovf.un', 'endfinally']);
set(0xdd, 'leave', 'br32'); set(0xde, 'leave.s', 'br8'); set(0xdf, 'stind.i'); set(0xe0, 'conv.u');

// Two-byte opcodes, prefix 0xfe.
const FE = {};
const setfe = (code, name, kind) => { FE[code] = [name, kind || 'none']; };
range._fe = 0; // unused
['arglist', 'ceq', 'cgt', 'cgt.un', 'clt', 'clt.un'].forEach((n, i) => setfe(i, n));
setfe(0x06, 'ldftn', 'tok'); setfe(0x07, 'ldvirtftn', 'tok');
setfe(0x09, 'ldarg', 'var16'); setfe(0x0a, 'ldarga', 'var16'); setfe(0x0b, 'starg', 'var16');
setfe(0x0c, 'ldloc', 'var16'); setfe(0x0d, 'ldloca', 'var16'); setfe(0x0e, 'stloc', 'var16'); setfe(0x0f, 'localloc');
setfe(0x11, 'endfilter'); setfe(0x12, 'unaligned.', 'var8'); setfe(0x13, 'volatile.'); setfe(0x14, 'tail.');
setfe(0x15, 'initobj', 'tok'); setfe(0x16, 'constrained.', 'tok'); setfe(0x17, 'cpblk'); setfe(0x18, 'initblk');
setfe(0x19, 'no.', 'var8'); setfe(0x1a, 'rethrow'); setfe(0x1c, 'sizeof', 'tok'); setfe(0x1d, 'refanytype'); setfe(0x1e, 'readonly.');

/**
 * Decode a method body's instruction stream. `code` is the Buffer, `[start, start+size)` the
 * IL bytes, `resolve` is { token(uint32)->string, string(uint32)->string }. Returns the
 * instructions, whether the whole stream decoded, and which opcode (if any) stopped it.
 */
function decode(code, start, size, resolve) {
  const end = start + size;
  const out = [];
  let p = start;
  let complete = true, stoppedAt = null;
  const rd = resolve || { token: (t) => `0x${t.toString(16)}`, string: (t) => `0x${t.toString(16)}` };
  while (p < end) {
    const il = p - start;
    let b = code[p]; p += 1;
    let entry, prefix = '';
    if (b === 0xfe) { const b2 = code[p]; p += 1; entry = FE[b2]; if (!entry) { complete = false; stoppedAt = `fe ${b2.toString(16)}`; break; } }
    else { entry = OP[b]; if (!entry) { complete = false; stoppedAt = b.toString(16); break; } }
    const [name, kind] = entry;
    let operand = null;
    const need = SIZE[kind];
    if (kind === 'sw') {
      if (p + 4 > end) { complete = false; stoppedAt = 'switch'; break; }
      const n = code.readUInt32LE(p); p += 4;
      if (p + n * 4 > end) { complete = false; stoppedAt = 'switch'; break; }
      const base = p + n * 4; const targets = [];
      for (let i = 0; i < n; i += 1) { targets.push((base - start) + code.readInt32LE(p)); p += 4; }
      operand = targets;
    } else if (need > 0) {
      if (p + need > end) { complete = false; stoppedAt = name; break; }
      switch (kind) {
        case 'var8': operand = code.readUInt8(p); break;
        case 'var16': operand = code.readUInt16LE(p); break;
        case 'i1': operand = code.readInt8(p); break;
        case 'i4': operand = code.readInt32LE(p); break;
        case 'i8': operand = Number(code.readBigInt64LE(p)); break;
        case 'r4': operand = code.readFloatLE(p); break;
        case 'r8': operand = code.readDoubleLE(p); break;
        case 'br8': operand = { target: (p + 1 - start) + code.readInt8(p) }; break;
        case 'br32': operand = { target: (p + 4 - start) + code.readInt32LE(p) }; break;
        case 'tok': operand = { token: code.readUInt32LE(p), name: rd.token(code.readUInt32LE(p)) }; break;
        case 'sig': operand = { token: code.readUInt32LE(p) }; break;
        case 'str': { const tk = code.readUInt32LE(p); operand = { token: tk, value: rd.string(tk) }; break; }
        default: break;
      }
      p += need;
    }
    out.push({ il, op: prefix + name, operand });
  }
  return { instructions: out, complete, stoppedAt, bytes: p - start };
}

/** A one-line text form of an instruction, ildasm-style. */
function format(ins) {
  const o = ins.operand;
  let arg = '';
  if (o === null || o === undefined) arg = '';
  else if (typeof o === 'number') arg = String(o);
  else if (Array.isArray(o)) arg = `(${o.map((t) => 'IL_' + t.toString(16).padStart(4, '0')).join(', ')})`;
  else if (o.target !== undefined) arg = 'IL_' + o.target.toString(16).padStart(4, '0');
  else if (o.value !== undefined) arg = JSON.stringify(o.value.length > 80 ? o.value.slice(0, 80) + '…' : o.value);
  else if (o.name !== undefined) arg = o.name;
  else if (o.token !== undefined) arg = `0x${o.token.toString(16)}`;
  return `IL_${ins.il.toString(16).padStart(4, '0')}:  ${ins.op}${arg ? '  ' + arg : ''}`;
}

/**
 * Lift a decoded CIL method to readable pseudo-C#. CIL is a stack machine, so the lift
 * simulates the evaluation stack: each value pushed becomes an expression string, each pop
 * consumes one, and a side effect (a store, a void call, a branch, a return) becomes a
 * statement. Branch targets get a label and a `goto`; full if/while structuring is not done
 * here (that is a decompiler's job), so the output is straight-line pseudocode with labels.
 * `env.sig(token)` gives a call's { hasThis, paramCount, retVoid } so arguments pop
 * correctly; without it calls would desync the stack.
 */
function lift(instructions, env) {
  env = env || {}; const sig = env.sig || (() => ({ hasThis: false, paramCount: 0, retVoid: false }));
  const targets = new Set();
  for (const ins of instructions) { const o = ins.operand; if (o && o.target !== undefined) targets.add(o.target); if (Array.isArray(o)) for (const t of o) targets.add(t); }
  const out = []; let stack = []; let tmp = 0;
  const L = (il) => `IL_${il.toString(16).padStart(4, '0')}`;
  const push = (e) => stack.push(e);
  const pop = () => (stack.length ? stack.pop() : '?');
  const emit = (il, text) => out.push({ il, text });
  const BIN = { add: '+', sub: '-', mul: '*', div: '/', rem: '%', and: '&', or: '|', xor: '^', shl: '<<', shr: '>>', 'shr.un': '>>', 'div.un': '/', 'rem.un': '%' };
  const CMP = { ceq: '==', cgt: '>', clt: '<', 'cgt.un': '>', 'clt.un': '<', beq: '==', 'bne.un': '!=', bge: '>=', bgt: '>', ble: '<=', blt: '<', 'bge.un': '>=', 'bgt.un': '>', 'ble.un': '<=', 'blt.un': '<' };
  const member = (name) => (name && name.includes('::') ? name.split('::')[1] : name);
  const typeOf = (name) => (name && name.includes('::') ? name.split('::')[0] : name);
  const fieldName = (name) => String(name || '').replace(/^field\s+/, '');
  for (const ins of instructions) {
    const il = ins.il, op = ins.op, o = ins.operand;
    if (targets.has(il)) { // a branch lands here: materialise anything still on the stack
      if (stack.length) { const spilled = stack.map((e, i) => { const t = `t${tmp++}`; emit(il, `${t} = ${e};`); return t; }); stack = spilled; }
      emit(il, `${L(il)}:`);
    }
    if (op === 'nop' || op === 'volatile.' || op === 'readonly.' || op === 'constrained.' || op === 'unaligned.' || op === 'tail.' || op === 'no.') continue;
    if (/^ldarg/.test(op)) { push('arg' + (op.includes('.') && /\d/.test(op) ? op.split('.').pop() : (typeof o === 'number' ? o : 0))); continue; }
    if (/^ldloc/.test(op)) { push('loc' + (op.includes('.') && /\d/.test(op) ? op.split('.').pop() : (typeof o === 'number' ? o : 0))); continue; }
    if (/^stloc/.test(op)) { const n = op.includes('.') && /\d/.test(op) ? op.split('.').pop() : o; emit(il, `loc${n} = ${pop()};`); continue; }
    if (/^starg/.test(op)) { emit(il, `arg${o} = ${pop()};`); continue; }
    if (op === 'ldnull') { push('null'); continue; }
    if (op === 'ldstr') { push(JSON.stringify((o && o.value) || '')); continue; }
    if (/^ldc\./.test(op)) { push(op.endsWith('.m1') ? '-1' : (op.includes('.') && /\d$/.test(op) && typeof o !== 'number' ? op.split('.').pop() : String(o))); continue; }
    if (op === 'dup') { const e = pop(); push(e); push(e); continue; }
    if (op === 'pop') { emit(il, `${pop()};`); continue; }
    if (op === 'ldfld') { const obj = pop(); push(`${obj}.${fieldName(o && o.name)}`); continue; }
    if (op === 'ldsfld') { push(fieldName(o && o.name)); continue; }
    if (op === 'ldflda' || op === 'ldsflda') { push(`&${fieldName(o && o.name)}`); continue; }
    if (op === 'stfld') { const v = pop(), obj = pop(); emit(il, `${obj}.${fieldName(o && o.name)} = ${v};`); continue; }
    if (op === 'stsfld') { emit(il, `${fieldName(o && o.name)} = ${pop()};`); continue; }
    if (BIN[op]) { const b = pop(), a = pop(); push(`(${a} ${BIN[op]} ${b})`); continue; }
    if (op === 'neg') { push(`(-${pop()})`); continue; }
    if (op === 'not') { push(`(~${pop()})`); continue; }
    if (op === 'ceq' || op === 'cgt' || op === 'clt' || op === 'cgt.un' || op === 'clt.un') { const b = pop(), a = pop(); push(`(${a} ${CMP[op]} ${b})`); continue; }
    if (/^conv\./.test(op)) { push(`(${op.replace('conv.', '')})${pop()}`); continue; }
    if (op === 'ldlen') { push(`${pop()}.Length`); continue; }
    if (/^ldelem/.test(op)) { const i = pop(), a = pop(); push(`${a}[${i}]`); continue; }
    if (/^stelem/.test(op)) { const v = pop(), i = pop(), a = pop(); emit(il, `${a}[${i}] = ${v};`); continue; }
    if (op === 'newarr') { push(`new ${o && o.name}[${pop()}]`); continue; }
    if (op === 'isinst') { push(`(${pop()} as ${o && o.name})`); continue; }
    if (op === 'castclass') { push(`((${o && o.name})${pop()})`); continue; }
    if (op === 'box' || op === 'unbox' || op === 'unbox.any' || op === 'ldobj' || op === 'stobj') { continue; }
    if (op === 'ldtoken') { push(`typeof(${o && o.name})`); continue; }
    if (op === 'newobj') { const s = sig(o && o.token); const n = s.paramCount; const args = []; for (let k = 0; k < n; k += 1) args.unshift(pop()); push(`new ${typeOf(o && o.name)}(${args.join(', ')})`); continue; }
    if (op === 'call' || op === 'callvirt' || op === 'calli') { const s = sig(o && o.token); const n = s.paramCount + (s.hasThis ? 1 : 0); const args = []; for (let k = 0; k < n; k += 1) args.unshift(pop()); let expr; if (s.hasThis && args.length) expr = `${args[0]}.${member(o && o.name)}(${args.slice(1).join(', ')})`; else expr = `${(o && o.name) || 'call'}(${args.join(', ')})`; if (s.retVoid) emit(il, `${expr};`); else push(expr); continue; }
    if (op === 'ret') { emit(il, stack.length ? `return ${pop()};` : 'return;'); continue; }
    if (op === 'throw') { emit(il, `throw ${pop()};`); continue; }
    if (op === 'rethrow') { emit(il, 'throw;'); continue; }
    if (op === 'br' || op === 'br.s' || op === 'leave' || op === 'leave.s') { emit(il, `goto ${L(o.target)};`); continue; }
    if (op === 'brtrue' || op === 'brtrue.s') { emit(il, `if (${pop()}) goto ${L(o.target)};`); continue; }
    if (op === 'brfalse' || op === 'brfalse.s') { emit(il, `if (!(${pop()})) goto ${L(o.target)};`); continue; }
    if (/^(beq|bne|bge|bgt|ble|blt)/.test(op)) { const b = pop(), a = pop(); const cmp = CMP[op] || CMP[op.replace(/\.s$/, '')] || '?'; emit(il, `if (${a} ${cmp} ${b}) goto ${L(o.target)};`); continue; }
    if (op === 'switch') { const v = pop(); emit(il, `switch (${v}) -> ${(o || []).map(L).join(', ')};`); continue; }
    if (op === 'endfinally' || op === 'endfilter') { emit(il, '// end handler'); continue; }
    // anything not modelled: keep the mnemonic as a comment, do not corrupt the stack
    emit(il, `// ${format(ins)}`);
  }
  return out;
}

export { decode, format, lift, OP, FE };
