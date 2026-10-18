/**
 * ATLAS — stack-frame recovery, the first middle-end pass of our own decompiler. Our own,
 * over our own lifted pseudo-C. A compiler turns a function's local variables into memory at
 * a fixed offset from the stack or frame pointer (`*(rsp+0x30)`, `*(rbp-0x8)`); this pass
 * turns each distinct slot back into a named variable (`local_30`, `arg_10`), lists them as
 * the function's locals, and recognises the compiler's boilerplate — the stack-protector
 * cookie and the frame set-up and tear-down — so the reader sees intent, not prologue noise.
 * It is a text transform over the structured output, deliberately conservative: it renames
 * and annotates, it never deletes a statement, and a slot it cannot classify is left as is.
 */

/**
 * Rewrite stack/frame-relative memory references into named locals and annotate the
 * compiler boilerplate. Returns { body, locals: [names] }.
 */
function recoverFrame(body) {
  const slots = new Map(); // 'rsp+0x30' -> name
  const order = [];
  const nameFor = (base, sign, off) => {
    const key = `${base}${sign}${off}`;
    if (slots.has(key)) return slots.get(key);
    const hex = off.replace(/^0x/, '');
    // rbp+disp and rsp+big-disp are incoming stack arguments; the rest are locals
    const name = (base === 'rbp' && sign === '+') ? `arg_${hex}` : `local_${sign === '-' ? 'm' : ''}${hex}`;
    slots.set(key, name); order.push(name); return name;
  };
  // 1) name every simple stack/frame slot: *(rsp+0x30), *(rbp-0x8)
  body = body.replace(/\*\((rsp|rbp)([+-])(0x[0-9a-f]+)\)/g, (_, base, sign, off) => nameFor(base, sign, off));

  // 2) annotate the boilerplate, line by line, without removing anything
  const lines = body.split('\n').map((line) => {
    const t = line.trim();
    // stack-protector cookie: a slot set from a rip-relative constant xor'd with rsp
    if (/= \(\*\(rip[+-]0x[0-9a-f]+\) \^ \(?rsp/.test(t) || /= \(\*\(rip[+-]0x[0-9a-f]+\) \^ rsp\)/.test(t)) return line + '  // stack canary: set';
    // the matching check at the epilogue
    if (/\^ rsp\) != \*\(rip[+-]0x[0-9a-f]+\)/.test(t) || /\^ rsp\) == \*\(rip[+-]0x[0-9a-f]+\)/.test(t)) return line + '  // stack canary: check';
    // frame set-up / tear-down
    if (/^rsp = \(rsp - 0x[0-9a-f]+\);$/.test(t)) return line + '  // frame set-up';
    if (/^rsp = \(rsp \+ 0x[0-9a-f]+\);$/.test(t)) return line + '  // frame tear-down';
    return line;
  });

  return { body: lines.join('\n'), locals: order };
}

// sub-register -> canonical 64-bit name, so a spill written `rax = …` and read later as `eax`
// is counted as the same variable (and not wrongly deleted)
const CANON = {};
for (const [q, d, w, b] of [
  ['rax', 'eax', 'ax', 'al'], ['rcx', 'ecx', 'cx', 'cl'], ['rdx', 'edx', 'dx', 'dl'], ['rbx', 'ebx', 'bx', 'bl'],
  ['rsi', 'esi', 'si', 'sil'], ['rdi', 'edi', 'di', 'dil'], ['rbp', 'ebp', 'bp', 'bpl'], ['rsp', 'esp', 'sp', 'spl'],
]) { for (const r of [q, d, w, b]) CANON[r] = q; }
for (let i = 8; i <= 15; i += 1) { const q = 'r' + i; for (const r of [q, q + 'd', q + 'w', q + 'b']) CANON[r] = q; }
const canonId = (t) => CANON[t] || t;

/**
 * Dead-store elimination over the structured body. A simple assignment `X = EXPR;` whose
 * right-hand side has no call (so it has no side effect) and whose variable X is read nowhere
 * else in the function is removed — it is a spill that every reader inlined, or a value never
 * used. Register names are canonicalised so `rax = …` read later as `eax` is kept. Run to a
 * fixpoint, since removing one dead store can make another dead. Comments and the condition
 * lines count as reads, so anything still referenced is kept.
 */
function eliminateDeadStores(body) {
  let lines = body.split('\n');
  for (let pass = 0; pass < 6; pass += 1) {
    const count = {};
    for (const m of lines.join('\n').matchAll(/\b([a-z_][a-z0-9_]*)\b/g)) { const c = canonId(m[1]); count[c] = (count[c] || 0) + 1; }
    let removed = false;
    const keep = [];
    for (const line of lines) {
      const m = /^\s*([a-z_][a-z0-9_]*) = (.+);\s*$/.exec(line);
      if (m) {
        const lhs = canonId(m[1]); const rhs = m[2];
        const pure = !/[a-z_][a-z0-9_]*\s*\(/.test(rhs); // no function call on the rhs
        if (pure && count[lhs] === 1) { removed = true; continue; } // defined, read nowhere: dead
      }
      keep.push(line);
    }
    lines = keep;
    if (!removed) break;
  }
  return lines.join('\n');
}

export { recoverFrame, eliminateDeadStores };
