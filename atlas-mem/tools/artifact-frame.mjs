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

/**
 * Collect the observed layout of each pointer: the set of field offsets accessed off a base,
 * read straight from the `base->field_<off>` accesses the lift produced. This is the observed
 * layout, not a reconstructed struct with member types and names — honest about what it is.
 * Returns [{ base, fields: ['+0x0','+0x8',…] }] for every base with two or more distinct
 * fields (a single field is not a structure worth noting).
 */
function structLayouts(body) {
  const byBase = new Map();
  for (const m of body.matchAll(/([a-z_][a-z0-9_]*|\([^()]*\))->field_([0-9a-f]+|m[0-9a-f]+)\b/g)) {
    const base = m[1];
    const off = m[2].startsWith('m') ? -parseInt(m[2].slice(1), 16) : parseInt(m[2], 16);
    if (!byBase.has(base)) byBase.set(base, new Set());
    byBase.get(base).add(off);
  }
  const out = [];
  for (const [base, offs] of byBase) {
    if (offs.size < 2) continue;
    const fields = [...offs].sort((a, b) => a - b).map((o) => (o < 0 ? '-0x' + (-o).toString(16) : '+0x' + o.toString(16)));
    out.push({ base, fields });
  }
  return out;
}

import { REGINFO } from './artifact-lift-x86.mjs';

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const WTYPE = { 8: 'int8_t', 16: 'int16_t', 32: 'int32_t', 64: 'int64_t' };
const offSuffix = (disp) => (disp ? disp.replace('+0x', '').replace('-0x', 'm') : '0');

/**
 * Recover each field's access width from the raw instructions: a memory operand `[base+disp]`
 * paired with a register operand takes that register's width. Returns Map(`base|suffix` ->
 * bits), where suffix matches the `field_<suffix>` name the lift produced.
 */
function fieldWidths(cfg) {
  const w = new Map();
  for (const b of cfg.blocks) for (const ins of b.insns) {
    const sp = (ins.text || '').indexOf(' ');
    if (sp < 0) continue;
    const ops = ins.text.slice(sp + 1).split(', ');
    if (ops.length !== 2) continue;
    for (let i = 0; i < 2; i += 1) {
      const memTok = ops[i], regTok = ops[1 - i];
      const m = /^\[([a-z][a-z0-9]*)([+-]0x[0-9a-f]+)?\]$/.exec(memTok); // base (+disp), no index
      const ri = REGINFO[regTok];
      if (!m || !ri) continue;
      const key = `${m[1]}|${offSuffix(m[2])}`;
      if (!w.has(key) || ri.w > w.get(key)) w.set(key, ri.w); // widest access wins
    }
  }
  return w;
}

/**
 * A first sketch of real struct reconstruction: from the offsets observed off a pointer,
 * synthesise a C `struct` declaration, giving each field a type inferred from how it is used —
 * a pointer if the field's value is itself dereferenced or indexed, otherwise a 64-bit
 * integer. This is deliberately labelled approximate: the offsets are observed (gaps are left
 * as the offset comments), the widths are assumed pointer-sized, and the base register may
 * hold different objects at different points. It is the honest first step toward the real
 * frontier (points-to plus full type inference), not that frontier itself.
 *
 * Returns [{ base, name, members: [{ off, type, field }] }] for each base with 2+ fields.
 */
function synthStructs(body, widths) {
  const out = [];
  for (const { base, fields } of structLayouts(body)) {
    const B = escapeRe(base);
    const members = fields.map((f) => {
      const suffix = f.replace('+0x', '').replace('-0x', 'm');
      const field = 'field_' + suffix;
      // pointer if the loaded field is dereferenced, indexed, or used as a store target
      const deref = new RegExp(`${B}->${field}(->|\\[)`).test(body)
        || new RegExp(`\\*\\(?${B}->${field}\\b`).test(body)
        || new RegExp(`${escapeRe(`(${base}->${field})`)}\\[`).test(body);
      const bits = widths && widths.get(`${base}|${suffix}`);
      const type = deref ? 'void*' : (bits ? WTYPE[bits] : 'int64_t');
      return { off: f, type, field, bits: bits || null };
    });
    const name = base.replace(/[^a-z0-9]/gi, '') + '_t';
    out.push({ base, name, members });
  }
  return out;
}

/** Render the synthesised structs as C declarations, as comment-prefixed lines. */
function renderStructs(structs) {
  const lines = [];
  for (const s of structs) {
    lines.push(`// reconstructed struct for ${s.base} (approximate: offsets observed, widths/types inferred from use)`);
    lines.push(`struct ${s.name} {`);
    for (const m of s.members) lines.push(`  ${m.type} ${m.field};  // ${m.off}`);
    lines.push('};');
  }
  return lines;
}

export { recoverFrame, eliminateDeadStores, structLayouts, synthStructs, renderStructs, fieldWidths };
