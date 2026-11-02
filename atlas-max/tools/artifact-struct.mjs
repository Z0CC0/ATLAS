/**
 * ATLAS — control-flow structuring: turn a CFG of basic blocks (goto skeleton) into
 * structured pseudo-C with if / if-else / while / do-while / switch, falling back to a
 * labelled goto only where the flow is irreducible or does not fit a region. Our own, over
 * our own CFG. The method is the textbook one: dominators and post-dominators (Cooper-Harvey-
 * Kennedy iterative data flow), natural loops from back-edges, and the immediate post-
 * dominator of a two-way block as the merge point of an if. Nothing is executed.
 *
 * The caller supplies `lift(block)` returning { stmts: string[], cond: {text} | null } for
 * one block, so this file is architecture-independent (x86-64, arm64, any). The condition is
 * the test under which the block's `cond` successor (not the fall-through) is taken. A block
 * may carry `switch: { expr, cases:[{key,target}], default }` with `case` successor edges.
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

/** Split a condition text on an operator at parenthesis depth zero, outside quotes. */
function splitTop(t, op) {
  const parts = []; let depth = 0, last = 0, q = null;
  for (let i = 0; i < t.length; i += 1) {
    const ch = t[i];
    if (q) { if (ch === '\\') i += 1; else if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") q = ch;
    else if (ch === '(' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']') depth -= 1;
    else if (depth === 0 && t.startsWith(op, i)) { parts.push(t.slice(last, i)); last = i + op.length; i += op.length - 1; }
  }
  parts.push(t.slice(last));
  return parts;
}

/** Negate a condition text: strip an outer `!( … )`, De Morgan over a top-level && / ||, else wrap. */
function negate(t) {
  if (/^!\(.*\)$/.test(t)) {
    const inner = t.slice(2, -1); let depth = 0, ok = true;
    for (const ch of inner) { if (ch === '(') depth += 1; else if (ch === ')') { depth -= 1; if (depth < 0) { ok = false; break; } } }
    if (ok && depth === 0) return inner;
  }
  const ors = splitTop(t, ' || ');
  if (ors.length > 1) return ors.map((x) => negate(x.trim())).join(' && ');
  const ands = splitTop(t, ' && ');
  if (ands.length > 1) return ands.map((x) => negate(x.trim())).join(' || ');
  return `!(${t})`;
}

/**
 * Structure a CFG to pseudo-C. `cfg` is { start, blocks:[{start,insns,succ:[{to,cond,fall,loop}]}] }.
 * `base` offsets addresses in labels. `lift(block)` lifts one block's body + condition.
 */
function structurize(cfg, base, lift0) {
  base = base || 0;
  const L = (a) => 'L_' + (base + a).toString(16);
  const blocks = cfg.blocks.map((b) => ({ ...b, succ: [...b.succ] })); // own copies: folding rewires edges
  const byId = new Map(blocks.map((b) => [b.start, b]));
  const entry = cfg.start;

  // short-circuit folding: a two-way block whose one arm is an empty two-way block with no
  // other predecessor is one compound condition (`a && b`, `a || !b`); chains fold in turn
  const condText = new Map(); // block start -> folded condition text
  const lift = (b) => { const r = lift0(b); return condText.has(b.start) ? { stmts: r.stmts, cond: { text: condText.get(b.start) } } : r; };
  const removed = new Set();
  {
    const twoWay = (b) => { const outs = b.succ.filter((s) => byId.has(s.to)); const c = outs.find((s) => s.cond), f = outs.find((s) => s.fall); const t = lift(b).cond; return c && f && t ? { c: c.to, f: f.to, text: t.text } : null; };
    const grp = (t, op) => (t.includes(op === '&&' ? ' || ' : ' && ') ? `(${t})` : t);
    const predCount = new Map();
    for (const b of blocks) for (const s of b.succ) if (byId.has(s.to)) predCount.set(s.to, (predCount.get(s.to) || 0) + 1);
    let changed = true;
    while (changed) {
      changed = false;
      for (const b of blocks) {
        if (removed.has(b.start)) continue;
        const w = twoWay(b); if (!w) continue;
        for (const viaCond of [false, true]) {
          const n2 = viaCond ? w.c : w.f, o = viaCond ? w.f : w.c;
          if (n2 === entry || n2 === b.start || n2 === o || removed.has(n2) || predCount.get(n2) !== 1) continue;
          const b2 = byId.get(n2); if (b2.switch || lift(b2).stmts.length) continue;
          const w2 = twoWay(b2); if (!w2) continue;
          let text = null, c = null, f = null;
          if (!viaCond) { // A false, then test B: `A || B` reaches the shared target
            if (w2.c === o) { text = `${grp(w.text, '||')} || ${grp(w2.text, '||')}`; c = o; f = w2.f; }
            else if (w2.f === o) { text = `${grp(w.text, '||')} || ${grp(negate(w2.text), '||')}`; c = o; f = w2.c; }
          } else { // A true, then test B: `A && B` reaches the far target, else the shared one
            if (w2.f === o) { text = `${grp(w.text, '&&')} && ${grp(w2.text, '&&')}`; c = w2.c; f = o; }
            else if (w2.c === o) { text = `${grp(w.text, '&&')} && ${grp(negate(w2.text), '&&')}`; c = w2.f; f = o; }
          }
          if (text === null) continue;
          condText.set(b.start, text);
          b.succ = [{ to: c, cond: true }, { to: f, fall: true }];
          removed.add(n2); predCount.set(n2, 0); predCount.set(o, predCount.get(o) - 1);
          changed = true; break;
        }
      }
    }
    for (const n of removed) byId.delete(n);
  }

  // edge maps keyed by block start
  const live = blocks.filter((b) => !removed.has(b.start));
  const succ = new Map(), pred = new Map();
  for (const b of live) { succ.set(b.start, []); pred.set(b.start, []); }
  for (const b of live) for (const s of b.succ) if (byId.has(s.to)) succ.get(b.start).push(s.to);
  for (const b of live) for (const t of succ.get(b.start)) pred.get(t).push(b.start);

  // a region not reachable from the entry (an exception handler, dead code) is structured too:
  // a virtual super-entry points at the entry and at the first block of each such region, so
  // dominators and loops are defined there as well; those regions are printed after the body
  const SUPER = '__entry__';
  const roots = [];
  { const seen = new Set(rpo(entry, succ)); for (const b of live) if (!seen.has(b.start)) { roots.push(b.start); for (const n of rpo(b.start, succ)) seen.add(n); } }
  succ.set(SUPER, [entry, ...roots]); pred.set(SUPER, []);
  pred.get(entry).push(SUPER); for (const r of roots) pred.get(r).push(SUPER);
  const order = rpo(SUPER, succ);
  const reach = new Set(order);
  const idom = domTree(SUPER, succ, pred, order);

  // post-dominators: dominators on the reverse graph from a virtual exit
  const EXIT = '__exit__';
  const rsucc = new Map(), rpred = new Map();
  for (const b of live) { rsucc.set(b.start, []); rpred.set(b.start, []); }
  rsucc.set(EXIT, []); rpred.set(EXIT, []);
  for (const b of live) {
    const outs = succ.get(b.start);
    if (!outs.length) { rsucc.get(EXIT).push(b.start); rpred.get(b.start).push(EXIT); }
    for (const t of outs) { rsucc.get(t).push(b.start); rpred.get(b.start).push(t); }
  }
  const rorder = rpo(EXIT, rsucc);
  const ipdom = domTree(EXIT, rsucc, rpred, rorder); // immediate post-dominator map

  // natural-loop back-edges: edge (u -> h) with h dominating u. Record each header's latches.
  const headerLatches = new Map(); // header -> [latch...]
  for (const b of live) for (const t of succ.get(b.start)) {
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
    while (stack.length) { const n = stack.pop(); if (body.has(n)) continue; body.add(n); for (const p of pred.get(n) || []) if (p !== h && p !== SUPER && reach.has(p)) stack.push(p); }
    loopBody.set(h, body);
    // the follow of the loop = the first successor outside the body, taken from the header
    // (pre-tested loop), else from a latch (post-tested), else from any body node; a loop with
    // several exits keeps the others inline where they leave (a return, a goto)
    const leaves = (n) => { for (const t of succ.get(n)) if (!body.has(t)) return t; return null; };
    let exit = leaves(h);
    if (exit === null) for (const l of latches) { exit = leaves(l); if (exit !== null) break; }
    if (exit === null) for (const n of body) { exit = leaves(n); if (exit !== null) break; }
    loopExit.set(h, exit);
  }

  const out = [`// function at 0x${(base + entry).toString(16)} — ${live.length} blocks, ${loopHeaders.size} loop(s); structured pseudo-C`];
  const emitted = new Set();
  const gotos = new Set(); // labels actually jumped to, so only those get printed

  // indent helper
  const push = (depth, s) => out.push('  '.repeat(depth) + s);

  /**
   * Where the arms of a branch meet again: the immediate post-dominator when there is one
   * inside the function; else (an arm returns, so nothing post-dominates) the earliest node
   * in RPO that at least `minArms` arms reach without crossing the region's stop or the
   * enclosing loop's header/exit — the shared tail two paths fall into. Else `stop`.
   */
  const pos = new Map(order.map((n, i) => [n, i]));
  function reaches(from, stop, ctx) {
    const seen = new Set(); const st = [from];
    while (st.length) {
      const x = st.pop();
      if (x === undefined || x === null || seen.has(x)) continue;
      seen.add(x);
      if (x === stop || (ctx && (x === ctx.header || x === ctx.exit))) continue;
      for (const t of (succ.get(x) || [])) st.push(t);
    }
    return seen;
  }
  function follow(n, arms, stop, ctx, minArms) {
    const merge = ipdom.get(n);
    const sets = arms.map((a) => reaches(a, stop, ctx));
    // the post-dominator counts only when every arm gets there without going round the loop
    if (merge !== undefined && merge !== EXIT && (merge === stop || sets.every((s) => s.has(merge)))) return merge;
    const count = new Map();
    for (const s of sets) for (const x of s) count.set(x, (count.get(x) || 0) + 1);
    // most arms first; then a node the flow continues from beats a terminal one (a shared
    // throw is better repeated than made the merge); then the earliest in RPO
    const score = (x, c) => [c, succ.get(x).length ? 1 : 0, -pos.get(x)];
    let best = null, bestS = null;
    for (const [x, c] of count) {
      if (x === stop || (ctx && (x === ctx.header || x === ctx.exit)) || c < minArms) continue;
      const sc = score(x, c);
      if (bestS === null || sc[0] > bestS[0] || (sc[0] === bestS[0] && (sc[1] > bestS[1] || (sc[1] === bestS[1] && sc[2] > bestS[2])))) { best = x; bestS = sc; }
    }
    return best === null ? stop : best;
  }

  /** A block's case arms, `default:` from its explicit default or its fall-through edge. */
  function emitSwitch(n, b, stop, depth, ctx) {
    const fallE = b.succ.find((s) => s.fall && byId.has(s.to));
    const m = follow(n, b.succ.filter((s) => byId.has(s.to)).map((s) => s.to), stop, ctx, 2);
    const sctx = ctx ? { ...ctx, inSwitch: true } : null; // a loop break inside a switch must not read as a switch break
    push(depth, `switch (${b.switch.expr}) {`);
    const groups = new Map(); // target -> keys, so `case 1: case 2:` share one arm
    for (const c of b.switch.cases) { if (!byId.has(c.target)) continue; if (!groups.has(c.target)) groups.set(c.target, []); groups.get(c.target).push(c.key); }
    for (const [t, keys] of groups) { for (const k of keys) push(depth + 1, `case ${k}:`); if (t !== m) emit(t, m, depth + 2, sctx); push(depth + 2, 'break;'); }
    const def = b.switch.default != null ? b.switch.default : (fallE ? fallE.to : null);
    if (def != null && def !== m && byId.has(def)) { push(depth + 1, 'default:'); emit(def, m, depth + 2, sctx); push(depth + 2, 'break;'); }
    push(depth, '}');
    return m;
  }

  /**
   * Emit the region starting at `n`, stopping before `stop` (a follow/merge node or a loop
   * exit already handled by an enclosing context). `ctx` carries the enclosing loop for
   * break/continue. Returns nothing; appends to `out`.
   */
  function emit(n, stop, depth, ctx) {
    for (;;) {
      if (n === undefined || n === null || n === stop) return;
      if (!reach.has(n)) { push(depth, `goto ${L(n)}; // unreachable in this region`); gotos.add(n); return; }

      // break / continue to the enclosing loop
      if (ctx) {
        if (n === ctx.header && ctx.started) { push(depth, 'continue;'); return; }
        if (n === ctx.exit) { if (ctx.inSwitch) { push(depth, `goto ${L(n)};`); gotos.add(n); } else push(depth, 'break;'); return; }
      }

      if (emitted.has(n)) {
        // a short block that ends the function (a lone `return x;`) is repeated, not jumped to
        const b = byId.get(n);
        if (!b.switch && !loopHeaders.has(n) && !b.succ.some((s) => byId.has(s.to))) {
          const { stmts } = lift(b);
          if (stmts.length <= 2) { for (const s of stmts) push(depth, s); push(depth, 'return;'); return; }
        }
        push(depth, `goto ${L(n)};`); gotos.add(n); return;
      }

      if (loopHeaders.has(n) && !(ctx && ctx.header === n && ctx.started)) { emitLoop(n, depth, ctx); n = loopExit.get(n); continue; }

      emitted.add(n);
      const b = byId.get(n);
      const { stmts, cond } = lift(b);
      // label line printed only if something gotos here (decided at the end); mark position
      out.push({ id: n, depth }); // label placeholder, resolved later
      for (const s of stmts) push(depth, s);

      if (b.switch) { n = emitSwitch(n, b, stop, depth, ctx); continue; }

      const outs = b.succ.filter((s) => byId.has(s.to));
      const condE = outs.find((s) => s.cond), fallE = outs.find((s) => s.fall), jmpE = outs.find((s) => !s.cond && !s.fall);

      if (cond && condE && fallE) {
        // two-way: if (cond) { cond-target } else { fall-target }, merge where the arms meet
        const thenN = condE.to, elseN = fallE.to;
        const m = follow(n, [thenN, elseN], stop, ctx, 2);
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
    emitted.add(h);
    // pre-tested loop: header tests and one edge leaves the body
    const headerExits = cond && condE && fallE && (!body.has(condE.to) || !body.has(fallE.to));
    if (headerExits && !stmts.length && !hb.switch) {
      // while (stay-in-body-condition) { ... }; a goto to the header lands before the test
      const stayCond = body.has(condE.to) ? cond.text : negate(cond.text);
      const next = body.has(condE.to) ? condE.to : fallE.to;
      out.push({ id: h, depth });
      push(depth, `while (${stayCond}) {`);
      emit(next, h, depth + 1, ctx);
      push(depth, '}');
      return;
    }
    // general / post-tested: for(;;) with explicit break/continue
    push(depth, 'for (;;) {');
    out.push({ id: h, depth: depth + 1 });
    for (const s of stmts) push(depth + 1, s);
    if (hb.switch) { emitSwitch(h, hb, h, depth + 1, ctx); }
    else if (cond && condE && fallE) {
      const inThen = body.has(condE.to), inFall = body.has(fallE.to);
      if (inThen && !inFall) { push(depth + 1, `if (${negate(cond.text)}) break;`); emit(condE.to, h, depth + 1, ctx); }
      else if (inFall && !inThen) { push(depth + 1, `if (${cond.text}) break;`); emit(fallE.to, h, depth + 1, ctx); }
      else { // both arms stay in the body: an if inside the loop, merging where the arms meet
        const m = follow(h, [condE.to, fallE.to], h, ctx, 2);
        push(depth + 1, `if (${cond.text}) {`); emit(condE.to, m, depth + 2, ctx); push(depth + 1, '} else {'); emit(fallE.to, m, depth + 2, ctx); push(depth + 1, '}');
        emit(m, h, depth + 1, ctx);
      }
    } else {
      const jmpE = outs.find((s) => !s.cond && !s.fall) || fallE;
      if (jmpE) emit(jmpE.to, h, depth + 1, ctx);
    }
    push(depth, '}');
  }

  emit(entry, null, 1, null);
  // regions the entry never reaches: an exception handler (entered by the runtime), dead code
  let noted = false;
  for (const r of roots) {
    if (emitted.has(r)) continue;
    if (!noted) { push(1, '// not reached from the entry (an exception handler, or dead code):'); noted = true; }
    emit(r, null, 1, null);
  }

  // any block never emitted (skipped by the structured walk): dump as goto targets
  for (const b of live) if (!emitted.has(b.start) && reach.has(b.start)) {
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
  // cleanup pass: collapse an empty else, an if whose both arms are empty, an empty then
  // (the condition is inverted), and a `break;` nothing can reach
  for (let pass = 0; pass < 3; pass += 1) {
    for (let i = 0; i < lines.length - 1; i += 1) {
      const a = lines[i].trim(), b = lines[i + 1].trim();
      if (a === '} else {' && b === '}') { lines.splice(i, 2, lines[i].replace('} else {', '}')); }
      else if (/^if \(.*\) \{$/.test(a) && b === '}') { lines.splice(i, 2); } // empty then, no else
      else if (/^if \(.*\) \{$/.test(a) && b === '} else {') { lines.splice(i, 2, lines[i].replace(/^(\s*)if \((.*)\) \{$/, (_, ind, c) => `${ind}if (${negate(c)}) {`)); }
      else if (b === 'break;' && /^(return\b|throw\b|break;|continue;|goto )/.test(a)) { lines.splice(i + 1, 1); }
    }
  }
  return head + '\nvoid func() {\n' + lines.join('\n') + '\n}';
}

/**
 * Structure the linear, label-and-goto output of a bytecode lift (CIL, Dalvik, EVM) into
 * if/else/while/switch, reusing the same dominator-based structurizer. The input is a list
 * of { off, text } where text is a plain statement, a label `X:`, `goto X;`, `if (c) goto X;`,
 * a `return`/`throw`, or a `switch …`. Branch targets are numeric offsets encoded in the
 * label name (e.g. IL_0012 -> 0x12). Returns the structured body lines (no `void func()`
 * wrapper); where the flow is irreducible a labelled goto remains.
 */
function structureLinear(entries) {
  const offOf = (label) => parseInt(String(label).replace(/^[A-Za-z]+_/, ''), 16);
  const isLabel = (t) => /^[A-Za-z]\w*:$/.test(t);
  // `switch (v) -> L_a, L_b;` (case i = i-th target, default falls through) or
  // `switch (v) { case k: goto L_a; default: goto L_b; }` (explicit default)
  const parseSwitch = (t) => {
    let m = /^switch \((.*)\) -> (.*);$/.exec(t);
    if (m) return { expr: m[1], cases: m[2].split(',').map((lbl, i) => ({ key: i, target: offOf(lbl.trim()) })), default: null };
    m = /^switch \((.*?)\) \{ (.*) \}$/.exec(t);
    if (m) { const cases = []; let def = null; for (const mm of m[2].matchAll(/(?:case (-?\w+)|(default)): goto (\w+);/g)) { if (mm[2]) def = offOf(mm[3]); else cases.push({ key: mm[1], target: offOf(mm[3]) }); } return { expr: m[1], cases, default: def }; }
    return null;
  };
  const labelOffs = new Set(); for (const e of entries) if (isLabel(e.text)) labelOffs.add(offOf(e.text.slice(0, -1)));
  const blocks = []; let cur = null; let dead = false;
  const open = (start) => { cur = { start, stmts: [], term: null, succ: [] }; blocks.push(cur); };
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i]; const t = e.text;
    if (isLabel(t)) { const start = offOf(t.slice(0, -1)); if (cur && !cur.term) cur.fallTo = start; dead = false; open(start); continue; }
    if (dead) continue; // between an unconditional jump and the next label, with that label's offset: never executed
    if (!cur) open(e.off != null ? e.off : 0);
    let m;
    if (/^(return\b|throw\b)/.test(t) || t === '// end handler') { cur.stmts.push(t); cur.term = { kind: 'ret' }; }
    else if ((m = /^goto (\w+);$/.exec(t))) cur.term = { kind: 'goto', target: offOf(m[1]), label: m[1] };
    else if ((m = /^if \((.*)\) goto (\w+);$/.exec(t))) cur.term = { kind: 'if', cond: m[1], target: offOf(m[2]), label: m[2] };
    else if (/^switch\b/.test(t)) {
      const sw = parseSwitch(t);
      if (sw) cur.switch = sw; else cur.stmts.push(t); // an unknown switch shape keeps its line and its case blocks reachable
      cur.term = { kind: 'switch', targets: sw ? [] : [...t.matchAll(/\b[A-Za-z]+_([0-9a-f]+)\b/g)].map((mm) => parseInt(mm[1], 16)) };
    } else { cur.stmts.push(t); continue; }
    // a terminator closed the block; the next entry (if not a label) starts a fresh block
    const next = entries[i + 1];
    if (!next || isLabel(next.text)) { cur = null; continue; }
    const off = next.off != null ? next.off : cur.start + 1;
    if (!labelOffs.has(off)) { open(off); continue; }
    // the next statement carries the offset of the label after it: a value the lift spilled
    // for that label. After a conditional jump it is the fall-through path (own block id);
    // after an unconditional one nothing executes it
    if (cur.term.kind === 'goto' || cur.term.kind === 'ret') { cur = null; dead = true; } else open(off - 0.5);
  }
  if (!blocks.length) return []; // nothing to structure (empty method)
  const ids = new Set(blocks.map((b) => b.start));
  // wire edges
  for (let i = 0; i < blocks.length; i += 1) {
    const b = blocks[i]; const term = b.term;
    const fallNext = () => { const f = b.fallTo != null ? b.fallTo : (blocks[i + 1] && blocks[i + 1].start); if (f != null && ids.has(f)) b.succ.push({ to: f, fall: true }); };
    if (term && term.kind === 'ret') { /* no successors */ }
    else if (term && term.kind === 'switch') {
      if (b.switch) { for (const c of b.switch.cases) if (ids.has(c.target)) b.succ.push({ to: c.target, case: true }); if (b.switch.default != null) { if (ids.has(b.switch.default)) b.succ.push({ to: b.switch.default, case: true }); } else fallNext(); }
      else for (const tgt of term.targets) if (ids.has(tgt)) b.succ.push({ to: tgt }); // keep every case block reachable
    }
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
    if (t === 'return;' && out.length && /^(return\b|throw\b|\/\/ end handler)/.test(out[out.length - 1].trim())) continue;
    if (/^goto \w+;$/.test(t) && out.length && /^(return\b|throw\b)/.test(out[out.length - 1].trim())) continue;
    out.push(body[i]);
  }
  // drop any label line no surviving goto still targets
  const referenced = new Set();
  for (const l of out) { const m = /\bgoto (\w+);/.exec(l); if (m) referenced.add(m[1]); if (/^\s*switch/.test(l)) for (const mm of l.matchAll(/\b([A-Za-z]+_[0-9a-f]+)\b/g)) referenced.add(mm[1]); }
  return out.filter((l) => { const m = /^([A-Za-z]+_[0-9a-f.]+):$/.exec(l.trim()); return !m || referenced.has(m[1]); }); // `case 0:` / `default:` are not labels
}

export { structurize, structureLinear, domTree, dominates, rpo };
