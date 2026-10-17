#!/usr/bin/env node
/**
 * ATLAS — what is inside a shipped artifact, read without running it.
 *
 * An installed application is not its repository: the code that runs is what the archive
 * holds, the database is what the file holds, the bundle maps back to sources only through
 * its map. This tool reads those files as bytes and reports what is there, with the proof
 * beside every fact (file and line, or offset), what was not covered, and how sure the
 * reading is. Nothing is executed, nothing is written, nothing leaves the machine.
 *
 *   node artifact.mjs detect <path>                       what kind of file or folder this is
 *   node artifact.mjs app    <app.asar | folder> [--all] [--detail summary|full] [--page N] [--per 60]
 *   node artifact.mjs sqlite <file.db> [--table <name>] [--limit 20]
 *   node artifact.mjs map    <file.map> [--line L --col C]
 *
 * Every command prints one record (JSON): an id derived from the record itself, the subject
 * (name, path, format, sha256, bytes), the operation and its parameters, the result, a
 * confidence (`observed` read from the bytes, `derived` computed from observed facts,
 * `inferred` a reading that could be wrong), the coverage (what was read, what was not) and
 * the limitations in words. `--text` prints the same as a short readable summary.
 *
 * The reading is for software the person owns or is allowed to inspect. The tool does not
 * decide that; the skill that calls it asks.
 */

import { createHash } from 'node:crypto';
import { closeSync, existsSync, openSync, readdirSync, readFileSync, readSync, statSync } from 'node:fs';
import { basename, dirname, extname, join, posix, resolve } from 'node:path';

const VERSION = 1;
const MAX_PARSE_BYTES = 4 * 1024 * 1024;   // one source file larger than this is listed, not scanned
const NOISE_DIRS = new Set(['node_modules', '.git', 'dist/wasm']);

// ---------------------------------------------------------------- arguments and output

const argv = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) { flags[a.slice(2)] = next; i += 1; } else flags[a.slice(2)] = true;
  } else positional.push(a);
}
const [command, target] = positional;

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const fileSha = (path) => sha256(readFileSync(path));

function record(subject, operation, params, result, extra) {
  const rec = { tool: { name: 'atlas-artifact', version: VERSION }, subject, operation, params, confidence: 'observed', coverage: { status: 'complete', scope: '' }, limitations: [], ...extra, result };
  rec.id = 'ev_' + sha256(JSON.stringify({ subject, operation, params, result })).slice(0, 24);
  return rec;
}

function emit(rec, text) {
  if (flags.text && text) process.stdout.write(text.trimEnd() + '\n');
  else process.stdout.write(JSON.stringify(rec, null, flags.compact ? 0 : 2) + '\n');
}

function fail(message, code) {
  process.stdout.write(JSON.stringify({ error: { code: code || 'usage', message } }) + '\n');
  process.exit(2);
}

// ---------------------------------------------------------------- detect

const MAGIC = [
  ['sqlite', (b) => b.subarray(0, 16).toString('latin1') === 'SQLite format 3\0'],
  ['pe', (b) => b[0] === 0x4d && b[1] === 0x5a],
  ['elf', (b) => b[0] === 0x7f && b.subarray(1, 4).toString('latin1') === 'ELF'],
  ['mach-o', (b) => [0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(b.readUInt32BE(0))],
  ['zip', (b) => b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5 || b[2] === 7)],
  ['wasm', (b) => b.readUInt32LE(0) === 0x6d736100],
  ['gzip', (b) => b[0] === 0x1f && b[1] === 0x8b],
  ['pdf', (b) => b.subarray(0, 5).toString('latin1') === '%PDF-'],
];

function detectFile(path) {
  const fd = openSync(path, 'r');
  const head = Buffer.alloc(32);
  const n = readSync(fd, head, 0, 32, 0);
  closeSync(fd);
  const b = head.subarray(0, n);
  if (n >= 16 && asarHeader(path, true)) return 'asar';
  if (n >= 4) for (const [name, test] of MAGIC) { try { if (test(b)) return name; } catch { /* short */ } }
  const ext = extname(path).toLowerCase();
  if (ext === '.map') { try { const j = JSON.parse(readFileSync(path, 'utf8')); if (j.mappings !== undefined) return 'source-map'; } catch { /* not a map */ } }
  if (['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx'].includes(ext)) return 'javascript';
  if (ext === '.json') return 'json';
  if (ext === '.html' || ext === '.htm') return 'html';
  return 'unknown';
}

function detectDir(path) {
  if (existsSync(join(path, 'package.json'))) {
    try {
      const pkg = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      if (deps.electron || existsSync(join(path, 'node_modules', 'electron'))) return 'electron-app';
      return 'node-app';
    } catch { return 'directory'; }
  }
  if (existsSync(join(path, 'resources', 'app.asar'))) return 'electron-install';
  return 'directory';
}

// ---------------------------------------------------------------- a virtual file system: a folder or an asar

/** The asar header: 8 bytes of sizes, 8 more, then the JSON tree; data follows the header. */
function asarHeader(path, probe) {
  const fd = openSync(path, 'r');
  try {
    const h = Buffer.alloc(16);
    if (readSync(fd, h, 0, 16, 0) < 16) return null;
    const headerSize = h.readUInt32LE(4);
    const jsonLength = h.readUInt32LE(12);
    if (h.readUInt32LE(0) !== 4 || jsonLength > headerSize || jsonLength > 256 * 1024 * 1024) return null;
    if (probe) { const j = Buffer.alloc(Math.min(jsonLength, 16)); readSync(fd, j, 0, j.length, 16); return j.toString('utf8').trimStart().startsWith('{') ? {} : null; }
    const j = Buffer.alloc(jsonLength);
    readSync(fd, j, 0, jsonLength, 16);
    return { tree: JSON.parse(j.toString('utf8')), dataStart: 8 + headerSize };
  } catch { return null; } finally { closeSync(fd); }
}

function openAsar(path) {
  const header = asarHeader(path, false);
  if (!header) return null;
  const files = new Map(); // posix path → { size, offset, unpacked }
  const walk = (node, prefix) => {
    for (const [name, v] of Object.entries(node.files || {})) {
      if (v.files) walk(v, prefix + name + '/');
      else files.set(prefix + name, { size: v.size, offset: v.offset === undefined ? null : Number(v.offset), unpacked: Boolean(v.unpacked), link: v.link || null });
    }
  };
  walk(header.tree, '');
  const unpackedRoot = path + '.unpacked';
  const fd = openSync(path, 'r');
  return {
    kind: 'asar',
    root: path,
    list: () => [...files.entries()].map(([p, m]) => ({ path: p, size: m.size, unpacked: m.unpacked })),
    read(p) {
      const m = files.get(p);
      if (!m) return null;
      if (m.unpacked) { const real = join(unpackedRoot, ...p.split('/')); return existsSync(real) ? readFileSync(real) : null; }
      if (m.offset === null) return null;
      const b = Buffer.alloc(m.size);
      readSync(fd, b, 0, m.size, header.dataStart + m.offset);
      return b;
    },
    has: (p) => files.has(p),
    close: () => closeSync(fd),
  };
}

function openDir(root) {
  const files = [];
  const walk = (dir, prefix) => {
    let entries = [];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const rel = prefix + e.name;
      if (e.isDirectory()) { if (e.name === '.git') continue; walk(join(dir, e.name), rel + '/'); } else if (e.isFile()) {
        let size = 0; try { size = statSync(join(dir, e.name)).size; } catch { /* unreadable */ }
        files.push({ path: rel, size, unpacked: false });
      }
    }
  };
  walk(root, '');
  return {
    kind: 'directory',
    root,
    list: () => files,
    read: (p) => { try { return readFileSync(join(root, ...p.split('/'))); } catch { return null; } },
    has: (p) => existsSync(join(root, ...p.split('/'))),
    close: () => {},
  };
}

function openSubject(path) {
  const st = statSync(path);
  if (st.isDirectory()) {
    const nested = join(path, 'resources', 'app.asar');
    if (existsSync(nested)) return openAsar(nested);
    const inner = join(path, 'resources', 'app');
    if (existsSync(join(inner, 'package.json'))) return openDir(inner);
    return openDir(path);
  }
  return detectFile(path) === 'asar' ? openAsar(path) : null;
}

// ---------------------------------------------------------------- app: what an Electron or Node application holds

const JS_EXT = new Set(['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx']);
const RE = {
  ipcMain: /\bipcMain\s*\.\s*(on|once|handle|handleOnce|removeHandler)\s*\(\s*(['"`])([^'"`\n]{1,120})\2/g,
  ipcRenderer: /\bipcRenderer\s*\.\s*(on|once|invoke|send|sendSync|postMessage|sendTo)\s*\(\s*(['"`])([^'"`\n]{1,120})\2/g,
  webContentsSend: /\bwebContents\s*\.\s*send\s*\(\s*(['"`])([^'"`\n]{1,120})\1/g,
  ipcDynamic: /\b(?:ipcMain|ipcRenderer)\s*\.\s*(?:on|once|handle|invoke|send|sendSync)\s*\(\s*(?![\s'"`])/g,
  bridge: /\bcontextBridge\s*\.\s*exposeInMainWorld\s*\(\s*(['"`])([^'"`\n]{1,80})\1/g,
  window: /new\s+BrowserWindow\s*\(/g,
  preload: /\bpreload\s*:\s*([^,\n}]{1,200})/g,
  pref: /\b(nodeIntegration|contextIsolation|sandbox|webSecurity|allowRunningInsecureContent|nodeIntegrationInWorker|enableRemoteModule)\s*:\s*(true|false)/g,
  url: /\b(?:https?|wss?):\/\/[A-Za-z0-9][A-Za-z0-9.-]*(?::\d+)?(?:\/[^\s'"`<>)\]},]*)?/g,
  child: /\b(?:spawn|exec|execFile|execSync|spawnSync|execFileSync|fork)\s*\(\s*(['"`])([^'"`\n]{1,160})\1/g,
  childAny: /\b(?:spawn|exec|execFile|execSync|spawnSync|execFileSync|fork)\s*\(/g,
  shell: /\bshell\s*\.\s*(openExternal|openPath|trashItem|showItemInFolder)\s*\(/g,
  powers: /\b(app\.setLoginItemSettings|autoUpdater\.|protocol\.register\w+|session\.defaultSession|setAsDefaultProtocolClient|globalShortcut\.register|desktopCapturer|systemPreferences|screen\.getAllDisplays|clipboard\.(?:read|write)\w*)/g,
  requires: /\brequire\s*\(\s*(['"`])([^'"`\n]{1,200})\1\s*\)|\bfrom\s+(['"`])([^'"`\n]{1,200})\3|\bimport\s*\(\s*(['"`])([^'"`\n]{1,200})\5\s*\)/g,
  eval: /\b(?:eval|new\s+Function)\s*\(/g,
  envSecret: /process\.env\.([A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS)[A-Z0-9_]*)/g,
  scriptSrc: /<script[^>]*\ssrc\s*=\s*(['"])([^'"]+)\1/gi,
};

const lineOf = (text, index) => { let n = 1; for (let i = 0; i < index; i += 1) if (text.charCodeAt(i) === 10) n += 1; return n; };

/** Line numbers computed once per file, then looked up per match. */
function lineIndex(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return (index) => { let lo = 0, hi = starts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= index) lo = mid; else hi = mid - 1; } return lo + 1; };
}

function resolveModule(fs, fromPath, spec, known) {
  if (!spec.startsWith('.') && !spec.startsWith('/')) return { kind: spec.startsWith('node:') || BUILTINS.has(spec.split('/')[0]) ? 'builtin' : 'package', name: spec.split('/')[0].startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0] };
  const base = posix.normalize(posix.join(posix.dirname(fromPath), spec));
  const candidates = [base, ...['.js', '.cjs', '.mjs', '.ts', '.tsx', '.jsx', '.json', '.node'].map((e) => base + e), ...['index.js', 'index.cjs', 'index.mjs', 'index.ts'].map((i) => posix.join(base, i))];
  for (const c of candidates) if (known.has(c)) return { kind: 'file', path: c };
  return { kind: 'missing', path: base };
}

const BUILTINS = new Set(['fs', 'path', 'os', 'crypto', 'child_process', 'http', 'https', 'net', 'url', 'util', 'stream', 'events', 'zlib', 'buffer', 'process', 'worker_threads', 'module', 'assert', 'readline', 'tls', 'dns', 'dgram', 'cluster', 'vm', 'electron', 'sqlite', 'timers', 'string_decoder', 'querystring', 'perf_hooks', 'async_hooks', 'tty', 'v8', 'inspector']);

function analyzeApp(fs, opts) {
  const all = fs.list();
  const known = new Set(all.map((f) => f.path));
  const pkgRaw = fs.read('package.json');
  let pkg = {};
  try { pkg = pkgRaw ? JSON.parse(pkgRaw.toString('utf8')) : {}; } catch { /* no package */ }
  const entry = typeof pkg.main === 'string' ? posix.normalize(pkg.main) : null;
  const inScope = (p) => opts.all || !p.split('/').some((seg) => NOISE_DIRS.has(seg));
  const sources = all.filter((f) => JS_EXT.has(posix.extname(f.path).toLowerCase()) && inScope(f.path));
  const html = all.filter((f) => /\.html?$/i.test(f.path) && inScope(f.path));
  const limitations = [];
  const out = {
    name: pkg.productName || pkg.name || basename(fs.root), version: pkg.version || null, entry,
    electron: pkg.devDependencies?.electron || pkg.dependencies?.electron || null,
    files: { total: all.length, bytes: all.reduce((s, f) => s + f.size, 0), sources: sources.length, html: html.length, unpacked: all.filter((f) => f.unpacked).length },
    nativeAddons: all.filter((f) => f.path.endsWith('.node')).map((f) => f.path),
    packages: {}, modules: [], edges: [], ipc: { handlers: [], senders: [], dynamic: [] }, bridge: [], windows: [], preferences: [], urls: {}, processes: [], shell: [], powers: [], eval: [], envSecrets: [], renderers: [],
  };
  const urlSeen = new Map();
  const texts = new Map();
  let bytesScanned = 0, skipped = 0, minified = 0;
  for (const f of sources) {
    const buf = fs.read(f.path);
    if (!buf) { skipped += 1; continue; }
    if (buf.length > MAX_PARSE_BYTES) { skipped += 1; out.modules.push({ path: f.path, bytes: buf.length, scanned: false }); continue; }
    const text = buf.toString('utf8');
    texts.set(f.path, text);
    bytesScanned += buf.length;
    const lines = text.split('\n').length;
    const isMin = buf.length > 50 * 1024 && buf.length / lines > 400;
    if (isMin) minified += 1;
    const at = lineIndex(text);
    const mod = { path: f.path, bytes: buf.length, lines, minified: isMin, scanned: true, imports: 0 };
    for (const m of text.matchAll(RE.requires)) {
      const spec = m[2] || m[4] || m[6];
      if (!spec) continue;
      const r = resolveModule(fs, f.path, spec, known);
      mod.imports += 1;
      if (r.kind === 'package' || r.kind === 'builtin') out.packages[r.name] = (out.packages[r.name] || 0) + 1;
      else out.edges.push({ from: f.path, to: r.path, line: at(m.index), missing: r.kind === 'missing' });
    }
    for (const m of text.matchAll(RE.ipcMain)) out.ipc.handlers.push({ channel: m[3], via: 'ipcMain.' + m[1], file: f.path, line: at(m.index) });
    for (const m of text.matchAll(RE.ipcRenderer)) out.ipc.senders.push({ channel: m[3], via: 'ipcRenderer.' + m[1], file: f.path, line: at(m.index) });
    for (const m of text.matchAll(RE.webContentsSend)) out.ipc.senders.push({ channel: m[2], via: 'webContents.send', file: f.path, line: at(m.index) });
    for (const m of text.matchAll(RE.ipcDynamic)) out.ipc.dynamic.push({ file: f.path, line: at(m.index), index: m.index });
    for (const m of text.matchAll(RE.bridge)) out.bridge.push({ key: m[2], file: f.path, line: at(m.index) });
    for (const m of text.matchAll(RE.window)) {
      const block = text.slice(m.index, m.index + 2500);
      const preload = RE.preload.exec(block); RE.preload.lastIndex = 0;
      const prefs = [...block.matchAll(RE.pref)].map((p) => `${p[1]}:${p[2]}`);
      out.windows.push({ file: f.path, line: at(m.index), preload: preload ? preload[1].trim().slice(0, 160) : null, preferences: prefs });
    }
    for (const m of text.matchAll(RE.pref)) if (m[2] === (m[1] === 'contextIsolation' || m[1] === 'webSecurity' || m[1] === 'sandbox' ? 'false' : 'true')) out.preferences.push({ flag: `${m[1]}:${m[2]}`, file: f.path, line: at(m.index) });
    for (const m of text.matchAll(RE.url)) {
      const u = m[0].replace(/[.,;:]+$/, '');
      let host; try { host = new URL(u).host; } catch { continue; }
      if (!host || /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/.test(host) && !opts.all) { urlSeen.set('local:' + host, (urlSeen.get('local:' + host) || 0) + 1); continue; }
      const key = host;
      const cur = urlSeen.get(key) || { count: 0, first: { file: f.path, line: at(m.index) }, examples: new Set() };
      cur.count += 1; if (cur.examples.size < 3) cur.examples.add(u.slice(0, 120));
      urlSeen.set(key, cur);
    }
    for (const m of text.matchAll(RE.child)) out.processes.push({ command: m[2], file: f.path, line: at(m.index) });
    const childCount = [...text.matchAll(RE.childAny)].length;
    if (childCount) mod.spawns = childCount;
    for (const m of text.matchAll(RE.shell)) out.shell.push({ call: 'shell.' + m[1], file: f.path, line: at(m.index) });
    for (const m of text.matchAll(RE.powers)) out.powers.push({ api: m[1], file: f.path, line: at(m.index) });
    for (const m of text.matchAll(RE.eval)) out.eval.push({ file: f.path, line: at(m.index) });
    for (const m of text.matchAll(RE.envSecret)) out.envSecrets.push({ name: m[1], file: f.path, line: at(m.index) });
    out.modules.push(mod);
  }
  for (const f of html) {
    const text = fs.read(f.path)?.toString('utf8') || '';
    const scripts = [...text.matchAll(RE.scriptSrc)].map((m) => m[2]);
    out.renderers.push({ path: f.path, scripts });
  }
  // handlers registered through the app's own wrapper: a function whose body calls
  // ipcMain.handle/on with a variable is the wrapper; every call to it with a string
  // literal is a handler, read as derived, not observed
  const wrappers = new Set();
  for (const d of out.ipc.dynamic) {
    const text = texts.get(d.file);
    if (!text) continue;
    const idx = d.index;
    const before = text.slice(Math.max(0, idx - 600), idx);
    const m = [...before.matchAll(/(?:function\s+([A-Za-z_$][\w$]*)\s*\(|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>|([A-Za-z_$][\w$]*)\s*[:=]\s*(?:async\s*)?function\s*\()/g)].pop();
    const name = m && (m[1] || m[2] || m[3]);
    if (name && !['function', 'if', 'for', 'while'].includes(name)) wrappers.add(name);
  }
  out.ipc.wrappers = [...wrappers];
  if (wrappers.size) {
    const re = new RegExp(`(?<![\\w$.])(${[...wrappers].join('|')})\\s*\\(\\s*(['"\`])([^'"\`\\n]{1,120})\\2`, 'g');
    for (const [path, text] of texts) {
      const at = lineIndex(text);
      for (const m of text.matchAll(re)) out.ipc.handlers.push({ channel: m[3], via: `wrapper ${m[1]}`, file: path, line: at(m.index), confidence: 'derived' });
    }
  }
  out.urls = Object.fromEntries([...urlSeen.entries()].filter(([k]) => !k.startsWith('local:')).map(([k, v]) => [k, { count: v.count, first: v.first, examples: [...v.examples] }]));
  // reachability from the entry, over the resolved edges
  const reach = new Set();
  if (entry && known.has(entry)) {
    const stack = [entry];
    const byFrom = new Map();
    for (const e of out.edges) { if (!byFrom.has(e.from)) byFrom.set(e.from, []); byFrom.get(e.from).push(e.to); }
    while (stack.length) { const p = stack.pop(); if (reach.has(p)) continue; reach.add(p); for (const t of byFrom.get(p) || []) stack.push(t); }
  }
  for (const m of out.modules) m.reachedFromEntry = entry ? reach.has(m.path) : null;
  // the pairing, in both directions: what a renderer sends must be handled in main, what
  // main pushes must be listened for in a renderer
  const handled = new Set(out.ipc.handlers.map((h) => h.channel));
  const toMain = new Set(out.ipc.senders.filter((s) => /^ipcRenderer\.(invoke|send|sendSync|postMessage|sendTo)$/.test(s.via)).map((s) => s.channel));
  const listened = new Set(out.ipc.senders.filter((s) => /^ipcRenderer\.(on|once)$/.test(s.via)).map((s) => s.channel));
  const pushed = new Set(out.ipc.senders.filter((s) => s.via === 'webContents.send').map((s) => s.channel));
  out.ipc.sentNeverHandled = [...toMain].filter((c) => !handled.has(c));
  out.ipc.handledNeverSent = [...handled].filter((c) => !toMain.has(c));
  out.ipc.pushedNeverListened = [...pushed].filter((c) => !listened.has(c));
  out.ipc.listenedNeverPushed = [...listened].filter((c) => !pushed.has(c));
  out.ipc.channels = new Set([...handled, ...toMain, ...listened, ...pushed]).size;
  if (!entry) limitations.push('no `main` in package.json: reachability from the entry not computed');
  if (!opts.all) limitations.push('node_modules listed and counted, not scanned (--all scans them)');
  if (skipped) limitations.push(`${skipped} source file(s) not scanned (unreadable or above ${MAX_PARSE_BYTES / 1024 / 1024} MB)`);
  if (minified) limitations.push(`${minified} file(s) look minified or bundled: names inside them are the bundler's, imports are what the bundle kept`);
  if (out.ipc.dynamic.length) limitations.push(`${out.ipc.dynamic.length} IPC call(s) with a channel that is not a string literal${out.ipc.wrappers.length ? `; ${out.ipc.wrappers.length} of them read as a wrapper (${out.ipc.wrappers.join(', ')}) and its callers counted as handlers, derived not observed` : ': channel unknown'}`);
  limitations.push('read as text with patterns, not executed: a call built at run time, a string assembled from parts, or code loaded from outside the archive is not seen');
  const coverage = { status: skipped || out.ipc.dynamic.length ? 'partial' : 'complete', scope: `${sources.length} source files and ${html.length} html files ${opts.all ? 'including' : 'outside'} node_modules, ${(bytesScanned / 1024 / 1024).toFixed(1)} MB scanned` };
  return { out, limitations, coverage };
}

function appText(rec) {
  const r = rec.result;
  const L = [];
  L.push(`${r.name} ${r.version || ''}  ${rec.subject.format}  ${(rec.subject.bytes / 1024 / 1024).toFixed(1)} MB  entry ${r.entry || '?'}  electron ${r.electron || '?'}`);
  L.push(`files ${r.files.total} (${r.files.sources} sources, ${r.files.html} html, ${r.files.unpacked} unpacked)  native addons ${r.nativeAddons.length}  packages used ${Object.keys(r.packages).length}`);
  const mods = r.modules.filter((m) => m.scanned);
  L.push(`modules ${mods.length}, reached from entry ${mods.filter((m) => m.reachedFromEntry).length}, minified ${mods.filter((m) => m.minified).length}`);
  L.push(`ipc: ${r.ipc.handlers.length} handlers, ${r.ipc.senders.length} senders/listeners, ${r.ipc.channels} channels; renderer→main never handled ${r.ipc.sentNeverHandled.length}, handled never sent ${r.ipc.handledNeverSent.length}, main→renderer never listened ${r.ipc.pushedNeverListened.length}, listened never pushed ${r.ipc.listenedNeverPushed.length}, dynamic ${r.ipc.dynamic.length}`);
  L.push(`bridge keys ${r.bridge.map((b) => b.key).join(', ') || '-'}`);
  for (const w of r.windows) L.push(`window ${w.file}:${w.line}  preload ${w.preload || '-'}  ${w.preferences.join(' ') || ''}`);
  for (const p of r.preferences) L.push(`weak preference ${p.flag}  ${p.file}:${p.line}`);
  const hosts = Object.entries(r.urls).sort((a, b) => b[1].count - a[1].count);
  L.push(`hosts ${hosts.length}: ${hosts.slice(0, 12).map(([h, v]) => `${h} (${v.count})`).join(', ')}`);
  if (r.processes.length) L.push(`processes: ${r.processes.slice(0, 8).map((p) => `${p.command} @ ${p.file}:${p.line}`).join('; ')}`);
  if (r.shell.length) L.push(`shell: ${r.shell.map((s) => `${s.call} @ ${s.file}:${s.line}`).join('; ')}`);
  if (r.powers.length) L.push(`powers: ${[...new Set(r.powers.map((p) => p.api))].join(', ')}`);
  if (r.eval.length) L.push(`eval/new Function: ${r.eval.map((e) => `${e.file}:${e.line}`).join(', ')}`);
  if (r.envSecrets.length) L.push(`env secrets read: ${[...new Set(r.envSecrets.map((e) => e.name))].join(', ')}`);
  L.push(`coverage ${rec.coverage.status}: ${rec.coverage.scope}`);
  for (const l of rec.limitations) L.push(`limit  ${l}`);
  L.push(`id ${rec.id}`);
  return L.join('\n');
}

function page(list, n, per) { const start = (n - 1) * per; return { page: n, per, total: list.length, items: list.slice(start, start + per) }; }

function cmdApp(path) {
  const abs = resolve(path);
  if (!existsSync(abs)) fail(`not found: ${abs}`, 'not_found');
  const fs = openSubject(abs);
  if (!fs) fail(`not an application archive or folder: ${abs}`, 'unsupported');
  const detail = flags.detail || 'summary';
  const { out, limitations, coverage } = analyzeApp(fs, { all: Boolean(flags.all) });
  fs.close();
  const st = statSync(fs.root);
  const subject = { name: basename(fs.root), path: fs.root, format: fs.kind === 'asar' ? 'asar' : detectDir(fs.root), bytes: st.isDirectory() ? out.files.bytes : st.size, sha256: st.isDirectory() ? null : fileSha(fs.root) };
  let result = out;
  if (detail === 'summary') {
    const per = Number(flags.per || 60), n = Number(flags.page || 1);
    result = { ...out, modules: page(out.modules.filter((m) => m.scanned).sort((a, b) => b.bytes - a.bytes), n, per), edges: { total: out.edges.length, missing: out.edges.filter((e) => e.missing).length }, ipc: { ...out.ipc, handlers: page(out.ipc.handlers, n, per), senders: page(out.ipc.senders, n, per) } };
  }
  const rec = record(subject, 'app', { all: Boolean(flags.all), detail }, result, { limitations, coverage, confidence: 'observed' });
  emit(rec, appText({ ...rec, result: out }));
}

// ---------------------------------------------------------------- sqlite

async function cmdSqlite(path) {
  const abs = resolve(path);
  if (!existsSync(abs)) fail(`not found: ${abs}`, 'not_found');
  let sqlite;
  try { sqlite = await import('node:sqlite'); } catch { fail('node:sqlite is not available in this Node (needs 22.13 or newer)', 'unsupported'); }
  const limit = Math.max(1, Math.min(500, Number(flags.limit || 20)));
  const limitations = ['opened read-only on a copy of nothing: the live file is read; a writer holding a lock makes the read fail instead of waiting'];
  let db;
  try { db = new sqlite.DatabaseSync(abs, { readOnly: true }); } catch (e) { fail(`cannot open: ${e.message}`, 'unreadable'); }
  const objects = db.prepare("select type, name, tbl_name, sql from sqlite_master where name not like 'sqlite_%' order by type, name").all();
  const tables = [];
  for (const o of objects.filter((x) => x.type === 'table')) {
    const cols = db.prepare(`pragma table_info("${o.name.replace(/"/g, '""')}")`).all().map((c) => ({ name: c.name, type: c.type, pk: Boolean(c.pk), notnull: Boolean(c.notnull) }));
    let rows = null;
    try { rows = db.prepare(`select count(*) as n from "${o.name.replace(/"/g, '""')}"`).get().n; } catch { /* virtual or broken */ }
    tables.push({ name: o.name, columns: cols, rows });
  }
  const result = { pageSize: db.prepare('pragma page_size').get().page_size, pages: db.prepare('pragma page_count').get().page_count, journal: db.prepare('pragma journal_mode').get().journal_mode, userVersion: db.prepare('pragma user_version').get().user_version, tables, indexes: objects.filter((x) => x.type === 'index').map((x) => ({ name: x.name, table: x.tbl_name })), views: objects.filter((x) => x.type === 'view').map((x) => x.name), triggers: objects.filter((x) => x.type === 'trigger').map((x) => ({ name: x.name, table: x.tbl_name })) };
  if (flags.table) {
    const t = tables.find((x) => x.name === flags.table);
    if (!t) fail(`no table ${flags.table}`, 'not_found');
    const rows = db.prepare(`select * from "${t.name.replace(/"/g, '""')}" limit ${limit}`).all();
    result.sample = { table: t.name, limit, rows: rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'string' && v.length > 200 ? v.slice(0, 200) + `… (${v.length} chars)` : v instanceof Uint8Array ? `<${v.length} bytes>` : typeof v === 'bigint' ? Number(v) : v]))) };
    limitations.push(`sample is the first ${limit} rows in storage order, not a random sample; strings cut at 200 characters, blobs shown as sizes`);
  }
  db.close();
  const subject = { name: basename(abs), path: abs, format: 'sqlite', bytes: statSync(abs).size, sha256: fileSha(abs) };
  const rec = record(subject, 'sqlite', { table: flags.table || null, limit }, result, { limitations, coverage: { status: 'complete', scope: `${tables.length} tables, schema and row counts; rows only for the table asked` } });
  const L = [`${subject.name}  ${(subject.bytes / 1024).toFixed(0)} KB  journal ${result.journal}  user_version ${result.userVersion}`];
  for (const t of tables) L.push(`${t.name}  ${t.rows === null ? '?' : t.rows} rows  ${t.columns.map((c) => c.name + (c.pk ? '*' : '')).join(', ')}`);
  if (result.sample) L.push(JSON.stringify(result.sample.rows, null, 0).slice(0, 4000));
  L.push(`id ${rec.id}`);
  emit(rec, L.join('\n'));
}

// ---------------------------------------------------------------- source map

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function decodeVlq(seg) {
  const out = []; let value = 0, shift = 0;
  for (const ch of seg) {
    const d = B64.indexOf(ch); if (d < 0) throw new Error('bad VLQ');
    value += (d & 31) << shift;
    if (d & 32) shift += 5; else { out.push(value & 1 ? -(value >> 1) : value >> 1); value = 0; shift = 0; }
  }
  return out;
}

function decodeMappings(mappings) {
  const lines = []; let src = 0, oline = 0, ocol = 0, name = 0, segments = 0;
  for (const line of mappings.split(';')) {
    const row = []; let gcol = 0;
    if (line) for (const seg of line.split(',')) {
      if (!seg) continue;
      const v = decodeVlq(seg); gcol += v[0];
      const e = { gcol };
      if (v.length >= 4) { src += v[1]; oline += v[2]; ocol += v[3]; e.src = src; e.oline = oline; e.ocol = ocol; if (v.length >= 5) { name += v[4]; e.name = name; } }
      row.push(e); segments += 1;
    }
    lines.push(row);
  }
  return { lines, segments };
}

function cmdMap(path) {
  const abs = resolve(path);
  if (!existsSync(abs)) fail(`not found: ${abs}`, 'not_found');
  let map;
  try { map = JSON.parse(readFileSync(abs, 'utf8')); } catch { fail('not a JSON source map', 'unsupported'); }
  if (typeof map.mappings !== 'string') fail('no `mappings` string: sectioned maps are not read', 'unsupported');
  const { lines, segments } = decodeMappings(map.mappings);
  const withContent = Array.isArray(map.sourcesContent) ? map.sourcesContent.filter((s) => typeof s === 'string').length : 0;
  const perSource = new Map();
  for (const row of lines) for (const e of row) if (e.src !== undefined) perSource.set(e.src, (perSource.get(e.src) || 0) + 1);
  const result = {
    version: map.version, file: map.file || null, sourceRoot: map.sourceRoot || null, generatedLines: lines.length, segments,
    sources: (map.sources || []).map((s, i) => ({ path: s, segments: perSource.get(i) || 0, content: Array.isArray(map.sourcesContent) && typeof map.sourcesContent[i] === 'string' })),
    names: (map.names || []).length, sourcesWithContent: withContent,
  };
  const limitations = ['a map is the bundler\'s claim about where code came from; nothing here checks it against the bundle'];
  if (!withContent) limitations.push('no sourcesContent: original text is not in the map, only paths');
  if (flags.line) {
    const gl = Number(flags.line), gc = Number(flags.col || 0);
    const row = lines[gl - 1] || [];
    let best = null;
    for (const e of row) if (e.gcol <= gc && (!best || e.gcol > best.gcol)) best = e;
    result.lookup = best && best.src !== undefined ? { generated: { line: gl, col: gc }, original: { source: map.sources[best.src], line: best.oline + 1, col: best.ocol, name: best.name !== undefined ? map.names[best.name] : null } } : { generated: { line: gl, col: gc }, original: null };
  }
  const subject = { name: basename(abs), path: abs, format: 'source-map', bytes: statSync(abs).size, sha256: fileSha(abs) };
  const rec = record(subject, 'map', { line: flags.line ? Number(flags.line) : null, col: flags.col ? Number(flags.col) : null }, result, { limitations, coverage: { status: 'complete', scope: 'the whole mappings string decoded' } });
  const L = [`${subject.name}  v${result.version}  ${result.sources.length} sources (${withContent} with content)  ${result.generatedLines} generated lines  ${segments} segments  ${result.names} names`];
  for (const s of result.sources.slice(0, 40)) L.push(`${String(s.segments).padStart(7)}  ${s.path}${s.content ? '' : '  (no content)'}`);
  if (result.lookup) L.push(`lookup ${JSON.stringify(result.lookup)}`);
  L.push(`id ${rec.id}`);
  emit(rec, L.join('\n'));
}

// ---------------------------------------------------------------- detect

function cmdDetect(path) {
  const abs = resolve(path);
  if (!existsSync(abs)) fail(`not found: ${abs}`, 'not_found');
  const st = statSync(abs);
  const format = st.isDirectory() ? detectDir(abs) : detectFile(abs);
  const next = { asar: 'app', 'electron-app': 'app', 'electron-install': 'app', 'node-app': 'app', sqlite: 'sqlite', 'source-map': 'map' }[format] || null;
  const subject = { name: basename(abs), path: abs, format, bytes: st.isDirectory() ? null : st.size, sha256: st.isDirectory() ? null : fileSha(abs) };
  const rec = record(subject, 'detect', {}, { format, next: next ? `node artifact.mjs ${next} "${abs}"` : null }, { coverage: { status: 'complete', scope: st.isDirectory() ? 'folder name and package.json' : 'the first 32 bytes and the extension' }, limitations: st.isDirectory() ? [] : ['a format is read from its magic bytes; a file with a wrong header is reported as unknown'] });
  emit(rec, `${format}  ${abs}${next ? `\nnext  ${rec.result.next}` : ''}`);
}

// ---------------------------------------------------------------- main

if (!command || !target || flags.help) {
  process.stdout.write('usage: node artifact.mjs detect|app|sqlite|map <path> [--text] [--all] [--detail summary|full] [--page N --per 60] [--table T --limit 20] [--line L --col C]\n');
  process.exit(command ? 2 : 0);
}
try {
  if (command === 'detect') cmdDetect(target);
  else if (command === 'app') cmdApp(target);
  else if (command === 'sqlite') await cmdSqlite(target);
  else if (command === 'map') cmdMap(target);
  else fail(`unknown command: ${command}`);
} catch (e) {
  fail(e && e.message ? e.message : String(e), 'internal');
}
