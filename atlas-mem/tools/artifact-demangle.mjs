/**
 * ATLAS — demangle linker symbol names to a readable form. Two schemes, from their public
 * specifications: Rust v0 (the rustc-demangle / RFC 2603 grammar, symbols starting `_R`) and
 * the C++ Itanium ABI (`_Z…`, also the carrier for legacy Rust names with a trailing hash).
 * Best-effort and reversible-to-readable, not a full type printer: when a construct is not
 * recognised the original symbol is returned unchanged, never a wrong name. Nothing is executed.
 */

// ---- Rust v0 (RFC 2603) ---------------------------------------------------------------------
function demangleRustV0(sym) {
  if (!sym.startsWith('_R')) return null;
  let o = 2; const subs = []; // byte offsets of parsed paths, for backrefs
  const peek = () => sym[o];
  const digits = () => { let n = ''; while (o < sym.length && sym[o] >= '0' && sym[o] <= '9') { n += sym[o]; o += 1; } return n ? parseInt(n, 10) : 0; };
  const base62 = () => { let s = ''; while (o < sym.length && sym[o] !== '_') { s += sym[o]; o += 1; } if (sym[o] === '_') o += 1; return s; };
  const ident = () => { // <undisambiguated-identifier>: optional 'u' (punycode) then <len><bytes>
    let punycode = false; if (peek() === 'u') { punycode = true; o += 1; }
    const len = digits(); if (sym[o] === '_') o += 1; // optional separator
    const s = sym.slice(o, o + len); o += len; return punycode ? s.replace(/_/g, '::') : s;
  };
  const disambiguator = () => { if (peek() === 's') { o += 1; base62(); } };
  function path() {
    const start = o; const tag = sym[o]; o += 1; let r;
    if (tag === 'C') { disambiguator(); r = ident(); } // crate root
    else if (tag === 'N') { const ns = sym[o]; o += 1; const parent = path(); disambiguator(); const name = ident(); r = parent + '::' + name; void ns; } // nested
    else if (tag === 'M') { disambiguator(); path(); const ty = type(); r = `<${ty}>`; } // inherent impl
    else if (tag === 'X') { disambiguator(); path(); const ty = type(); const tr = path(); r = `<${ty} as ${tr}>`; } // trait impl
    else if (tag === 'I') { const base = path(); const args = []; while (peek() !== 'E' && o < sym.length) args.push(genericArg()); if (peek() === 'E') o += 1; r = args.length ? `${base}::<${args.join(', ')}>` : base; } // generic
    else if (tag === 'B') { const i = parseInt(base62() || '0', 36); r = subs[i] || '_'; return r; } // backref (not added to subs)
    else { o = start; r = null; }
    if (r != null) subs.push(r);
    return r;
  }
  function genericArg() { if (peek() === 'L') { o += 1; base62(); return '_'; } if (peek() === 'K') { o += 1; return constArg(); } return type() || '_'; }
  function constArg() { const t = sym[o]; o += 1; if (t === 'p') return '_'; const n = base62(); return n || '_'; }
  const BASIC = { a: 'i8', b: 'bool', c: 'char', d: 'f64', e: 'str', f: 'f32', h: 'u8', i: 'isize', j: 'usize', l: 'i32', m: 'u32', n: 'i128', o: 'u128', p: '_', s: 'i16', t: 'u16', u: '()', v: '...', x: 'i64', y: 'u64', z: '!' };
  function type() {
    const t = peek();
    if (BASIC[t] && /[a-z]/.test(t)) { o += 1; return BASIC[t]; } // a basic type is a single lowercase letter (incl. 'u' = unit, 'p' = placeholder)
    if (t === 'A') { o += 1; const el = type(); constArg(); return `[${el}]`; }
    if (t === 'S') { o += 1; return `[${type()}]`; }
    if (t === 'R' || t === 'Q') { o += 1; if (peek() === 'L') { o += 1; base62(); } return '&' + type(); }
    if (t === 'P' || t === 'O') { o += 1; return '*' + type(); }
    if (t === 'T') { o += 1; const els = []; while (peek() !== 'E' && o < sym.length) els.push(type()); if (peek() === 'E') o += 1; return `(${els.join(', ')})`; }
    if (t === 'B') { o += 1; const i = parseInt(base62() || '0', 36); return subs[i] || '_'; }
    return path() || '_';
  }
  try { const r = path(); if (r && o >= sym.length - 20) return r; return r || null; } catch { return null; }
}

// ---- C++ Itanium ABI (and legacy Rust, which is Itanium with a trailing hash) ---------------
const ITANIUM_BUILTIN = { v: 'void', b: 'bool', c: 'char', a: 'signed char', h: 'unsigned char', s: 'short', t: 'unsigned short', i: 'int', j: 'unsigned int', l: 'long', m: 'unsigned long', x: 'long long', y: 'unsigned long long', f: 'float', d: 'double', w: 'wchar_t', e: 'long double', Pv: 'void*' };
function demangleItanium(sym) {
  let s = sym; if (s.startsWith('__Z')) s = s.slice(1); // Mach-O leading underscore
  if (!s.startsWith('_Z')) return null;
  let o = 2;
  const srcName = () => { let n = ''; while (o < s.length && s[o] >= '0' && s[o] <= '9') { n += s[o]; o += 1; } if (!n) return null; const len = parseInt(n, 10); const name = s.slice(o, o + len); o += len; return name; };
  const names = [];
  const skipTemplate = () => { let d = 0; while (o < s.length) { if (s[o] === 'I') { d += 1; o += 1; } else if (s[o] === 'E') { d -= 1; o += 1; if (d === 0) return; } else o += 1; } };
  const readSeq = () => { const parts = []; for (;;) { if (s[o] === 'S' && s[o + 1] === 't') { o += 2; parts.push('std'); continue; } if (s[o] === 'I') { skipTemplate(); continue; } const n = srcName(); if (n == null) break; parts.push(n); } return parts; };
  if (s[o] === 'N') { // nested-name N [cv] <prefix> E
    o += 1; while (s[o] === 'r' || s[o] === 'V' || s[o] === 'K') o += 1; // cv-qualifiers
    const parts = readSeq();
    // skip a trailing template-args or the function parameters, and the Rust hash (17h<16hex>)
    return parts.length ? parts.join('::').replace(/::\d+h[0-9a-f]+$/, '') : null;
  }
  if (s[o] === 'S' && s[o + 1] === 't') { o += 2; const n = srcName(); return n ? 'std::' + n : null; }
  const n = srcName(); void names; void ITANIUM_BUILTIN; return n || null;
}

/** Demangle a symbol by whichever scheme matches; returns the readable name or the input. */
function demangle(sym) {
  if (!sym || typeof sym !== 'string') return sym;
  if (sym.startsWith('_R')) { const r = demangleRustV0(sym); return r || sym; }
  if (sym.startsWith('_Z') || sym.startsWith('__Z')) { const r = demangleItanium(sym); return r || sym; }
  return sym;
}

export { demangle, demangleRustV0, demangleItanium };
