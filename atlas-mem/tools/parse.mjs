/**
 * ATLAS memory — the grammar layer (graph, slice 1).
 *
 * Finds definitions by parsing the file with tree-sitter instead of guessing from the shape
 * of a line. It answers two things the text search cannot: whether a name is really defined
 * (a call or a comment is never mistaken for a definition) and where the definition ends.
 *
 * The parser is the tree-sitter runtime and its grammars compiled to WASM (nothing native),
 * from the `@vscode/tree-sitter-wasm` package (MIT). They are looked for in `wasm/` beside
 * this file first (that is how the plugin ships them), then as an installed package. When
 * neither is there, or a file is in a language without a grammar, `definitions` returns
 * null and the caller falls back to the text search.
 *
 * Loading a grammar is asynchronous and parsing is not, so the grammars a run needs are
 * loaded once with `load()`, and everything after that is synchronous.
 */

import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const GRAMMAR_BY_EXT = {
  '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.jsx': 'javascript',
  '.ts': 'typescript', '.mts': 'typescript', '.cts': 'typescript', '.tsx': 'tsx',
  '.py': 'python', '.pyi': 'python',
  '.go': 'go', '.rs': 'rust', '.java': 'java', '.cs': 'c-sharp',
  '.c': 'cpp', '.h': 'cpp', '.cc': 'cpp', '.cpp': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp',
  '.rb': 'ruby', '.php': 'php', '.sh': 'bash', '.bash': 'bash', '.ps1': 'powershell',
};

/** A node of one of these kinds, with a `name` field, defines that name. */
const DEFINES = /(?:_definition|_declaration|_declarator|_item|_spec|_signature|_statement)$/;
const DEFINES_EXACT = new Set([
  'function_statement', 'class_statement', 'class_method_definition', 'enum_statement', // powershell

  'method', 'singleton_method', 'class', 'module',                       // ruby
  'struct_specifier', 'class_specifier', 'enum_specifier', 'union_specifier', // c, c++
]);
/** Kinds that end like a definition and are not one. */
const NOT_DEFINES = new Set(['import_statement', 'export_statement', 'expression_statement', 'parameter_declaration', 'optional_parameter_declaration']);
/** Wrappers that belong to the definition they hold: `export const x = …`, a decorator, `const (…)`. */
const WRAPPERS = new Set([
  'lexical_declaration', 'variable_declaration', 'export_statement', 'decorated_definition',
  'expression_statement', 'const_declaration', 'var_declaration', 'type_declaration',
  'field_declaration', 'local_variable_declaration', 'template_declaration', 'declaration',
]);
const FUNCTION_VALUES = new Set(['function_expression', 'arrow_function', 'function', 'generator_function', 'lambda']);
/** A node of one of these kinds opens a body: what is defined inside it is local. */
const SCOPES = /function|method|lambda|arrow|block|class_body|constructor|closure|^class$|interface_body|object_type|field_declaration_list|enum_body|struct_item|interface_declaration/;
const IDENTIFIERS = new Set(['identifier', 'property_identifier', 'field_identifier', 'type_identifier', 'constant', 'name', 'word', 'private_property_identifier']);

let runtime = null;          // { Parser, Language } once the package is found
let runtimeTried = false;
const languages = new Map(); // grammar name → Language, or null when it could not be loaded

function wasmDir() {
  const shipped = join(dirname(fileURLToPath(import.meta.url)), 'wasm');
  if (existsSync(join(shipped, 'tree-sitter.js')) && existsSync(join(shipped, 'tree-sitter.wasm'))) return shipped;
  try {
    const require = createRequire(import.meta.url);
    return dirname(require.resolve('@vscode/tree-sitter-wasm'));
  } catch {
    return null;
  }
}

const grammarOf = (file) => GRAMMAR_BY_EXT[extname(file).toLowerCase()] || null;

/**
 * Load the grammars for these files. Safe to call again; never throws: a parser that cannot
 * be loaded only means the text search is used.
 */
async function load(files) {
  const wanted = [...new Set(files.map(grammarOf).filter(Boolean))].filter((g) => !languages.has(g));
  if (!wanted.length) return;
  const dir = wasmDir();
  if (!dir) { runtimeTried = true; return; }
  try {
    if (!runtime && !runtimeTried) {
      runtimeTried = true;
      const require = createRequire(import.meta.url);
      const ts = require(join(dir, 'tree-sitter.js'));
      await ts.Parser.init();
      runtime = ts;
    }
  } catch {
    runtime = null;
  }
  if (!runtime) return;
  for (const g of wanted) {
    const path = join(dir, `tree-sitter-${g}.wasm`);
    try {
      languages.set(g, existsSync(path) ? await runtime.Language.load(path) : null);
    } catch {
      languages.set(g, null);
    }
  }
}

/** True when `definitions` will parse this file instead of returning null. */
const ready = (file) => Boolean(runtime && languages.get(grammarOf(file)));

/** The identifier a C-style declarator finally names: `*name(args)`, `Class::name`. */
function declaredName(node) {
  let n = node;
  for (let depth = 0; n && depth < 8; depth += 1) {
    if (IDENTIFIERS.has(n.type)) return n;
    if (n.type === 'qualified_identifier' || n.type === 'scoped_identifier') { n = n.childForFieldName('name'); continue; }
    n = n.childForFieldName('declarator');
  }
  return null;
}

/** PowerShell's grammar has no field names: the name is a child of a known kind. */
const POWERSHELL = { function_statement: 'function_name', class_statement: 'simple_name', class_method_definition: 'simple_name', enum_statement: 'simple_name' };

/** The node that names what `node` defines, or null when `node` defines nothing. */
function nameOf(node) {
  const type = node.type;

  if (POWERSHELL[type]) {
    for (let i = 0; i < node.namedChildCount; i += 1) { const c = node.namedChild(i); if (c.type === POWERSHELL[type]) return c; }
    return null;
  }
  // powershell `$Limit = 3`: the variable at the bottom of the left side
  if (type === 'assignment_expression' && node.namedChild(0) && node.namedChild(0).type === 'left_assignment_expression') {
    let n = node.namedChild(0);
    while (n && n.namedChildCount === 1) n = n.namedChild(0);
    return n && n.type === 'variable' ? n : null;
  }

  if ((DEFINES.test(type) || DEFINES_EXACT.has(type)) && !NOT_DEFINES.has(type)) {
    const name = node.childForFieldName('name');
    if (name) return IDENTIFIERS.has(name.type) ? name : declaredName(name) || (name.namedChildCount === 0 ? name : null);
    // c, c++: the name sits inside the declarator of a function with a body
    if (type === 'function_definition') return declaredName(node.childForFieldName('declarator'));
    return null;
  }

  // python `LIMIT = 5`, ruby `LIMIT = 5`: an assignment to a plain name, outside any call
  if (type === 'assignment') {
    const left = node.childForFieldName('left');
    return left && IDENTIFIERS.has(left.type) ? left : null;
  }

  // javascript `exports.name = function …`, `this.name = () => …`
  if (type === 'assignment_expression') {
    const left = node.childForFieldName('left');
    const right = node.childForFieldName('right');
    if (left && right && left.type === 'member_expression' && FUNCTION_VALUES.has(right.type)) return left.childForFieldName('property');
    return null;
  }

  // javascript `{ name: function () {…} }`, `{ name: () => … }`
  if (type === 'pair') {
    const key = node.childForFieldName('key');
    const value = node.childForFieldName('value');
    return key && value && IDENTIFIERS.has(key.type) && FUNCTION_VALUES.has(value.type) ? key : null;
  }

  // class fields: `name = …` inside a class body
  if (type === 'field_definition' || type === 'public_field_definition') {
    return node.childForFieldName('property') || node.childForFieldName('name');
  }
  return null;
}

/** The whole statement a definition belongs to: with its `export`, its decorators, its `const`. */
function extentOf(node) {
  let n = node;
  while (n.parent && WRAPPERS.has(n.parent.type)) {
    // `const a = 1, b = 2`: each name keeps its own extent
    const siblings = n.parent.namedChildren.filter((c) => c.type === n.type);
    if (siblings.length > 1) break;
    n = n.parent;
  }
  return n;
}

/**
 * Every definition in `source`: `{ name, line, first, last, kind }`, lines 1-based.
 * `line` is the line the name is on. Returns null when the file cannot be parsed here.
 */
function definitions(source, file) {
  if (!ready(file)) return null;
  const parser = new runtime.Parser();
  let tree = null;
  try {
    parser.setLanguage(languages.get(grammarOf(file)));
    tree = parser.parse(source);
    if (!tree) return null;
    const out = [];
    const stack = [[tree.rootNode, true]];
    while (stack.length) {
      const [node, top] = stack.pop();
      const name = nameOf(node);
      if (name) {
        const extent = extentOf(node);
        out.push({
          name: name.text,
          line: name.startPosition.row + 1,
          first: extent.startPosition.row + 1,
          last: extent.endPosition.row + (extent.endPosition.column === 0 && extent.endPosition.row > extent.startPosition.row ? 0 : 1),
          kind: node.type,
          top,
        });
      }
      const inner = top && !(name && SCOPES.test(node.type)) && !SCOPES.test(node.type);
      for (let i = node.namedChildCount - 1; i >= 0; i -= 1) stack.push([node.namedChild(i), inner]);
    }
    out.sort((a, b) => a.line - b.line || a.first - b.first);
    // a broken file can hide a definition from the grammar: let the caller decide
    return { defs: out, broken: tree.rootNode.hasError };
  } catch {
    return null;
  } finally {
    if (tree) tree.delete();
    parser.delete();
  }
}

/** Parameter lists, in every grammar here, and the names they bind. */
const PARAMS = /parameters$|^parameter_list$|^method_parameters$|^block_parameters$|^lambda_parameters$/;
function identifiersIn(node) {
  const out = [];
  const stack = [node];
  while (stack.length) {
    const n = stack.pop();
    if ((n.type === 'identifier' || n.type === 'shorthand_property_identifier_pattern') && n.namedChildCount === 0) out.push(n.text);
    // a default value is an expression, not a bound name
    // web-tree-sitter hands out a fresh wrapper each time: compare ids, not objects. A default
    // value, a type annotation and the right side of a JS `a = 1` pattern are expressions.
    const skip = new Set();
    for (const f of ['value', 'type', 'right']) { const v = n.childForFieldName(f); if (v) skip.add(v.id); }
    if (n.type === 'assignment_pattern' || n.type === 'default_parameter' || n.type === 'typed_default_parameter') { const l = n.childForFieldName('left') || n.childForFieldName('name'); if (l) { stack.push(l); continue; } }
    for (let i = 0; i < n.namedChildCount; i += 1) { const c = n.namedChild(i); if (!skip.has(c.id)) stack.push(c); }
  }
  return out;
}

/** Other binders, and the field that holds the names they bind: loops, `:=`, `as`, destructuring. */
const BINDERS = { for_in_statement: ['left'], for_statement: ['left'], range_clause: ['left'], for_expression: ['pattern'], short_var_declaration: ['left'], as_pattern: ['alias'], variable_declarator: ['name'], assignment: ['left'], let_declaration: ['pattern'], with_item: ['value'] };

const REFERENCE_TYPES = new Set(['identifier', 'type_identifier', 'constant', 'word', 'variable']);

/**
 * The names used between lines `first` and `last` (1-based) that are not defined there:
 * what the code in that range depends on, by name. Property accesses (`obj.method`) are
 * not included: without types, which `method` is meant cannot be told. Null when the file
 * cannot be parsed here.
 */
function references(source, file, first, last) {
  if (!ready(file)) return null;
  const parser = new runtime.Parser();
  let tree = null;
  try {
    parser.setLanguage(languages.get(grammarOf(file)));
    tree = parser.parse(source);
    if (!tree) return null;
    const inside = (n) => n.startPosition.row + 1 >= first && n.startPosition.row + 1 <= last;
    const used = new Set();
    const defined = new Set();
    const stack = [tree.rootNode];
    while (stack.length) {
      const node = stack.pop();
      if (node.endPosition.row + 1 < first || node.startPosition.row + 1 > last) continue;
      if (inside(node)) {
        const name = nameOf(node);
        if (name) defined.add(name.text);
        if (PARAMS.test(node.type)) for (const id of identifiersIn(node)) defined.add(id);
        if (BINDERS[node.type]) for (const f of BINDERS[node.type]) { const bound = node.childForFieldName(f); if (bound) for (const id of identifiersIn(bound)) defined.add(id); }
        if (node.type === 'arrow_function' || node.type === 'catch_clause') { const one = node.childForFieldName('parameter'); if (one) for (const id of identifiersIn(one)) defined.add(id); }
        if (REFERENCE_TYPES.has(node.type) && node.namedChildCount === 0) used.add(node.text);
      }
      for (let i = node.namedChildCount - 1; i >= 0; i -= 1) stack.push(node.namedChild(i));
    }
    return [...used].filter((n) => !defined.has(n)).sort();
  } catch {
    return null;
  } finally {
    if (tree) tree.delete();
    parser.delete();
  }
}

// ---------------------------------------------------------------------------------------
// one parse, everything the code graph needs from a file

const LITERALS = /string|number|integer|float|char|template|regex|boolean|true|false|null|none|nil/i;
const IDENT = /identifier|^name$|^word$|^constant$|^variable$|property_identifier|field_identifier|type_identifier/;
const NO_SHAPE = /comment/;

/** A string literal's content without its quotes (`'./x'`, `"lib"`, `` `t` ``). */
function literal(node) {
  if (!node) return null;
  return node.text.replace(/^[`'"]+|[`'"]+$/g, '');
}

/** The modules a file imports: `{ module, line }`; relative or bare, as written. */
function importsOf(root, grammar) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    if (grammar === 'javascript' || grammar === 'typescript' || grammar === 'tsx') {
      if ((n.type === 'import_statement' || n.type === 'export_statement') && n.childForFieldName('source')) {
        out.push({ module: literal(n.childForFieldName('source')), line: n.startPosition.row + 1 });
      } else if (n.type === 'call_expression') {
        const fn = n.childForFieldName('function');
        const args = n.childForFieldName('arguments');
        if (fn && (fn.text === 'require' || fn.text === 'import') && args && args.namedChildCount === 1 && /string/.test(args.namedChild(0).type)) {
          out.push({ module: literal(args.namedChild(0)), line: n.startPosition.row + 1 });
        }
      }
    } else if (grammar === 'python') {
      if (n.type === 'import_statement') {
        for (let i = 0; i < n.namedChildCount; i += 1) { const c = n.namedChild(i); const name = c.type === 'aliased_import' ? c.childForFieldName('name') : c; if (name) out.push({ module: name.text, line: n.startPosition.row + 1 }); }
      } else if (n.type === 'import_from_statement') {
        const m = n.childForFieldName('module_name');
        if (m) out.push({ module: m.text, line: n.startPosition.row + 1 });
      }
    } else if (grammar === 'go' && n.type === 'import_spec') {
      out.push({ module: literal(n.childForFieldName('path')), line: n.startPosition.row + 1 });
    }
    for (let i = n.namedChildCount - 1; i >= 0; i -= 1) stack.push(n.namedChild(i));
  }
  return out;
}

/**
 * The shape of a piece of code: the tree in preorder with every name turned into ID and
 * every literal into LIT, keywords and operators kept. Two functions with the same shape do
 * the same thing with different names — the "masked duplicate" the text compare misses.
 */
function shapeOf(node) {
  const out = [];
  const stack = [node];
  while (stack.length) {
    const n = stack.pop();
    if (NO_SHAPE.test(n.type)) continue;
    if (n.childCount === 0) {
      if (IDENT.test(n.type)) out.push('ID');
      else if (LITERALS.test(n.type)) out.push('LIT');
      else out.push(n.text);
    } else if (LITERALS.test(n.type) && !/template/.test(n.type)) {
      out.push('LIT');
    } else {
      out.push(n.type);
      for (let i = n.childCount - 1; i >= 0; i -= 1) stack.push(n.child(i));
    }
  }
  return out;
}

/** True when the file calls code in ways a static graph cannot see (the false-positive list). */
const DYNAMIC = /ipcMain\.(?:handle|on)\s*\(|ipcRenderer\.|contextBridge|getattr\s*\(|globalThis\[|window\[|\bkoffi\b|importlib|__import__|\beval\s*\(|new Function\s*\(|\bdispatch\w*\s*\(|\[\s*['"`][\w-]+['"`]\s*\]\s*\(|addEventListener\s*\(|\.on\s*\(\s*['"`]/;

/** The names a class or interface declares as its parents: extends, implements, Python bases. */
function basesOf(node) {
  const out = [];
  const take = (n) => { if (!n) return; const stack = [n]; while (stack.length) { const m = stack.pop(); if (IDENTIFIERS.has(m.type) && m.namedChildCount === 0) out.push(m.text); else if (m.type === 'member_expression' || m.type === 'attribute' || m.type === 'scoped_type_identifier' || m.type === 'generic_type' || m.type === 'nested_type_identifier') { const last = m.childForFieldName('property') || m.childForFieldName('attribute') || m.childForFieldName('name') || m.namedChild(0); if (last && last.namedChildCount === 0) out.push(last.text); } else for (let i = 0; i < m.namedChildCount; i += 1) stack.push(m.namedChild(i)); } };
  for (let i = 0; i < node.namedChildCount; i += 1) {
    const c = node.namedChild(i);
    if (/class_heritage|extends_clause|implements_clause|extends_type_clause|superclass|super_interfaces|base_list|superclasses|extends_interfaces|interface_type_list/.test(c.type)) take(c);
  }
  const sc = node.childForFieldName('superclasses') || node.childForFieldName('superclass');
  if (sc) take(sc);
  return [...new Set(out)];
}

/**
 * Everything the code graph wants from one file, from one parse:
 * `{ defs: [{ name, kind, line, first, last, top, exported, shape, tokens, refs }], imports, dynamic, broken }`.
 * `refs` are the names each definition uses that it does not define itself (depth one, no
 * property accesses). Null when the file cannot be parsed here.
 */
function analyze(source, file) {
  if (!ready(file)) return null;
  const grammar = grammarOf(file);
  const parser = new runtime.Parser();
  let tree = null;
  try {
    parser.setLanguage(languages.get(grammar));
    tree = parser.parse(source);
    if (!tree) return null;
    const defs = [];
    const stack = [[tree.rootNode, true]];
    while (stack.length) {
      const [node, top] = stack.pop();
      const name = nameOf(node);
      if (name) {
        const extent = extentOf(node);
        const first = extent.startPosition.row + 1;
        const last = extent.endPosition.row + (extent.endPosition.column === 0 && extent.endPosition.row > extent.startPosition.row ? 0 : 1);
        // names used inside, minus what the definition binds itself
        const used = new Set(); const bound = new Set([name.text]);
        const inner = [node];
        while (inner.length) {
          const m = inner.pop();
          if (m !== node) { const nm = nameOf(m); if (nm) bound.add(nm.text); }
          if (PARAMS.test(m.type)) for (const id of identifiersIn(m)) bound.add(id);
          if (BINDERS[m.type]) for (const f of BINDERS[m.type]) { const b = m.childForFieldName(f); if (b) for (const id of identifiersIn(b)) bound.add(id); }
          if (m.type === 'arrow_function' || m.type === 'catch_clause') { const one = m.childForFieldName('parameter'); if (one) for (const id of identifiersIn(one)) bound.add(id); }
          if (REFERENCE_TYPES.has(m.type) && m.namedChildCount === 0) used.add(m.text);
          for (let i = m.namedChildCount - 1; i >= 0; i -= 1) inner.push(m.namedChild(i));
        }
        const shape = shapeOf(node);
        const exported = /^\s*(?:export\b|module\.exports|exports\.)/.test(source.split(/\r?\n/)[first - 1] || '') || (grammar === 'python' && top && !name.text.startsWith('_')) || (grammar === 'go' && /^[A-Z]/.test(name.text));
        const bases = /class|interface|struct/.test(node.type) ? basesOf(node).filter((b) => b !== name.text) : [];
        defs.push({ name: name.text, kind: node.type, line: name.startPosition.row + 1, first, last, top, exported, shape: shape.join(' '), tokens: shape.length, refs: [...used].filter((u) => !bound.has(u)).sort(), bases });
      }
      const nextTop = top && !SCOPES.test(node.type);
      for (let i = node.namedChildCount - 1; i >= 0; i -= 1) stack.push([node.namedChild(i), nextTop]);
    }
    defs.sort((a, b) => a.line - b.line || a.first - b.first);
    return { defs, imports: importsOf(tree.rootNode, grammar), dynamic: DYNAMIC.test(source), broken: tree.rootNode.hasError };
  } catch {
    return null;
  } finally {
    if (tree) tree.delete();
    parser.delete();
  }
}

export { GRAMMAR_BY_EXT, grammarOf, load, ready, definitions, references, analyze };
