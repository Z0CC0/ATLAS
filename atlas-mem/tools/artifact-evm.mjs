/**
 * ATLAS — EVM (Ethereum Virtual Machine) bytecode reader, disassembler and pseudocode lifter.
 * Our own, from the Ethereum Yellow Paper and the public opcode list, not from any tool. EVM
 * code is a flat byte string of a stack machine: most opcodes are one byte, PUSH1..PUSH32
 * carry 1..32 immediate bytes. We disassemble it with program-counter offsets and JUMPDEST
 * labels, lift the stack back into expressions (storage[k], mem[a], msg.sender, …) with
 * constant jump targets resolved, pull out the 4-byte function selectors from the dispatcher,
 * and read the trailing Solidity metadata (the CBOR blob solc appends). Nothing is executed.
 */

const OP = {
  0x00: 'STOP', 0x01: 'ADD', 0x02: 'MUL', 0x03: 'SUB', 0x04: 'DIV', 0x05: 'SDIV', 0x06: 'MOD', 0x07: 'SMOD', 0x08: 'ADDMOD', 0x09: 'MULMOD', 0x0a: 'EXP', 0x0b: 'SIGNEXTEND',
  0x10: 'LT', 0x11: 'GT', 0x12: 'SLT', 0x13: 'SGT', 0x14: 'EQ', 0x15: 'ISZERO', 0x16: 'AND', 0x17: 'OR', 0x18: 'XOR', 0x19: 'NOT', 0x1a: 'BYTE', 0x1b: 'SHL', 0x1c: 'SHR', 0x1d: 'SAR',
  0x20: 'KECCAK256',
  0x30: 'ADDRESS', 0x31: 'BALANCE', 0x32: 'ORIGIN', 0x33: 'CALLER', 0x34: 'CALLVALUE', 0x35: 'CALLDATALOAD', 0x36: 'CALLDATASIZE', 0x37: 'CALLDATACOPY', 0x38: 'CODESIZE', 0x39: 'CODECOPY', 0x3a: 'GASPRICE', 0x3b: 'EXTCODESIZE', 0x3c: 'EXTCODECOPY', 0x3d: 'RETURNDATASIZE', 0x3e: 'RETURNDATACOPY', 0x3f: 'EXTCODEHASH',
  0x40: 'BLOCKHASH', 0x41: 'COINBASE', 0x42: 'TIMESTAMP', 0x43: 'NUMBER', 0x44: 'PREVRANDAO', 0x45: 'GASLIMIT', 0x46: 'CHAINID', 0x47: 'SELFBALANCE', 0x48: 'BASEFEE', 0x49: 'BLOBHASH', 0x4a: 'BLOBBASEFEE',
  0x50: 'POP', 0x51: 'MLOAD', 0x52: 'MSTORE', 0x53: 'MSTORE8', 0x54: 'SLOAD', 0x55: 'SSTORE', 0x56: 'JUMP', 0x57: 'JUMPI', 0x58: 'PC', 0x59: 'MSIZE', 0x5a: 'GAS', 0x5b: 'JUMPDEST', 0x5c: 'TLOAD', 0x5d: 'TSTORE', 0x5e: 'MCOPY', 0x5f: 'PUSH0',
  0xf0: 'CREATE', 0xf1: 'CALL', 0xf2: 'CALLCODE', 0xf3: 'RETURN', 0xf4: 'DELEGATECALL', 0xf5: 'CREATE2', 0xfa: 'STATICCALL', 0xfd: 'REVERT', 0xfe: 'INVALID', 0xff: 'SELFDESTRUCT',
};
for (let i = 1; i <= 32; i += 1) OP[0x60 + i - 1] = 'PUSH' + i;
for (let i = 1; i <= 16; i += 1) OP[0x80 + i - 1] = 'DUP' + i;
for (let i = 1; i <= 16; i += 1) OP[0x90 + i - 1] = 'SWAP' + i;
for (let i = 0; i <= 4; i += 1) OP[0xa0 + i] = 'LOG' + i;

// how many items each opcode pops / pushes (for the stack lift)
const BIN = { ADD: '+', MUL: '*', SUB: '-', DIV: '/', SDIV: '/', MOD: '%', SMOD: '%', EXP: '**', LT: '<', GT: '>', SLT: '<', SGT: '>', EQ: '==', AND: '&', OR: '|', XOR: '^', SHL: '<<', SHR: '>>', SAR: '>>' };
const ENV0 = { ADDRESS: 'address(this)', ORIGIN: 'tx.origin', CALLER: 'msg.sender', CALLVALUE: 'msg.value', CALLDATASIZE: 'msg.data.length', GASPRICE: 'tx.gasprice', CODESIZE: 'codesize()', RETURNDATASIZE: 'returndatasize()', COINBASE: 'block.coinbase', TIMESTAMP: 'block.timestamp', NUMBER: 'block.number', GASLIMIT: 'block.gaslimit', CHAINID: 'block.chainid', SELFBALANCE: 'address(this).balance', BASEFEE: 'block.basefee', PC: 'pc', MSIZE: 'msize()', GAS: 'gasleft()', PREVRANDAO: 'block.prevrandao' };

/** Accept raw bytes or a hex string (with or without 0x), return a Buffer of code. */
function toCode(buf) {
  // a text file of hex?
  if (/^(0x)?[0-9a-fA-F\s]+$/.test(buf.toString('latin1').trim()) && buf.length && !buf.includes(0)) {
    const hex = buf.toString('latin1').trim().replace(/^0x/i, '').replace(/\s+/g, '');
    if (hex.length % 2 === 0) return Buffer.from(hex, 'hex');
  }
  return buf;
}

/** Decode the bytecode into a list of instructions. */
function decode(code) {
  const ins = [];
  for (let pc = 0; pc < code.length;) {
    const op = code[pc]; const name = OP[op];
    if (name === undefined) { ins.push({ pc, op, name: null, text: `.byte 0x${op.toString(16).padStart(2, '0')}` }); pc += 1; continue; }
    if (name.startsWith('PUSH') && name !== 'PUSH0') {
      const n = parseInt(name.slice(4), 10);
      const data = code.subarray(pc + 1, pc + 1 + n);
      const hex = '0x' + Buffer.from(data).toString('hex');
      ins.push({ pc, op, name, n, value: hex, text: `${name} ${hex}` });
      pc += 1 + n;
    } else { ins.push({ pc, op, name, text: name }); pc += 1; }
  }
  return ins;
}

/** Read the Solidity metadata CBOR blob appended at the end, if present. */
function readMetadata(code) {
  if (code.length < 4) return null;
  const len = code.readUInt16BE(code.length - 2);
  if (len <= 0 || len + 2 > code.length) return null;
  const blob = code.subarray(code.length - 2 - len, code.length - 2);
  const s = blob.toString('latin1');
  const out = { length: len };
  const ipfs = blob.indexOf(Buffer.from('ipfs', 'latin1'));
  if (ipfs >= 0) { const h = blob.subarray(ipfs + 6, ipfs + 6 + 34); out.ipfs = 'ipfs:' + h.toString('hex'); }
  const bzzr = s.match(/bzzr[01]/); if (bzzr) out.swarm = bzzr[0];
  const solc = blob.indexOf(Buffer.from('solc', 'latin1'));
  if (solc >= 0) { const v = blob.subarray(solc + 5, solc + 8); if (v.length === 3) out.solc = `${v[0]}.${v[1]}.${v[2]}`; }
  return out;
}

/** Pull 4-byte function selectors out of the dispatcher (PUSH4 <sel> ... EQ/JUMPI pattern). */
function selectors(ins) {
  const out = [];
  for (let i = 0; i < ins.length; i += 1) {
    if (ins[i].name === 'PUSH4' && /^0x[0-9a-f]{8}$/.test(ins[i].value)) {
      // look ahead a few ops for an EQ and a JUMPI (the dispatch test)
      let eq = false, dest = null;
      for (let j = i + 1; j < Math.min(ins.length, i + 8); j += 1) {
        if (ins[j].name === 'EQ' || ins[j].name === 'SUB' || ins[j].name === 'ISZERO') eq = true;
        if (ins[j].name && ins[j].name.startsWith('PUSH') && ins[j].value) dest = ins[j].value;
        if (ins[j].name === 'JUMPI') { if (eq) out.push({ selector: ins[i].value, dest }); break; }
      }
    }
  }
  // de-duplicate on selector
  const seen = new Set(); return out.filter((s) => (seen.has(s.selector) ? false : seen.add(s.selector)));
}

/** Lift to pseudo-Solidity-ish code, JUMPDEST-labelled, constant jumps resolved. */
function lift(ins) {
  const out = [];
  const stack = [];
  const pop = () => (stack.length ? stack.pop() : '?');
  const L = (pc) => 'L_' + pc.toString(16);
  for (const i of ins) {
    const n = i.name;
    if (!n) { out.push(`  ${i.text}`); continue; }
    if (n === 'JUMPDEST') { out.push(`${L(i.pc)}:`); continue; }
    if (n === 'PUSH0') { stack.push('0'); continue; }
    if (n.startsWith('PUSH')) { stack.push(i.value); continue; }
    if (n.startsWith('DUP')) { const k = parseInt(n.slice(3), 10); stack.push(stack[stack.length - k] ?? '?'); continue; }
    if (n.startsWith('SWAP')) { const k = parseInt(n.slice(4), 10); const a = stack.length - 1, b = stack.length - 1 - k; if (a >= 0 && b >= 0) { const t = stack[a]; stack[a] = stack[b]; stack[b] = t; } continue; }
    if (BIN[n]) { const a = pop(), b = pop(); const flip = (n === 'SHL' || n === 'SHR' || n === 'SAR'); stack.push(flip ? `(${b} ${BIN[n]} ${a})` : `(${a} ${BIN[n]} ${b})`); continue; }
    if (n === 'ISZERO') { stack.push(`(${pop()} == 0)`); continue; }
    if (n === 'NOT') { stack.push(`(~${pop()})`); continue; }
    if (ENV0[n]) { stack.push(ENV0[n]); continue; }
    if (n === 'CALLDATALOAD') { stack.push(`calldata[${pop()}]`); continue; }
    if (n === 'SLOAD') { stack.push(`storage[${pop()}]`); continue; }
    if (n === 'MLOAD') { stack.push(`mem[${pop()}]`); continue; }
    if (n === 'KECCAK256') { const a = pop(), b = pop(); stack.push(`keccak256(mem[${a}..${a}+${b}])`); continue; }
    if (n === 'BALANCE') { stack.push(`${pop()}.balance`); continue; }
    if (n === 'SSTORE') { const k = pop(), v = pop(); out.push(`  storage[${k}] = ${v};`); continue; }
    if (n === 'MSTORE' || n === 'MSTORE8') { const a = pop(), v = pop(); out.push(`  mem[${a}] = ${v};`); continue; }
    if (n === 'POP') { pop(); continue; }
    if (n === 'JUMP') { const d = pop(); out.push(`  goto ${/^0x/.test(d) ? L(parseInt(d, 16)) : d};`); continue; }
    if (n === 'JUMPI') { const d = pop(), c = pop(); out.push(`  if (${c}) goto ${/^0x/.test(d) ? L(parseInt(d, 16)) : d};`); continue; }
    if (n === 'RETURN') { const a = pop(), b = pop(); out.push(`  return mem[${a}..${a}+${b}];`); continue; }
    if (n === 'REVERT') { const a = pop(), b = pop(); out.push(`  revert(mem[${a}..${a}+${b}]);`); continue; }
    if (n === 'STOP') { out.push('  stop;'); continue; }
    if (n === 'SELFDESTRUCT') { out.push(`  selfdestruct(${pop()});`); continue; }
    if (n === 'CALL' || n === 'DELEGATECALL' || n === 'STATICCALL' || n === 'CALLCODE') { const argc = n === 'DELEGATECALL' || n === 'STATICCALL' ? 6 : 7; const a = []; for (let k = 0; k < argc; k += 1) a.push(pop()); stack.push(`${n.toLowerCase()}(${a.join(', ')})`); continue; }
    if (n.startsWith('LOG')) { const k = parseInt(n.slice(3), 10); for (let q = 0; q < 2 + k; q += 1) pop(); out.push(`  emit log${k}(...);`); continue; }
    if (n === 'CALLDATASIZE' || n === 'RETURNDATASIZE') { stack.push(ENV0[n] || n.toLowerCase()); continue; }
    // default: a one-result builtin
    stack.push(`${n.toLowerCase()}(...)`);
  }
  return out.join('\n');
}

function readEvm(buf) {
  const code = toCode(buf);
  const ins = decode(code);
  const meta = readMetadata(code);
  const sels = selectors(ins);
  const bad = ins.filter((i) => !i.name).length;
  const jumpdests = ins.filter((i) => i.name === 'JUMPDEST').length;
  return { format: 'evm', bytes: code.length, instructions: ins, bad, jumpdests, metadata: meta, selectors: sels };
}

export { readEvm, decode, lift, selectors, readMetadata, OP };
