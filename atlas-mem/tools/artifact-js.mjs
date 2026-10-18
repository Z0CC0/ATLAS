/**
 * ATLAS — the JavaScript side of the artifact reader, on a real parse.
 *
 * `artifact.mjs` reads an application's files; this file reads one JavaScript file as a
 * syntax tree (tree-sitter, `parse.mjs`) and returns the facts the text patterns can only
 * guess at: a channel name held in a constant, built from a template or from two literals,
 * taken from an object of channels, imported from another file; the wrapper the app wrote
 * around `ipcMain.handle`; the window's preferences read as pairs, not as text nearby.
 *
 * Every fact carries a line and a confidence: `observed` when the value is a literal in
 * place, `derived` when it was resolved through a constant or a wrapper, and null with the
 * expression text when it could not be resolved.
 */

import * as parse from './parse.mjs';

const IPC_MAIN = new Set(['on', 'once', 'handle', 'handleOnce', 'removeHandler', 'removeListener']);
const IPC_RENDERER = new Set(['on', 'once', 'invoke', 'send', 'sendSync', 'postMessage', 'sendTo', 'removeListener']);
const PROCESS_FNS = new Set(['spawn', 'exec', 'execFile', 'execSync', 'spawnSync', 'execFileSync', 'fork']);
const SHELL_FNS = new Set(['openExternal', 'openPath', 'trashItem', 'showItemInFolder']);
const PREFS = new Set(['nodeIntegration', 'contextIsolation', 'sandbox', 'webSecurity', 'allowRunningInsecureContent', 'nodeIntegrationInWorker', 'enableRemoteModule', 'webviewTag']);
const SAFE_PREF = { nodeIntegration: 'false', contextIsolation: 'true', sandbox: 'true', webSecurity: 'true', allowRunningInsecureContent: 'false', nodeIntegrationInWorker: 'false', enableRemoteModule: 'false', webviewTag: 'false' };
const POWERS = /^(app\.setLoginItemSettings|autoUpdater\.\w+|protocol\.register\w+|session\.defaultSession|app\.setAsDefaultProtocolClient|globalShortcut\.register|desktopCapturer\.\w+|systemPreferences\.\w+|screen\.getAllDisplays|clipboard\.(?:read|write)\w*|powerMonitor\.\w+|nativeTheme\.\w+)$/;
const URL_RE = /\b(?:https?|wss?):\/\/[A-Za-z0-9][A-Za-z0-9.-]*(?::\d+)?(?:\/[^\s'"`<>)\]},]*)?/g;
const SECRET_ENV = /^[A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS)[A-Z0-9_]*$/;

const prepare = (files) => parse.load(files);
const ready = (file) => parse.ready(file);

/** The text of a string node without its quotes; a template with no substitution counts. */
function literalOf(node) {
  if (!node) return null;
  if (node.type === 'string') { const frags = node.namedChildren.filter((c) => c.type === 'string_fragment'); return frags.length ? frags.map((f) => f.text).join('') : node.text.slice(1, -1); }
  if (node.type === 'template_string') { if (node.namedChildren.some((c) => c.type === 'template_substitution')) return null; return node.text.slice(1, -1); }
  return null;
}

/** Walk every node once, depth first, in source order. */
function walk(root, fn) {
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    if (fn(n) === false) continue;
    const kids = n.namedChildren;
    for (let i = kids.length - 1; i >= 0; i -= 1) stack.push(kids[i]);
  }
}

/** Top-level constants of one file: name → literal, and name → { key → literal } for objects. */
function constantsOf(root) {
  const scalars = new Map();
  const objects = new Map();
  const exported = { scalars: new Map(), objects: new Map() };
  const objectOf = (node) => {
    let v = node;
    if (v && v.type === 'call_expression' && /^Object\.freeze$/.test(v.childForFieldName('function')?.text || '') && v.childForFieldName('arguments')?.namedChildCount === 1) v = v.childForFieldName('arguments').namedChild(0);
    if (!v || v.type !== 'object') return null;
    const m = new Map();
    for (const p of v.namedChildren) {
      if (p.type !== 'pair') continue;
      const k = p.childForFieldName('key'); const val = literalOf(p.childForFieldName('value'));
      const key = k ? (k.type === 'property_identifier' || k.type === 'identifier' ? k.text : literalOf(k)) : null;
      if (key && val !== null) m.set(key, val);
    }
    return m;
  };
  // constants at any depth: a bundle wraps every module in a function, so "top level" is
  // not where its constants live. The name is the key; a name defined twice keeps the last
  // reading, which is why a resolved constant is `derived`, never `observed`.
  walk(root, (n) => {
    if (n.type === 'variable_declarator') {
      const name = n.childForFieldName('name'); const value = n.childForFieldName('value');
      if (!name || name.type !== 'identifier') return;
      const lit = literalOf(value);
      if (lit !== null) { scalars.set(name.text, lit); return; }
      const obj = objectOf(value);
      if (obj) objects.set(name.text, obj);
      return;
    }
    // a compiled enum: (function (E) { E["A"] = "a"; E.B = "b"; })(Name || (Name = {}))
    if (n.type === 'call_expression') {
      const fn = n.childForFieldName('function'); const args = n.childForFieldName('arguments');
      const inner = fn?.type === 'parenthesized_expression' ? fn.namedChild(0) : fn;
      if (!inner || !/^(function_expression|function|arrow_function)$/.test(inner.type) || args?.namedChildCount !== 1) return;
      const enumName = /^([A-Za-z_$][\w$]*)\s*\|\|/.exec(args.namedChild(0).text)?.[1];
      if (!enumName) return;
      const param = inner.childForFieldName('parameters')?.namedChild(0)?.text;
      if (!param) return;
      const m = new Map();
      walk(inner.childForFieldName('body') || inner, (s) => {
        if (s.type !== 'assignment_expression') return;
        const left = s.childForFieldName('left'); const val = literalOf(s.childForFieldName('right'));
        if (val === null || !left) return;
        if (left.type === 'subscript_expression' && left.childForFieldName('object')?.text === param) { const k = literalOf(left.childForFieldName('index')); if (k !== null) m.set(k, val); }
        else if (left.type === 'member_expression' && left.childForFieldName('object')?.text === param) m.set(left.childForFieldName('property').text, val);
      });
      if (m.size) objects.set(enumName, m);
    }
  });
  for (const stmt of root.namedChildren) {
    const decl = stmt.type === 'export_statement' ? stmt.namedChildren.find((c) => c.type === 'lexical_declaration' || c.type === 'variable_declaration') : null;
    if (decl) {
      for (const d of decl.namedChildren) {
        if (d.type !== 'variable_declarator') continue;
        const name = d.childForFieldName('name');
        if (!name || name.type !== 'identifier') continue;
        if (scalars.has(name.text)) exported.scalars.set(name.text, scalars.get(name.text));
        if (objects.has(name.text)) exported.objects.set(name.text, objects.get(name.text));
      }
    }
    if (stmt.type === 'expression_statement' && stmt.namedChild(0)?.type === 'assignment_expression') {
      const a = stmt.namedChild(0); const left = a.childForFieldName('left')?.text || ''; const right = a.childForFieldName('right');
      if (left === 'module.exports') {
        const obj = objectOf(right); if (obj) for (const [k, v] of obj) exported.scalars.set(k, v);
        const id = right?.type === 'identifier' ? right.text : null;
        if (id && objects.has(id)) { for (const [k, v] of objects.get(id)) exported.scalars.set(k, v); exported.objects.set(id, objects.get(id)); }
        // `module.exports = { CH, PREFIX }`: each shorthand name carries what the file defined
        if (right?.type === 'object') for (const p of right.namedChildren) {
          const name = p.type === 'shorthand_property_identifier' ? p.text : p.type === 'pair' && p.childForFieldName('value')?.type === 'identifier' ? p.childForFieldName('value').text : null;
          const key = p.type === 'pair' ? (p.childForFieldName('key')?.text || '').replace(/^['"`]|['"`]$/g, '') : name;
          if (!name || !key) continue;
          if (scalars.has(name)) exported.scalars.set(key, scalars.get(name));
          if (objects.has(name)) exported.objects.set(key, objects.get(name));
        }
      }
      else if (/^(?:module\.)?exports\.[A-Za-z_$][\w$]*$/.test(left)) { const k = left.split('.').pop(); const lit = literalOf(right); if (lit !== null) exported.scalars.set(k, lit); const obj = objectOf(right); if (obj) exported.objects.set(k, obj); }
    }
  }
  return { scalars, objects, exported };
}

/** Resolve an expression to a string: a literal, a constant, `OBJ.key`, `a + b`, a template. */
function resolve(node, consts, imported) {
  if (!node) return null;
  const lit = literalOf(node);
  if (lit !== null) return { value: lit, confidence: 'observed' };
  if (node.type === 'parenthesized_expression' && node.namedChildCount === 1) return resolve(node.namedChild(0), consts, imported);
  if (node.type === 'identifier') {
    if (consts.scalars.has(node.text)) return { value: consts.scalars.get(node.text), confidence: 'derived' };
    if (imported.scalars.has(node.text)) return { value: imported.scalars.get(node.text), confidence: 'derived' };
    return null;
  }
  if (node.type === 'member_expression') {
    const obj = node.childForFieldName('object'); const prop = node.childForFieldName('property');
    if (obj?.type === 'identifier' && prop) {
      const table = consts.objects.get(obj.text) || imported.objects.get(obj.text);
      if (table && table.has(prop.text)) return { value: table.get(prop.text), confidence: 'derived' };
    }
    return null;
  }
  if (node.type === 'binary_expression' && node.child(1)?.text === '+') {
    const l = resolve(node.childForFieldName('left'), consts, imported); const r = resolve(node.childForFieldName('right'), consts, imported);
    if (l && r) return { value: l.value + r.value, confidence: 'derived' };
    return null;
  }
  if (node.type === 'template_string') {
    let out = ''; let conf = 'observed';
    for (const c of node.namedChildren) {
      if (c.type === 'string_fragment') out += c.text;
      else if (c.type === 'template_substitution') { const r = resolve(c.namedChild(0), consts, imported); if (!r) return null; out += r.value; conf = 'derived'; }
    }
    return { value: out, confidence: conf };
  }
  return null;
}

/** The names a file pulls from another: `const { A } = require('./x')`, `const C = require('./x')`, `import { A } from './x'`. */
function importBindingsOf(root) {
  const out = []; // { spec, names: [{ local, imported }] | null (whole module as `local`), line }
  const req = (node) => node?.type === 'call_expression' && node.childForFieldName('function')?.text === 'require' ? literalOf(node.childForFieldName('arguments')?.namedChild(0)) : null;
  for (const stmt of root.namedChildren) {
    if (stmt.type === 'lexical_declaration' || stmt.type === 'variable_declaration') {
      for (const d of stmt.namedChildren) {
        if (d.type !== 'variable_declarator') continue;
        const spec = req(d.childForFieldName('value')); if (!spec) continue;
        const name = d.childForFieldName('name');
        if (name.type === 'identifier') out.push({ spec, whole: name.text, names: [], line: stmt.startPosition.row + 1 });
        else if (name.type === 'object_pattern') out.push({ spec, whole: null, names: name.namedChildren.map((p) => p.type === 'shorthand_property_identifier_pattern' ? { local: p.text, imported: p.text } : p.type === 'pair_pattern' ? { local: p.childForFieldName('value')?.text, imported: p.childForFieldName('key')?.text } : null).filter(Boolean), line: stmt.startPosition.row + 1 });
      }
    } else if (stmt.type === 'import_statement') {
      const spec = literalOf(stmt.childForFieldName('source')); if (!spec) continue;
      const clause = stmt.namedChildren.find((c) => c.type === 'import_clause');
      const names = []; let whole = null;
      if (clause) for (const c of clause.namedChildren) {
        if (c.type === 'identifier') whole = c.text;
        else if (c.type === 'namespace_import') whole = c.namedChild(0)?.text || null;
        else if (c.type === 'named_imports') for (const s of c.namedChildren) if (s.type === 'import_specifier') names.push({ local: (s.childForFieldName('alias') || s.childForFieldName('name')).text, imported: s.childForFieldName('name').text });
      }
      out.push({ spec, whole, names, line: stmt.startPosition.row + 1 });
    }
  }
  return out;
}

/**
 * The bundler's own structure, when there is one: a webpack module table (an object whose
 * members are numbered functions `79418(e,t,r){…}` or numbered pairs), or esbuild's
 * `__commonJS({ "src/x.ts"(exports, module) {…} })` / `__esm({ "src/x.ts"() {…} })`. Returns
 * the modules with their extent and the edges between them (webpack: calls to the module's
 * own require parameter with a number), or null when the file is not a bundle this reads.
 */
function bundleOf(root) {
  const modules = []; const edges = [];
  const ext = (n) => ({ start: { line: n.startPosition.row + 1, col: n.startPosition.column }, end: { line: n.endPosition.row + 1, col: n.endPosition.column } });
  let kind = null;
  walk(root, (n) => {
    if (kind === 'webpack') return false;
    if (n.type === 'object' && n.namedChildCount >= 10) {
      const kids = n.namedChildren;
      const numbered = kids.filter((c) => (c.type === 'method_definition' && /^\d+$/.test(c.childForFieldName('name')?.text || '')) || (c.type === 'pair' && /^(number|string)$/.test(c.childForFieldName('key')?.type || '') && /^(function_expression|arrow_function|function)$/.test(c.childForFieldName('value')?.type || '')));
      if (numbered.length >= 10 && numbered.length >= kids.length * 0.9) {
        kind = 'webpack';
        for (const c of numbered) {
          const id = c.type === 'method_definition' ? c.childForFieldName('name').text : c.childForFieldName('key').text.replace(/^['"`]|['"`]$/g, '');
          const fn = c.type === 'method_definition' ? c : c.childForFieldName('value');
          const params = fn.childForFieldName('parameters');
          const req = params && params.namedChildCount >= 3 ? params.namedChild(2).text : null;
          modules.push({ id, ...ext(c) });
          if (req) walk(fn.childForFieldName('body') || fn, (m) => {
            if (m.type !== 'call_expression') return;
            if (m.childForFieldName('function')?.text !== req) return;
            const a = m.childForFieldName('arguments')?.namedChild(0);
            if (a && a.type === 'number') edges.push({ from: id, to: a.text });
          });
        }
        return false;
      }
    }
    if (n.type === 'call_expression' && /^(__commonJS|__esm)$/.test(n.childForFieldName('function')?.text || '')) {
      const obj = n.childForFieldName('arguments')?.namedChild(0);
      const m = obj?.type === 'object' ? obj.namedChildren.find((c) => c.type === 'method_definition' || c.type === 'pair') : null;
      const key = m ? (m.type === 'method_definition' ? m.childForFieldName('name') : m.childForFieldName('key')) : null;
      const id = key ? (literalOf(key) ?? key.text.replace(/^['"`]|['"`]$/g, '')) : null;
      if (id) { kind = kind || 'esbuild'; modules.push({ id, ...ext(n) }); }
      return false;
    }
  });
  return kind ? { kind, modules, edges } : null;
}

/**
 * Read one file. `imported` is what the caller resolved from the file's imports (scalars and
 * objects by local name), empty on the first pass.
 */
function scan(text, file, imported, knownWrappers) {
  imported = imported || { scalars: new Map(), objects: new Map() };
  knownWrappers = knownWrappers || new Map();
  return parse.withTree(text, file, (root) => {
    const consts = constantsOf(root);
    const out = { bundle: bundleOf(root), imports: [], ipc: [], bridge: [], windows: [], prefs: [], urls: [], processes: [], shell: [], powers: [], evals: [], envSecrets: [], wrappers: [], calls: [], constants: consts, bindings: importBindingsOf(root), broken: root.hasError };
    const line = (n) => n.startPosition.row + 1;
    const col = (n) => n.startPosition.column;
    const fnParams = (fnNode) => { const p = fnNode.childForFieldName('parameters') || fnNode.childForFieldName('parameter'); const names = []; if (p) for (const c of (p.type === 'identifier' ? [p] : p.namedChildren)) { const id = c.type === 'identifier' ? c : c.type === 'assignment_pattern' ? c.childForFieldName('left') : c.type === 'rest_pattern' ? c.namedChild(0) : null; names.push(id && id.type === 'identifier' ? id.text : null); } return names; };
    // wrappers: a function whose body calls ipcMain.<method>(<one of its own parameters>, …)
    const functions = [];
    walk(root, (n) => {
      if (n.type === 'function_declaration') functions.push({ name: n.childForFieldName('name')?.text, node: n });
      else if (n.type === 'variable_declarator' && /^(arrow_function|function_expression|function)$/.test(n.childForFieldName('value')?.type || '')) functions.push({ name: n.childForFieldName('name')?.text, node: n.childForFieldName('value') });
      else if (n.type === 'pair' && n.childForFieldName('value')?.type === 'arrow_function') functions.push({ name: n.childForFieldName('key')?.text, node: n.childForFieldName('value') });
      else if (n.type === 'method_definition') functions.push({ name: n.childForFieldName('name')?.text, node: n, method: true });
    });
    for (const f of functions) {
      if (!f.name) continue;
      const params = fnParams(f.node);
      walk(f.node.childForFieldName('body') || f.node, (n) => {
        if (n.type !== 'call_expression') return;
        const fn = n.childForFieldName('function');
        if (fn?.type !== 'member_expression') return;
        const obj = fn.childForFieldName('object')?.text; const method = fn.childForFieldName('property')?.text;
        const first = n.childForFieldName('arguments')?.namedChild(0);
        const main = /(^|\.)ipcMain$/.test(obj || ''), renderer = /(^|\.)ipcRenderer$/.test(obj || ''), push = method === 'send' && /webContents$/.test(obj || '');
        if ((main && IPC_MAIN.has(method) || renderer && IPC_RENDERER.has(method) || push) && first?.type === 'identifier' && params.includes(first.text)) out.wrappers.push({ name: f.name, side: main ? 'main' : renderer ? 'renderer' : 'push', method: Boolean(f.method), ipc: method, arg: params.indexOf(first.text), line: line(n), col: col(n) });
      });
    }
    walk(root, (n) => {
      if (n.type === 'import_statement') { const s = literalOf(n.childForFieldName('source')); if (s) out.imports.push({ spec: s, line: line(n), col: col(n), dynamic: false }); return; }
      if (n.type === 'export_statement' && n.childForFieldName('source')) { const s = literalOf(n.childForFieldName('source')); if (s) out.imports.push({ spec: s, line: line(n), col: col(n), dynamic: false }); return; }
      if (n.type === 'string' || n.type === 'template_string') {
        const t = literalOf(n) ?? n.text;
        for (const m of t.matchAll(URL_RE)) out.urls.push({ url: m[0].replace(/[.,;:]+$/, ''), line: line(n), col: col(n) });
        return false;
      }
      if (n.type === 'member_expression') {
        const t = n.text;
        if (POWERS.test(t)) out.powers.push({ api: t, line: line(n), col: col(n) });
        if (/^process\.env\.[A-Z0-9_]+$/.test(t) && SECRET_ENV.test(t.split('.').pop())) out.envSecrets.push({ name: t.split('.').pop(), line: line(n), col: col(n) });
        return;
      }
      if (n.type === 'new_expression') {
        if (n.childForFieldName('constructor')?.text === 'BrowserWindow') {
          const w = { line: line(n), col: col(n), preload: null, preferences: [] };
          const arg = n.childForFieldName('arguments')?.namedChild(0);
          if (arg) walk(arg, (p) => {
            if (p.type !== 'pair') return;
            const k = p.childForFieldName('key')?.text; const v = p.childForFieldName('value');
            if (k === 'preload') w.preload = v?.text.slice(0, 160) || null;
            else if (PREFS.has(k) && /^(true|false)$/.test(v?.text || '')) w.preferences.push(`${k}:${v.text}`);
          });
          out.windows.push(w);
        } else if (n.childForFieldName('constructor')?.text === 'Function') out.evals.push({ line: line(n), col: col(n) });
        return;
      }
      if (n.type === 'pair') {
        const k = n.childForFieldName('key')?.text; const v = n.childForFieldName('value');
        if (PREFS.has(k) && /^(true|false)$/.test(v?.text || '') && v.text !== SAFE_PREF[k]) out.prefs.push({ flag: `${k}:${v.text}`, line: line(n), col: col(n) });
        return;
      }
      if (n.type !== 'call_expression') return;
      const fn = n.childForFieldName('function'); const args = n.childForFieldName('arguments');
      const first = args?.namedChild(0);
      if (fn?.type === 'identifier') {
        const name = fn.text;
        if (name === 'require' || name === 'import') { const s = literalOf(first); if (s) out.imports.push({ spec: s, line: line(n), col: col(n), dynamic: name === 'import' }); else if (first) out.imports.push({ spec: null, expr: first.text.slice(0, 80), line: line(n), col: col(n), dynamic: true }); return; }
        if (name === 'eval') { out.evals.push({ line: line(n), col: col(n) }); return; }
        if (PROCESS_FNS.has(name)) { const r = resolve(first, consts, imported); out.processes.push({ command: r ? r.value : null, expr: r ? null : first?.text.slice(0, 120) || null, confidence: r ? r.confidence : null, line: line(n), col: col(n) }); return; }
        if (first) out.calls.push({ name, args: args.namedChildren, line: line(n), col: col(n) });
        return;
      }
      if (fn?.type === 'import') { const s = literalOf(first); out.imports.push({ spec: s, expr: s ? undefined : first?.text.slice(0, 80), line: line(n), col: col(n), dynamic: true }); return; }
      if (fn?.type !== 'member_expression') return;
      const obj = fn.childForFieldName('object'); const method = fn.childForFieldName('property')?.text;
      if (first && method && !/(^|\.)(ipcMain|ipcRenderer|contextBridge|shell)$/.test(obj?.text || '') && !/webContents$/.test(obj?.text || '')) out.calls.push({ name: method, args: args.namedChildren, line: line(n), col: col(n), member: true });
      const objText = obj?.text || '';
      // a bundle keeps the Electron names on a namespace: `electron.ipcMain`, `_electron.ipcRenderer`, `require("electron").shell`
      const isMain = /(^|\.)ipcMain$/.test(objText), isRenderer = /(^|\.)ipcRenderer$/.test(objText);
      if (isMain && IPC_MAIN.has(method) || isRenderer && IPC_RENDERER.has(method) || method === 'send' && /webContents$/.test(objText)) {
        const r = resolve(first, consts, imported);
        const side = isMain ? 'main' : isRenderer ? 'renderer' : 'push';
        out.ipc.push({ side, via: `${side === 'push' ? 'webContents' : side === 'main' ? 'ipcMain' : 'ipcRenderer'}.${method}`, channel: r ? r.value : null, expr: r ? null : first?.text.slice(0, 80) || null, confidence: r ? r.confidence : null, line: line(n), col: col(n) });
        return;
      }
      if (/(^|\.)contextBridge$/.test(objText) && method === 'exposeInMainWorld') { const r = resolve(first, consts, imported); out.bridge.push({ key: r ? r.value : null, expr: r ? null : first?.text.slice(0, 80), line: line(n), col: col(n) }); return; }
      if (/(^|\.)shell$/.test(objText) && SHELL_FNS.has(method)) { out.shell.push({ call: `shell.${method}`, line: line(n), col: col(n) }); return; }
      if (/^(child_process|cp)$/.test(objText) && PROCESS_FNS.has(method) || PROCESS_FNS.has(method) && objText.length < 20 && /process/i.test(objText)) { const r = resolve(first, consts, imported); out.processes.push({ command: r ? r.value : null, expr: r ? null : first?.text.slice(0, 120) || null, confidence: r ? r.confidence : null, line: line(n), col: col(n) }); return; }
      if (fn.text === 'process.env' ) return;
    });
    // calls to a wrapper with a resolvable first argument are handlers (or senders), derived
    const wrapperByName = new Map([...knownWrappers.entries(), ...out.wrappers.map((w) => [w.name, w])]);
    // the wrapper's own call with its parameter is the mechanism, not an unknown channel
    const wrapperLines = new Set([...out.wrappers.map((w) => w.line)]);
    out.ipc = out.ipc.filter((c) => !(c.channel === null && wrapperLines.has(c.line)));
    out.wrapperCalls = [];
    const GENERIC = new Set(['on', 'once', 'off', 'send', 'emit', 'handle', 'invoke', 'call', 'get', 'set', 'add', 'remove']);
    for (const c of out.calls) {
      const w = wrapperByName.get(c.name); if (!w) continue;
      // through an object the receiver is unknown: a name too generic is not trusted that way
      if (c.member && (GENERIC.has(c.name) && !w.method || c.name.length < 4)) continue;
      const argNode = c.args[w.arg || 0];
      if (!argNode) continue;
      const r = resolve(argNode, consts, imported);
      if (!r && c.member) continue;
      out.wrapperCalls.push({ wrapper: w.name, side: w.side, via: w.side === 'push' ? 'webContents.send' : `wrapper ${w.name}`, channel: r ? r.value : null, expr: r ? null : argNode.text.slice(0, 80), confidence: c.member ? 'inferred' : 'derived', line: c.line, col: c.col });
    }
    delete out.calls;
    return out;
  });
}

export { prepare, ready, scan, literalOf };
