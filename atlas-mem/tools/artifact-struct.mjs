/**
 * ATLAS — control-flow structuring: turn a CFG of basic blocks (goto skeleton) into
 * structured pseudo-C with if / if-else / while / do-while, falling back to a labelled
 * goto only where the flow is irreducible or does not fit a region. Our own, over our own
 * CFG. The method is the textbook one: dominators and post-dominators (Cooper-Harvey-
 * Kennedy iterative data flow), natural loops from back-edges, and the immediate post-
 * dominator of a two-way block as the merge point of an if. Nothing is executed.
 *
 * The caller supplies `lift(block)` returning { stmts: string[], cond: {text} | null } for
 * one block, so this file is architecture-independent (x86-64, arm64, any). The condition is
 * the test under which the block's `cond` successor (not the fall-through) is taken.
 */

/** Reverse postorder of nodes reachable from `entry` over `succ`. */
function rpo(entry, succ) {
  const seen = new Set(), post = [];
  const dfs = (n) => {
    if (seen.has(n)) return; seen.add(n);
    for (const s of (succ.get(n) || [])) dfs(s);
    post.push(n);
  };
  dfs(entry);
  return post.reverse();
}

/** Immediate-dominator map by the Cooper-Harvey-Kennedy algorithm. idom[entry] = entry. */
function domTree(entry, succ, pred, order) {
  const idom = new Map(); idom.set(entry, entry);
  const pos = new Map(order.map((n, i) => [n, i])); // index in RPO
  const intersect = (a, b) => {
    while (a !== b) {
      while (pos.get(a) > pos.get(b)) a = idom.get(a);
      while (pos.get(b) > pos.get(a)) b = idom.get(b);
    }
    return a;
  };
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of order) {
      if (n === entry) continue;
      let newIdom = null;
      for (const p of (pred.get(n) || [])) {
        if (!idom.has(p)) continue;
        newIdom = newIdom === null ? p : intersect(p, newIdom);
      }
      if (newIdom !== null && idom.get(n) !== newIdom) { idom.set(n, newIdom); changed = true; }
    }
  }
  return idom;
}

/** Does `a` dominate `b` (walk b's idom chain to the entry)? */
function dominates(idom, a, b) {
  let x = b;
  for (;;) { if (x === a) return true; const nx = idom.get(x); if (nx === undefined || nx === x) return false; x = nx; }
}

/**
 * Structure a CFG to pseudo-C. `cfg` is { start, blocks:[{start,insns,succ:[{to,cond,fall,loop}]}] }.
 * `base` offsets addresses in labels. `lift(block)` lifts one block's body + condition.
 */
function structurize(cfg, base, lift) {
  base = base || 0;
  const L = (a) => 'L_' + (base + a).toString(16);
  const blocks = cfg.blocks;
  const byId = new Map(blocks.map((b) => [b.start, b]));
  const entry = cfg.start;

  // edge maps keyed by block start
  const succ = new Map(), pred = new Map();
  for (const b of blocks) { succ.set(b.start, []); pred.set(b.start, []); }
  for (const b of blocks) for (const s of b.succ) if (byId.has(s.to)) succ.get(b.start).push(s.to);
  for (const b of blocks) for (const t of succ.get(b.start)) pred.get(t).push(b.start);

  const order = rpo(entry, succ);
  const reach = new Set(order);
  const idom = domTree(entry, succ, pred, order);

  // post-dominators: dominators on the reverse graph from a virtual exit
  const EXIT = '__exit__';
  const rsucc = new Map(), rpred = new Map();
  for (const b of blocks) { rsucc.set(b.start, []); rpred.set(b.start, []); }
  rsucc.set(EXIT, []); rpred.set(EXIT, []);
  for (const b of blocks) {
    const outs = succ.get(b.start);
    if (!outs.length) { rsucc.get(EXIT).push(b.start); rpred.get(b.start).push(EXIT); }
    for (const t of outs) { rsucc.get(t).push(b.start); rpred.get(b.start).push(t); }
  }
  const rorder = rpo(EXIT, rsucc);
  const ipdom = domTree(EXIT, rsucc, rpred, rorder); // immediate post-dominator map

  // natural-loop back-edges: edge (u -> h) with h dominating u. Record each header's latches.
  const headerLatches = new Map(); // header -> [latch...]
  for (const b of blocks) for (const t of succ.get(b.start)) {
    if (reach.has(t) && dominates(idom, t, b.start)) {
      if (!headerLatches.has(t)) headerLatches.set(t, []);
      headerLatches.get(t).push(b.start);
    }
  }
  const loopHeaders = new Set(headerLatches.keys());

  // loop body = nodes that reach a latch without passing through the header (plus header)
  const loopBody = new Map(), loopExit = new Map();
  for (const [h, latches] of headerLatches) {
    const body = new Set([h]);
    const stack = [...latches];
    while (stack.length) { const n = stack.pop(); if (body.has(n)) continue; body.add(n); for (const p of pred.get(n) || []) if (p !== h && reach.has(p)) stack.push(p); }
    loopBody.set(h, body);
    // exit = a successor of a body node that is outside the body
    let exit = null;
    for (const n of body) for (const t of succ.get(n)) if (!body.has(t)) { exit = t; break; }
    loopExit.set(h, exit);
  }

  const out = [`// function at 0x${(base + entry).toString(16)} — ${blocks.length} blocks, ${loopHeaders.size} loop(s); structured pseudo-C`];
  const emitted = new Set();
  const gotos = new Set(); // labels actually jumped to, so only those get printed

  // indent helper
  const push = (depth, s) => out.push('  '.repeat(depth) + s);

  /**
   * Emit the region starting at `n`, stopping before `stop` (a follow/merge node or a loop
   * exit already handled by an enclosing context). `ctx` carries the enclosing loop for
   * break/continue. Returns nothing; appends to `out`.
   */
  function emit(n, stop, depth, ctx) {
    for (;;) {
      if (n === undefined || n === null || n === stop) return;
      if (!reach.has(n)) { push(depth, `goto ${L(n)}; // unreachable in this region`); gotos.add(n); return; }
      if (emitted.has(n)) { push(depth, `goto ${L(n)};`); gotos.add(n); return; }

      // break / continue to the enclosing loop
      if (ctx) {
        if (n === ctx.header && ctx.started) { push(depth, 'continue;'); return; }
        if (n === ctx.exit) { push(depth, 'break;'); return; }
      }

      if (loopHeaders.has(n) && !(ctx && ctx.header === n && ctx.started)) { emitLoop(n, depth, ctx); const ex = loopExit.get(n); n = ex; continue; }

      emitted.add(n);
      const b = byId.get(n);
      const { stmts, cond } = lift(b);
      const lbl = L(n);
      // label line printed only if something gotos here (decided at the end); mark position
      out.push({ id: n, depth }); // label placeholder, resolved later
      for (const s of stmts) push(depth, s);

      const outs = b.succ.filter((s) => byId.has(s.to));
      const condE = outs.find((s) => s.cond), fallE = outs.find((s) => s.fall), jmpE = outs.find((s) => !s.cond && !s.fall);

      if (cond && condE && fallE) {
        // two-way: if (cond) { cond-target } else { fall-target }, merge at immediate post-dominator
        const merge = ipdom.get(n);
        const m = (merge === EXIT) ? stop : merge;
        const thenN = condE.to, elseN = fallE.to;
        // prefer the arm that is not the merge as the body; keep else only if it has content
        push(depth, `if (${cond.text}) {`);
        emit(thenN, m, depth + 1, ctx);
        if (elseN !== m && elseN !== stop) { push(depth, '} else {'); emit(elseN, m, depth + 1, ctx); }
        push(depth, '}');
        n = m; continue;
      }
      if (jmpE) { n = jmpE.to; continue; }       // unconditional
      if (fallE && !condE) { n = fallE.to; continue; }
      if (condE && !fallE) { n = condE.to; continue; }
      push(depth, 'return;');
      return;
    }
  }

  function emitLoop(h, depth, outerCtx) {
    const body = loopBody.get(h), exit = loopExit.get(h);
    const hb = byId.get(h);
    const { stmts, cond } = lift(hb);
    const outs = hb.succ.filter((s) => byId.has(s.to));
    const condE = outs.find((s) => s.cond), fallE = outs.find((s) => s.fall);
    const ctx = { header: h, exit, started: true };
    // pre-tested loop: header tests and one edge leaves the body
    const headerExits = cond && condE && fallE && (!body.has(condE.to) || !body.has(fallE.to));
    if (headerExits && !stmts.length) {
      // while (stay-in-body-condition) { ... }
      const stayCond = body.has(condE.to) ? cond.text : `!(${cond.text})`;
      const next = body.has(condE.to) ? condE.to : fallE.to;
      push(depth, `while (${stayCond}) {`);
      emit(next, h, depth + 1, ctx);
      push(depth, '}');
      return;
    }
    // general / post-tested: for(;;) with explicit break/continue
    push(depth, 'for (;;) {');
    emitted.add(h);
    out.push({ id: h, depth: depth + 1 });
    for (const s of stmts) push(depth + 1, s);
    if (cond && condE && fallE) {
      const inThen = body.has(condE.to), inFall = body.has(fallE.to);
      if (inThen && !inFall) { push(depth + 1, `if (!(${cond.text})) break;`); emit(condE.to, h, depth + 1, ctx); }
      else if (inFall && !inThen) { push(depth + 1, `if (${cond.text}) break;`); emit(fallE.to, h, depth + 1, ctx); }
      else { push(depth + 1, `if (${cond.text}) {`); emit(condE.to, h, depth + 2, ctx); push(depth + 1, '} else {'); emit(fallE.to, h, depth + 2, ctx); push(depth + 1, '}'); }
    } else {
      const jmpE = outs.find((s) => !s.cond && !s.fall) || fallE;
      if (jmpE) emit(jmpE.to, h, depth + 1, ctx);
    }
    push(depth, '}');
  }

  emit(entry, null, 1, null);

  // any block never emitted (irreducible / unreached by the structured walk): dump as goto targets
  for (const b of blocks) if (!emitted.has(b.start) && reach.has(b.start)) {
    emitted.add(b.start);
    out.push({ id: b.start, depth: 1 });
    const { stmts } = lift(b);
    for (const s of stmts) push(1, s);
    const outs = b.succ.filter((s) => byId.has(s.to));
    if (outs.length) { push(1, `goto ${L(outs[0].to)};`); gotos.add(outs[0].to); } else push(1, 'return;');
  }

  // resolve placeholders: print a label line only if it is a goto target
  const lines = [];
  for (const item of out) {
    if (typeof item === 'string') { lines.push(item); continue; }
    if (gotos.has(item.id)) lines.push('  '.repeat(Math.max(0, item.depth - 1)) + L(item.id) + ':');
  }
  const head = lines.shift(); // the header comment, hoisted above the function
  // cleanup pass: collapse an empty else, and an if whose both arms are empty
  for (let pass = 0; pass < 3; pass += 1) {
    for (let i = 0; i < lines.length - 1; i += 1) {
      const a = lines[i].trim(), b = lines[i + 1].trim();
      if (a === '} else {' && b === '}') { lines.splice(i, 2, lines[i].replace('} else {', '}')); }
      else if (/^if \(.*\) \{$/.test(a) && b === '}') { lines.splice(i, 2); } // empty then, no else
    }
  }
  return head + '\nvoid func() {\n' + lines.join('\n') + '\n}';
}

/**
 * Structure the linear, label-and-goto output of a bytecode lift (CIL, Dalvik, EVM) into
 * if/else/while, reusing the same dominator-based structurizer. The input is a list of
 * { off, text } where text is a plain statement, a label `X:`, `goto X;`, `if (c) goto X;`,
 * a `return`/`throw`, or a `switch …`. Branch targets are numeric offsets encoded in the
 * label name (e.g. IL_0012 -> 0x12). Returns the structured body lines (no `void func()`
 * wrapper); where the flow is irreducible a labelled goto remains.
 */
function structureLinear(entries) {
  const offOf = (label) => parseInt(String(label).replace(/^[A-Za-z]+_/, ''), 16);
  const isLabel = (t) => /^[A-Za-z]\w*:$/.test(t);
  const blocks = []; let cur = null;
  const open = (start) => { cur = { start, stmts: [], term: null, succ: [] }; blocks.push(cur); };
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i]; const t = e.text;
    if (isLabel(t)) { const start = offOf(t.slice(0, -1)); if (cur && !cur.term) cur.fallTo = start; open(start); continue; }
    if (!cur) open(e.off != null ? e.off : 0);
    let m;
    if (/^(return\b|throw\b)/.test(t)) { cur.stmts.push(t); cur.term = { kind: 'ret' }; }
    else if ((m = /^goto (\w+);$/.exec(t))) cur.term = { kind: 'goto', target: offOf(m[1]), label: m[1] };
    else if ((m = /^if \((.*)\) goto (\w+);$/.exec(t))) cur.term = { kind: 'if', cond: m[1], target: offOf(m[2]), label: m[2] };
    else if (/^switch/.test(t)) { cur.stmts.push(t); cur.term = { kind: 'ret' }; } // switch left inline, no structured edges
    else { cur.stmts.push(t); continue; }
    // a terminator closed the block; the next entry (if not a label) starts a fresh block
    const next = entries[i + 1];
    if (next && !isLabel(next.text)) open(next.off != null ? next.off : cur.start + 1);
    else cur = cur && cur.term ? null : cur;
  }
  const ids = new Set(blocks.map((b) => b.start));
  // wire edges
  for (let i = 0; i < blocks.length; i += 1) {
    const b = blocks[i]; const term = b.term;
    const fallNext = () => { const f = b.fallTo != null ? b.fallTo : (blocks[i + 1] && blocks[i + 1].start); if (f != null && ids.has(f)) b.succ.push({ to: f, fall: true }); };
    if (term && term.kind === 'ret') { /* no successors */ }
    else if (term && term.kind === 'goto') { if (ids.has(term.target)) b.succ.push({ to: term.target }); else b.stmts.push(`goto ${term.label};`); } // unresolved target: keep the goto
    else if (term && term.kind === 'if') {
      if (ids.has(term.target)) { b.succ.push({ to: term.target, cond: true }); b.cond = { text: term.cond }; fallNext(); }
      else { b.stmts.push(`if (${term.cond}) goto ${term.label};`); fallNext(); } // unresolved target: keep the conditional goto, fall through
    } else fallNext();
  }
  const cfg = { start: blocks.length ? blocks[0].start : 0, blocks };
  const text = structurize(cfg, 0, (b) => ({ stmts: b.stmts, cond: b.cond || null }));
  // strip the `void func() { … }` wrapper and the leading comment the structurizer adds
  const lines = text.split('\n');
  let body = lines.slice(2, -1).map((l) => l.replace(/^ {2}/, '')); // drop wrapper, dedent one level
  // the structurizer appends a bare `return;` to a no-successor block; drop it when the block
  // already ends with a real `return …;`/`throw …;`, and drop a dead goto after such a return
  const out = [];
  for (let i = 0; i < body.length; i += 1) {
    const t = body[i].trim();
    if (t === 'return;' && out.length && /^(return\b|throw\b)/.test(out[out.length - 1].trim())) continue;
    if (/^goto \w+;$/.test(t) && out.length && /^(return\b|throw\b)/.test(out[out.length - 1].trim())) continue;
    out.push(body[i]);
  }
  // drop any label line no surviving goto still targets
  const referenced = new Set();
  for (const l of out) { const m = /\bgoto (\w+);/.exec(l); if (m) referenced.add(m[1]); }
  return out.filter((l) => { const m = /^(\w+):$/.exec(l.trim()); return !m || referenced.has(m[1]); });
}

export { structurize, structureLinear, domTree, dominates, rpo };
