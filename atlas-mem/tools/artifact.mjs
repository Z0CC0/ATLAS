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
 *   node artifact.mjs bin    <file.exe | .dll | ELF | Mach-O> [--detail full]   headers, imports, exports, .NET, Go, Rust, strings
 *   node artifact.mjs fuses  <app.exe | installed folder>        the build-time switches of an Electron executable
 *   node artifact.mjs compare <app A> <app B> [--all]          what changed between two versions, by name
 *   node artifact.mjs observe <installed folder | exe> --yes [--seconds 12] [--args "..."]   the program alive for a few seconds: real IPC channels, windows, network, console; only with the person's yes
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
import * as js from './artifact-js.mjs';
import { readBinary } from './artifact-bin.mjs';
import { format as cilFormat } from './artifact-cil.mjs';
import { disasm as x86disasm } from './artifact-x86.mjs';
import { observe } from './artifact-run.mjs';

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

async function analyzeApp(fs, opts) {
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
    packages: {}, modules: [], edges: [], ipc: { handlers: [], senders: [], dynamic: [], wrappers: [] }, bridge: [], windows: [], preferences: [], urls: {}, processes: [], shell: [], powers: [], eval: [], envSecrets: [], renderers: [],
    reader: 'text', bundles: [], maps: 0, fuses: null,
  };
  const urlSeen = new Map();
  const texts = new Map();
  let bytesScanned = 0, skipped = 0, minified = 0, broken = 0, maps = 0;
  const bundles = [];
  for (const f of sources) {
    const buf = fs.read(f.path);
    if (!buf) { skipped += 1; continue; }
    if (buf.length > MAX_PARSE_BYTES) { skipped += 1; out.modules.push({ path: f.path, bytes: buf.length, scanned: false }); continue; }
    texts.set(f.path, buf.toString('utf8'));
    bytesScanned += buf.length;
  }
  const noteUrl = (u, file, line, module, origin) => {
    let host; try { host = new URL(u).host; } catch { return; }
    if (!host || /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/.test(host) && !opts.all) return;
    const cur = urlSeen.get(host) || { count: 0, first: { file, line, ...(module ? { module } : {}), ...(origin ? { origin } : {}) }, examples: new Set() };
    cur.count += 1; if (cur.examples.size < 3) cur.examples.add(u.slice(0, 120));
    urlSeen.set(host, cur);
  };
  const noteImport = (file, spec, line) => {
    const r = resolveModule(fs, file, spec, known);
    if (r.kind === 'package' || r.kind === 'builtin') out.packages[r.name] = (out.packages[r.name] || 0) + 1;
    else out.edges.push({ from: file, to: r.path, line, missing: r.kind === 'missing' });
  };

  // ---- the real parse, when the grammars are here
  await js.prepare([...texts.keys()]);
  const parsed = [...texts.keys()].some((p) => js.ready(p));
  if (parsed && !opts.text_only) {
    out.reader = 'parse';
    // pass one: every file alone, to learn what each exports and which functions wrap ipc
    const first = new Map();
    for (const [path, text] of texts) { const r = js.ready(path) ? js.scan(text, path) : null; if (r) first.set(path, r); }
    const wrappers = new Map();
    for (const [path, r] of first) for (const w of r.wrappers) wrappers.set(w.name, { ...w, file: path });
    // pass two: with the constants a file imports from the files it names
    for (const f of sources) {
      const text = texts.get(f.path); if (text === undefined) continue;
      const lines = text.split('\n').length;
      const isMin = text.length > 50 * 1024 && text.length / lines > 400;
      if (isMin) minified += 1;
      const mod = { path: f.path, bytes: Buffer.byteLength(text), lines, minified: isMin, scanned: true, imports: 0 };
      const pre = first.get(f.path);
      let r = pre;
      if (pre) {
        const imported = { scalars: new Map(), objects: new Map() };
        for (const b of pre.bindings) {
          const target = resolveModule(fs, f.path, b.spec, known);
          const ex = target.kind === 'file' ? first.get(target.path)?.constants.exported : null;
          if (!ex) continue;
          if (b.whole) { imported.objects.set(b.whole, ex.scalars); for (const [k, v] of ex.objects) imported.objects.set(`${b.whole}.${k}`, v); }
          for (const n of b.names) { if (ex.scalars.has(n.imported)) imported.scalars.set(n.local, ex.scalars.get(n.imported)); if (ex.objects.has(n.imported)) imported.objects.set(n.local, ex.objects.get(n.imported)); }
        }
        r = js.scan(text, f.path, imported, wrappers) || pre;
      }
      if (!r) {
        // no grammar for this extension: the text patterns
        scanText(text, f.path, mod, out, noteUrl, noteImport);
        out.modules.push(mod);
        continue;
      }
      if (r.broken) broken += 1;
      // where a fact sits: the bundle module around it, and the original source when the
      // archive ships the bundle's map (the map is the bundler's claim, said in the record)
      const inside = (e) => { if (!r.bundle || e.line === undefined) return null; const after = (p, q) => p.line > q.line || (p.line === q.line && p.col >= q.col); const before = (p, q) => p.line < q.line || (p.line === q.line && p.col <= q.col); const m = r.bundle.modules.find((mm) => after(e, mm.start) && before(e, mm.end)); return m ? m.id : null; };
      const mapPath = `${f.path}.map`;
      let origin = null;
      if (fs.has(mapPath)) {
        try { const mapObj = JSON.parse(fs.read(mapPath).toString('utf8')); const dec = decodeMappings(mapObj.mappings || ''); origin = (e) => { const row = dec.lines[e.line - 1] || []; let best = null; for (const s of row) if (s.gcol <= (e.col || 0) && (!best || s.gcol > best.gcol)) best = s; return best && best.src !== undefined ? { source: (mapObj.sources || [])[best.src] || null, line: best.oline + 1, col: best.ocol } : null; }; mod.map = mapPath; maps += 1; } catch { origin = null; }
      }
      const place = (e) => { const m = inside(e); if (m) e.module = m; const o = origin ? origin(e) : null; if (o && o.source) e.origin = o; return e; };
      if (r.bundle) { mod.bundle = { kind: r.bundle.kind, modules: r.bundle.modules.length, edges: r.bundle.edges.length }; bundles.push({ file: f.path, kind: r.bundle.kind, modules: r.bundle.modules.length, edges: r.bundle.edges.length }); }
      for (const i of r.imports) { mod.imports += 1; if (i.spec) noteImport(f.path, i.spec, i.line); else out.edges.push({ from: f.path, to: null, expr: i.expr, line: i.line, missing: false, dynamic: true }); }
      for (const c of r.ipc) {
        const rec = place({ channel: c.channel, via: c.via, file: f.path, line: c.line, col: c.col, confidence: c.confidence });
        if (c.channel === null) out.ipc.dynamic.push(place({ file: f.path, line: c.line, col: c.col, via: c.via, expr: c.expr }));
        else if (c.side === 'main') out.ipc.handlers.push(rec);
        else out.ipc.senders.push(rec);
      }
      for (const c of r.wrapperCalls) {
        const rec = place({ channel: c.channel, via: c.via, file: f.path, line: c.line, col: c.col, confidence: c.confidence });
        if (c.channel === null) out.ipc.dynamic.push(place({ file: f.path, line: c.line, col: c.col, via: c.via, expr: c.expr }));
        else if (c.side === 'main') out.ipc.handlers.push(rec);
        else out.ipc.senders.push(rec);
      }
      for (const b of r.bridge) out.bridge.push(place({ key: b.key, expr: b.expr, file: f.path, line: b.line, col: b.col }));
      for (const w of r.windows) out.windows.push(place({ file: f.path, ...w }));
      for (const pr of r.prefs) out.preferences.push(place({ flag: pr.flag, file: f.path, line: pr.line, col: pr.col }));
      for (const u of r.urls) { const e = place({ line: u.line, col: u.col }); noteUrl(u.url, f.path, u.line, e.module, e.origin); }
      for (const pc of r.processes) out.processes.push(place({ command: pc.command, expr: pc.expr, confidence: pc.confidence, file: f.path, line: pc.line, col: pc.col }));
      if (r.processes.length) mod.spawns = r.processes.length;
      for (const s of r.shell) out.shell.push(place({ call: s.call, file: f.path, line: s.line, col: s.col }));
      for (const pw of r.powers) out.powers.push(place({ api: pw.api, file: f.path, line: pw.line, col: pw.col }));
      for (const e of r.evals) out.eval.push(place({ file: f.path, line: e.line, col: e.col }));
      for (const e of r.envSecrets) out.envSecrets.push(place({ name: e.name, file: f.path, line: e.line, col: e.col }));
      out.modules.push(mod);
    }
    out.bundles = bundles; out.maps = maps;
    out.ipc.wrappers = [...wrappers.values()].map((w) => ({ name: w.name, side: w.side, ipc: w.ipc, method: w.method, file: w.file, line: w.line }));
  } else {
    for (const f of sources) {
      const text = texts.get(f.path); if (text === undefined) continue;
      const lines = text.split('\n').length;
      const isMin = text.length > 50 * 1024 && text.length / lines > 400;
      if (isMin) minified += 1;
      const mod = { path: f.path, bytes: Buffer.byteLength(text), lines, minified: isMin, scanned: true, imports: 0 };
      scanText(text, f.path, mod, out, noteUrl, noteImport);
      out.modules.push(mod);
    }
    textWrappers(texts, out);
  }
  for (const f of html) {
    const text = fs.read(f.path)?.toString('utf8') || '';
    const scripts = [...text.matchAll(RE.scriptSrc)].map((m) => m[2]);
    out.renderers.push({ path: f.path, scripts });
  }
  out.urls = Object.fromEntries([...urlSeen.entries()].map(([k, v]) => [k, { count: v.count, first: v.first, examples: [...v.examples] }]));
  // reachability from the entry, over the resolved edges
  const reach = new Set();
  if (entry && known.has(entry)) {
    const stack = [entry];
    const byFrom = new Map();
    for (const e of out.edges) { if (!e.to) continue; if (!byFrom.has(e.from)) byFrom.set(e.from, []); byFrom.get(e.from).push(e.to); }
    while (stack.length) { const p = stack.pop(); if (reach.has(p)) continue; reach.add(p); for (const t of byFrom.get(p) || []) stack.push(t); }
  }
  for (const m of out.modules) m.reachedFromEntry = entry ? reach.has(m.path) : null;
  // the pairing, in both directions: what a renderer sends must be handled in main, what
  // main pushes must be listened for in a renderer
  const handled = new Set(out.ipc.handlers.map((h) => h.channel));
  const toMain = new Set(out.ipc.senders.filter((s) => /^(ipcRenderer\.(invoke|send|sendSync|postMessage|sendTo)|wrapper )/.test(s.via) && !/^ipcRenderer\.(on|once)/.test(s.via)).map((s) => s.channel));
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
  if (bundles.length) limitations.push(`${bundles.length} bundle(s) read by their module table: a module is named by its bundler id${maps ? '' : ', the original file only when the archive ships the map'}`);
  if (maps) limitations.push(`${maps} source map(s) found beside bundles and used for the original positions: a map is the bundler's claim, not checked against the bundle`);
  if (minified) limitations.push(`${minified} file(s) look minified or bundled: names inside them are the bundler's, imports are what the bundle kept`);
  if (broken) limitations.push(`${broken} file(s) did not parse cleanly (syntax the grammar does not know, or not JavaScript): read with the tree where it held`);
  if (out.ipc.dynamic.length) limitations.push(`${out.ipc.dynamic.length} IPC call(s) whose channel could not be resolved to a string (listed under ipc.dynamic with the expression)`);
  if (out.reader === 'text') limitations.push('read with text patterns, not a parse: the grammar was not available; a channel held in a constant or built from parts is not resolved');
  if (!out.ipc.senders.some((s) => s.via.startsWith('ipcRenderer.')) && out.ipc.handlers.length) limitations.push('no renderer-side IPC in the archive: the renderer is loaded from elsewhere (a URL, another folder) or bundled under names this reading does not match; the pairing counts only what is here');
  limitations.push('read, not executed: a value computed at run time, a string from the network or a file, or code loaded from outside the archive is not seen');
  const coverage = { status: skipped || out.ipc.dynamic.length || broken ? 'partial' : 'complete', scope: `${sources.length} source files and ${html.length} html files ${opts.all ? 'including' : 'outside'} node_modules, ${(bytesScanned / 1024 / 1024).toFixed(1)} MB read as ${out.reader === 'parse' ? 'syntax trees' : 'text'}` };
  return { out, limitations, coverage };
}

/** The text patterns: what runs when a file has no grammar. */
function scanText(text, path, mod, out, noteUrl, noteImport) {
  const at = lineIndex(text);
  for (const m of text.matchAll(RE.requires)) { const spec = m[2] || m[4] || m[6]; if (!spec) continue; mod.imports += 1; noteImport(path, spec, at(m.index)); }
  for (const m of text.matchAll(RE.ipcMain)) out.ipc.handlers.push({ channel: m[3], via: 'ipcMain.' + m[1], file: path, line: at(m.index), confidence: 'observed' });
  for (const m of text.matchAll(RE.ipcRenderer)) out.ipc.senders.push({ channel: m[3], via: 'ipcRenderer.' + m[1], file: path, line: at(m.index), confidence: 'observed' });
  for (const m of text.matchAll(RE.webContentsSend)) out.ipc.senders.push({ channel: m[2], via: 'webContents.send', file: path, line: at(m.index), confidence: 'observed' });
  for (const m of text.matchAll(RE.ipcDynamic)) out.ipc.dynamic.push({ file: path, line: at(m.index), index: m.index });
  for (const m of text.matchAll(RE.bridge)) out.bridge.push({ key: m[2], file: path, line: at(m.index) });
  for (const m of text.matchAll(RE.window)) {
    const block = text.slice(m.index, m.index + 2500);
    const preload = RE.preload.exec(block); RE.preload.lastIndex = 0;
    const prefs = [...block.matchAll(RE.pref)].map((p) => `${p[1]}:${p[2]}`);
    out.windows.push({ file: path, line: at(m.index), preload: preload ? preload[1].trim().slice(0, 160) : null, preferences: prefs });
  }
  for (const m of text.matchAll(RE.pref)) if (m[2] === (m[1] === 'contextIsolation' || m[1] === 'webSecurity' || m[1] === 'sandbox' ? 'false' : 'true')) out.preferences.push({ flag: `${m[1]}:${m[2]}`, file: path, line: at(m.index) });
  for (const m of text.matchAll(RE.url)) noteUrl(m[0].replace(/[.,;:]+$/, ''), path, at(m.index));
  for (const m of text.matchAll(RE.child)) out.processes.push({ command: m[2], file: path, line: at(m.index), confidence: 'observed' });
  const childCount = [...text.matchAll(RE.childAny)].length;
  if (childCount) mod.spawns = childCount;
  for (const m of text.matchAll(RE.shell)) out.shell.push({ call: 'shell.' + m[1], file: path, line: at(m.index) });
  for (const m of text.matchAll(RE.powers)) out.powers.push({ api: m[1], file: path, line: at(m.index) });
  for (const m of text.matchAll(RE.eval)) out.eval.push({ file: path, line: at(m.index) });
  for (const m of text.matchAll(RE.envSecret)) out.envSecrets.push({ name: m[1], file: path, line: at(m.index) });
}

/** Text-pattern reading of wrappers: a function whose body calls ipcMain with a variable. */
function textWrappers(texts, out) {
  const wrappers = new Set();
  for (const d of out.ipc.dynamic) {
    const text = texts.get(d.file);
    if (!text || d.index === undefined) continue;
    const before = text.slice(Math.max(0, d.index - 600), d.index);
    const m = [...before.matchAll(/(?:function\s+([A-Za-z_$][\w$]*)\s*\(|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>|([A-Za-z_$][\w$]*)\s*[:=]\s*(?:async\s*)?function\s*\()/g)].pop();
    const name = m && (m[1] || m[2] || m[3]);
    if (name && !['function', 'if', 'for', 'while'].includes(name)) wrappers.add(name);
  }
  out.ipc.wrappers = [...wrappers].map((name) => ({ name, side: 'main' }));
  if (wrappers.size) {
    const re = new RegExp(`(?<![\\w$.])(${[...wrappers].join('|')})\\s*\\(\\s*(['"\`])([^'"\`\\n]{1,120})\\2`, 'g');
    for (const [path, text] of texts) {
      const at = lineIndex(text);
      for (const m of text.matchAll(re)) out.ipc.handlers.push({ channel: m[3], via: `wrapper ${m[1]}`, file: path, line: at(m.index), confidence: 'derived' });
    }
  }
}

function appText(rec) {
  const r = rec.result;
  const L = [];
  L.push(`${r.name} ${r.version || ''}  ${rec.subject.format}  ${(rec.subject.bytes / 1024 / 1024).toFixed(1)} MB  entry ${r.entry || '?'}  electron ${r.electron || '?'}`);
  L.push(`files ${r.files.total} (${r.files.sources} sources, ${r.files.html} html, ${r.files.unpacked} unpacked)  native addons ${r.nativeAddons.length}  packages used ${Object.keys(r.packages).length}`);
  const mods = r.modules.filter((m) => m.scanned);
  L.push(`modules ${mods.length}, reached from entry ${mods.filter((m) => m.reachedFromEntry).length}, minified ${mods.filter((m) => m.minified).length}`);
  L.push(`ipc: ${r.ipc.handlers.length} handlers, ${r.ipc.senders.length} senders/listeners, ${r.ipc.channels} channels; renderer→main never handled ${r.ipc.sentNeverHandled.length}, handled never sent ${r.ipc.handledNeverSent.length}, main→renderer never listened ${r.ipc.pushedNeverListened.length}, listened never pushed ${r.ipc.listenedNeverPushed.length}, dynamic ${r.ipc.dynamic.length}`);
  if (r.bundles && r.bundles.length) L.push(`bundles: ${r.bundles.map((b) => `${b.file} (${b.kind}, ${b.modules} modules, ${b.edges} edges)`).join('; ')}${r.maps ? `; ${r.maps} map(s) used for original positions` : ''}`);
  if (r.fuses) L.push(`fuses: ${r.fuses.count} read from ${basename(r.fuses.executable)}; weak ${r.fuses.weak.length ? r.fuses.weak.join(' ') : 'none'}`);
  L.push(`bridge keys ${r.bridge.map((b) => b.key).join(', ') || '-'}`);
  for (const w of r.windows) L.push(`window ${w.file}:${w.line}  preload ${w.preload || '-'}  ${w.preferences.join(' ') || ''}`);
  for (const p of r.preferences) L.push(`weak preference ${p.flag}  ${p.file}:${p.line}`);
  const hosts = Object.entries(r.urls).sort((a, b) => b[1].count - a[1].count);
  L.push(`hosts ${hosts.length}: ${hosts.slice(0, 12).map(([h, v]) => `${h} (${v.count})`).join(', ')}`);
  if (r.processes.length) L.push(`processes: ${r.processes.slice(0, 8).map((p) => `${p.command ?? "(" + p.expr + ")"} @ ${p.file}:${p.line}`).join('; ')}`);
  if (r.shell.length) L.push(`shell: ${r.shell.map((s) => `${s.call} @ ${s.file}:${s.line}`).join('; ')}`);
  if (r.powers.length) L.push(`powers: ${[...new Set(r.powers.map((p) => p.api))].join(', ')}`);
  if (r.eval.length) L.push(`eval/new Function: ${r.eval.map((e) => `${e.file}:${e.line}`).join(', ')}`);
  if (r.envSecrets.length) L.push(`env secrets read: ${[...new Set(r.envSecrets.map((e) => e.name))].join(', ')}`);
  if (r.ipc.wrappers && r.ipc.wrappers.length) L.push(`wrappers: ${r.ipc.wrappers.map((w) => `${w.name} (${w.side}${w.file ? ', ' + w.file + ':' + w.line : ''})`).join(', ')}`);
  L.push(`coverage ${rec.coverage.status}: ${rec.coverage.scope}`);
  for (const l of rec.limitations) L.push(`limit  ${l}`);
  L.push(`id ${rec.id}`);
  return L.join('\n');
}

function page(list, n, per) { const start = (n - 1) * per; return { page: n, per, total: list.length, items: list.slice(start, start + per) }; }

async function cmdApp(path) {
  const abs = resolve(path);
  if (!existsSync(abs)) fail(`not found: ${abs}`, 'not_found');
  const fs = openSubject(abs);
  if (!fs) fail(`not an application archive or folder: ${abs}`, 'unsupported');
  const detail = flags.detail || 'summary';
  const { out, limitations, coverage } = await analyzeApp(fs, { all: Boolean(flags.all), text_only: Boolean(flags['text-only']) });
  fs.close();
  const exe = fs.kind === 'asar' ? executableBeside(fs.root) : null;
  if (exe) { const fz = readFuses(exe); if (fz) { out.fuses = { executable: exe, ...fz }; if (fz.weak && fz.weak.length) limitations.push(`fuses: ${fz.weak.join(', ')} differ from what a shipped application is expected to have`); } }
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

// ---------------------------------------------------------------- Electron fuses

const FUSE_SENTINEL = Buffer.from('dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX', 'latin1');
const FUSE_NAMES = ['RunAsNode', 'EnableCookieEncryption', 'EnableNodeOptionsEnvironmentVariable', 'EnableNodeCliInspectArguments', 'EnableEmbeddedAsarIntegrityValidation', 'OnlyLoadAppFromAsar', 'LoadBrowserProcessSpecificV8Snapshot', 'GrantFileProtocolExtraPrivileges'];
/** The state an application shipped to end users is expected to have; the rest is a weakness worth a line. */
const FUSE_EXPECTED = { RunAsNode: 'off', EnableCookieEncryption: 'on', EnableNodeOptionsEnvironmentVariable: 'off', EnableNodeCliInspectArguments: 'off', EnableEmbeddedAsarIntegrityValidation: 'on', OnlyLoadAppFromAsar: 'on' };

/** The fuse block inside an Electron executable: the sentinel, a version byte, a count, then one byte per fuse ('0' off, '1' on, 'r' removed). */
function readFuses(path) {
  const buf = readFileSync(path);
  const i = buf.indexOf(FUSE_SENTINEL);
  if (i < 0) return null;
  const j = i + FUSE_SENTINEL.length;
  const version = buf[j], count = buf[j + 1];
  if (version !== 1 || count > 64) return { version, count, fuses: [], limitations: ['fuse block version not known to this reader'] };
  const fuses = [];
  for (let k = 0; k < count; k += 1) {
    const ch = String.fromCharCode(buf[j + 2 + k]);
    const name = FUSE_NAMES[k] || `fuse ${k} (added after this reader's list)`;
    const state = ch === '1' ? 'on' : ch === '0' ? 'off' : ch === 'r' ? 'removed' : `unknown (${ch})`;
    fuses.push({ index: k, name, state, expected: FUSE_EXPECTED[name] || null, weak: Boolean(FUSE_EXPECTED[name]) && FUSE_EXPECTED[name] !== state && state !== 'removed' });
  }
  return { version, count, offset: i, fuses, weak: fuses.filter((f) => f.weak).map((f) => `${f.name}:${f.state}`) };
}

/** The application's executable beside an installed archive: the largest .exe in the folder above `resources`. */
function executableBeside(root) {
  const dir = basename(dirname(root)) === 'resources' ? dirname(dirname(root)) : root;
  let best = null;
  try {
    for (const e of readdirSync(dir)) if (/\.exe$/i.test(e)) { const s = statSync(join(dir, e)).size; if (!best || s > best.size) best = { path: join(dir, e), size: s }; }
  } catch { /* no folder */ }
  if (best) return best.path;
  for (const e of ['MacOS', 'Contents/MacOS']) { try { const d = join(dir, e); const files = readdirSync(d); if (files.length) return join(d, files[0]); } catch { /* not a bundle */ } }
  return null;
}

function cmdFuses(path) {
  const abs = resolve(path);
  if (!existsSync(abs)) fail(`not found: ${abs}`, 'not_found');
  const exe = statSync(abs).isDirectory() ? executableBeside(join(abs, 'resources', 'app.asar')) : abs;
  if (!exe) fail('no executable found beside this folder', 'not_found');
  const r = readFuses(exe);
  const subject = { name: basename(exe), path: exe, format: detectFile(exe), bytes: statSync(exe).size, sha256: fileSha(exe) };
  if (!r) { const rec = record(subject, 'fuses', {}, { found: false }, { coverage: { status: 'complete', scope: 'the whole file searched for the fuse sentinel' }, limitations: ['no fuse block: not an Electron executable, or one built before fuses existed'] }); emit(rec, `no fuse block in ${exe}\nid ${rec.id}`); return; }
  const rec = record(subject, 'fuses', {}, r, { coverage: { status: 'complete', scope: 'the fuse block at its sentinel' }, limitations: r.limitations || ['a fuse is a build-time switch read from the binary; what the running program does with it is not observed'] });
  const L = [`${subject.name}  fuses v${r.version}  ${r.count} values  weak ${r.weak.length ? r.weak.join(' ') : 'none'}`];
  for (const f of r.fuses) L.push(`${String(f.index).padStart(2)}  ${f.name.padEnd(40)} ${f.state}${f.weak ? `   expected ${f.expected}` : ''}`);
  L.push(`id ${rec.id}`);
  emit(rec, L.join('\n'));
}

// ---------------------------------------------------------------- compare two applications

function listDiff(a, b) { const A = new Set(a), B = new Set(b); return { added: [...B].filter((x) => !A.has(x)).sort(), removed: [...A].filter((x) => !B.has(x)).sort() }; }

async function cmdCompare(first, second) {
  const paths = [first, second].map((p) => resolve(p));
  for (const p of paths) if (!existsSync(p)) fail(`not found: ${p}`, 'not_found');
  const recs = [];
  for (const p of paths) {
    const fsx = openSubject(p); if (!fsx) fail(`not an application: ${p}`, 'unsupported');
    const { out } = await analyzeApp(fsx, { all: Boolean(flags.all) });
    fsx.close();
    if (statSync(p).isDirectory()) { const exe = executableBeside(fsx.root); out.fuses = exe ? readFuses(exe) : null; }
    recs.push({ root: fsx.root, out });
  }
  const [A, B] = recs.map((r) => r.out);
  const chan = (o) => [...new Set([...o.ipc.handlers, ...o.ipc.senders].map((x) => x.channel).filter(Boolean))];
  const result = {
    a: { path: recs[0].root, name: A.name, version: A.version }, b: { path: recs[1].root, name: B.name, version: B.version },
    channels: listDiff(chan(A), chan(B)),
    handlers: listDiff(A.ipc.handlers.map((h) => h.channel), B.ipc.handlers.map((h) => h.channel)),
    hosts: listDiff(Object.keys(A.urls), Object.keys(B.urls)),
    processes: listDiff(A.processes.map((p) => p.command || `(${p.expr})`), B.processes.map((p) => p.command || `(${p.expr})`)),
    preferences: listDiff(A.preferences.map((p) => p.flag), B.preferences.map((p) => p.flag)),
    powers: listDiff(A.powers.map((p) => p.api), B.powers.map((p) => p.api)),
    bridge: listDiff(A.bridge.map((b) => b.key).filter(Boolean), B.bridge.map((b) => b.key).filter(Boolean)),
    modules: listDiff(A.modules.map((m) => m.path), B.modules.map((m) => m.path)),
    packages: listDiff(Object.keys(A.packages), Object.keys(B.packages)),
    nativeAddons: listDiff(A.nativeAddons, B.nativeAddons),
    envSecrets: listDiff(A.envSecrets.map((e) => e.name), B.envSecrets.map((e) => e.name)),
    fuses: A.fuses && B.fuses ? listDiff(A.fuses.fuses.map((f) => `${f.name}:${f.state}`), B.fuses.fuses.map((f) => `${f.name}:${f.state}`)) : null,
    files: { a: A.files, b: B.files },
  };
  const subject = { name: `${basename(recs[0].root)} → ${basename(recs[1].root)}`, path: null, format: 'comparison', bytes: null, sha256: null };
  const rec = record(subject, 'compare', { a: recs[0].root, b: recs[1].root, all: Boolean(flags.all) }, result, { confidence: 'derived', coverage: { status: 'complete', scope: 'two `app` readings compared by name; what each reading could not see, it could not compare' }, limitations: ['a module renamed by the bundler shows as removed and added; a channel moved into a wrapper the reader does not know shows as removed'] });
  const L = [`${A.name} ${A.version || ''} → ${B.name} ${B.version || ''}`];
  for (const k of ['channels', 'handlers', 'hosts', 'processes', 'preferences', 'powers', 'bridge', 'packages', 'nativeAddons', 'envSecrets', 'fuses', 'modules']) {
    const d = result[k]; if (!d) continue;
    if (d.added.length || d.removed.length) L.push(`${k.padEnd(12)} +${d.added.length} -${d.removed.length}  ${d.added.slice(0, 8).map((x) => '+' + x).join(' ')} ${d.removed.slice(0, 8).map((x) => '-' + x).join(' ')}`.trimEnd());
  }
  if (L.length === 1) L.push('no difference in what the reader sees');
  L.push(`id ${rec.id}`);
  emit(rec, L.join('\n'));
}

// ---------------------------------------------------------------- a compiled file: PE, ELF, Mach-O

function binText(rec) {
  const r = rec.result; const L = [];
  const s = rec.subject;
  if (r.format === 'pe') {
    L.push(`${s.name}  PE ${r.pe32plus ? '64' : '32'} ${r.machine}  ${r.dll ? 'dll' : 'exe'}  ${r.subsystem}  built ${r.timestamp || '?'}  ${(s.bytes / 1024 / 1024).toFixed(1)} MB`);
    if (r.version) L.push(`version  ${[r.version.ProductName, r.version.FileVersion || r.version.fileVersionFixed, r.version.CompanyName].filter(Boolean).join(' · ')}`);
    if (r.manifest) L.push(`manifest  execution level ${r.manifest.requestedExecutionLevel || '?'}  dpi ${r.manifest.dpiAware || '?'}`);
    L.push(`hardening  aslr ${r.hardening.aslr} high-entropy ${r.hardening.highEntropy} nx ${r.hardening.nx} cfg ${r.hardening.cfg} signed ${r.hardening.authenticode}${r.hardening.writableCode.length ? ' WRITABLE+EXEC ' + r.hardening.writableCode.join(',') : ''}`);
    L.push(`sections  ${r.sections.map((x) => `${x.name}(${x.flags.filter((f) => f === 'exec' || f === 'write').map((f) => f[0]).join('') || 'r'})`).join(' ')}`);
    L.push(`imports  ${r.imports.length} dlls: ${r.imports.slice(0, 14).map((i) => `${i.dll}(${i.count})`).join(' ')}`);
    if (r.exports) L.push(`exports  ${r.exports.named} named${r.exports.name ? ' as ' + r.exports.name : ''}: ${r.exports.names.slice(0, 10).join(' ')}`);
    if (r.dotnet) { const d = r.dotnet; L.push(`.NET  ${d.runtimeVersion}  ${d.assembly ? d.assembly.name + ' ' + d.assembly.version : d.module}  ${d.counts.types} types, ${d.counts.methods} methods, ${d.counts.pinvoke} P/Invoke, ${d.counts.userStrings} strings  entry ${d.entryMethod || '-'}  il-only ${d.flags.ilOnly}`); if (d.assemblyRefs.length) L.push(`refs  ${d.assemblyRefs.slice(0, 12).map((a) => a.name).join(', ')}`); if (d.pinvoke.length) L.push(`pinvoke  ${d.pinvoke.slice(0, 10).map((p) => `${p.dll}!${p.entry}`).join(' ')}`); }
  } else if (r.format === 'elf') {
    L.push(`${s.name}  ELF${r.class} ${r.machine}  ${r.type}  interp ${r.interpreter || '-'}  ${(s.bytes / 1024 / 1024).toFixed(1)} MB`);
    L.push(`hardening  pie ${r.hardening.pie} nx ${r.hardening.nx} relro ${r.hardening.relro} canary ${r.hardening.canary} stripped ${r.hardening.stripped}${r.hardening.writableExec ? ' WRITABLE+EXEC segments ' + r.hardening.writableExec : ''}`);
    L.push(`needed  ${r.needed.join(' ') || '-'}${r.rpath ? '  rpath ' + r.rpath : ''}${r.runpath ? '  runpath ' + r.runpath : ''}${r.soname ? '  soname ' + r.soname : ''}`);
    L.push(`symbols  ${r.counts.imported} imported, ${r.counts.exported} exported: ${r.imported.slice(0, 12).join(' ')}`);
  } else if (r.format === 'mach-o') {
    if (r.fat) { L.push(`${s.name}  fat Mach-O, ${r.slices.length} slices: ${r.slices.map((x) => x.cpu).join(', ')}`); }
    else {
      L.push(`${s.name}  Mach-O ${r.class} ${r.cpu}  ${r.filetype}  ${r.build ? r.build.platform + ' min ' + r.build.minos + ' sdk ' + r.build.sdk : ''}  signed ${r.signed}  pie ${r.flags.pie}`);
      L.push(`dylibs  ${r.dylibs.map((d) => d.name.split('/').pop()).join(' ')}${r.rpaths.length ? '  rpath ' + r.rpaths.join(' ') : ''}`);
      L.push(`symbols  ${r.counts.imported} imported, ${r.counts.exported} exported: ${r.imported.slice(0, 12).join(' ')}`);
    }
  }
  if (r.go) L.push(`go  ${r.go.version || '?'}  ${r.go.main ? r.go.main.path : r.go.path || ''}  ${r.go.deps.length} deps  ${Object.entries(r.go.settings).filter(([k]) => /^(GOOS|GOARCH|CGO_ENABLED|vcs\.revision|-ldflags)$/.test(k)).map(([k, v]) => k + '=' + v).join(' ')}`);
  if (r.rust) L.push(`rust  ${r.rust.rustc ? JSON.stringify(r.rust.rustc) : '?'}  ${r.rust.crates.length} crates seen in paths${r.rust.auditable ? `, ${r.rust.auditable.packages.length} in the audit section` : ''}: ${r.rust.crates.slice(0, 10).map((c) => c.name + '@' + c.version).join(' ')}`);
  if (r.strings) { const st = r.strings; L.push(`strings  ${st.urls.length} urls, ${st.registry.length} registry keys, ${st.windowsPaths.length} windows paths, ${st.posixPaths.length} posix paths: ${st.urls.slice(0, 6).map((x) => x.value).join(' ')}`); }
  L.push(`coverage ${rec.coverage.status}: ${rec.coverage.scope}`);
  for (const l of rec.limitations) L.push(`limit  ${l}`);
  L.push(`id ${rec.id}`);
  return L.join('\n');
}

function cmdBin(path) {
  const abs = resolve(path);
  if (!existsSync(abs)) fail(`not found: ${abs}`, 'not_found');
  const buf = readFileSync(abs);
  let r;
  try { r = readBinary(buf); } catch (e) { fail(e.message, 'unsupported'); }
  const limitations = [...(r.limitations || []), 'headers and tables read as the loader reads them; code not disassembled, nothing run: what a function does is not known from this'];
  if (r.go && r.go.limitations) limitations.push(...r.go.limitations);
  delete r.limitations;
  const subject = { name: basename(abs), path: abs, format: r.format, bytes: buf.length, sha256: sha256(buf) };
  const full = flags.detail === 'full';
  const result = full ? r : { ...r, sections: r.sections ? r.sections.map((s) => ({ name: s.name, size: s.rawSize ?? s.size ?? s.filesize, flags: s.flags })) : undefined, imports: r.imports ? r.imports.map((i) => ({ dll: i.dll, count: i.count, names: i.names.slice(0, 40) })) : undefined, exports: r.exports ? { ...r.exports, names: r.exports.names.slice(0, 60) } : r.exports, imported: r.imported ? r.imported.slice(0, 80) : undefined, exported: r.exported ? r.exported.slice(0, 80) : undefined, dotnet: r.dotnet ? { ...r.dotnet, types: r.dotnet.types.slice(0, 60), userStrings: r.dotnet.userStrings.slice(0, 60), pinvoke: r.dotnet.pinvoke.slice(0, 60) } : r.dotnet, segments: r.segments ? r.segments.map((s) => ({ ...s, sections: undefined })) : undefined };
  const rec = record(subject, 'bin', { detail: full ? 'full' : 'summary' }, result, { limitations, coverage: { status: 'complete', scope: `${r.format} headers, sections, imports and exports${r.dotnet ? ', .NET metadata tables' : ''}${r.go ? ', Go build info' : ''}${r.rust ? ', Rust crate paths' : ''}, strings` } });
  emit(rec, binText({ ...rec, result: r }));
}

// ---------------------------------------------------------------- observe: the program alive for a few seconds

/** Process ids of this executable already alive, by its full path; empty when none. */
async function alreadyRunning(exe) {
  const { spawnSync } = await import('node:child_process');
  try {
    if (process.platform === 'win32') {
      const r = spawnSync('powershell', ['-NoProfile', '-Command', `Get-Process | Where-Object { $_.Path -eq '${exe.replace(/'/g, "''")}' } | ForEach-Object { $_.Id }`], { encoding: 'utf8', timeout: 15000 });
      return (r.stdout || '').split(/\r?\n/).map((s) => s.trim()).filter((s) => /^\d+$/.test(s));
    }
    const r = spawnSync('pgrep', ['-f', exe], { encoding: 'utf8', timeout: 5000 });
    return (r.stdout || '').split(/\n/).map((s) => s.trim()).filter((s) => /^\d+$/.test(s) && Number(s) !== process.pid);
  } catch { return []; }
}

async function cmdObserve(path) {
  const abs = resolve(path);
  if (!existsSync(abs)) fail(`not found: ${abs}`, 'not_found');
  if (!flags.yes) fail('observe starts the program: pass --yes after the person has agreed, on software they own', 'consent');
  const isDir = statSync(abs).isDirectory();
  const exe = isDir ? executableBeside(join(abs, 'resources', 'app.asar')) : abs;
  if (!exe) fail('no executable found beside this folder', 'not_found');
  const running = await alreadyRunning(exe);
  if (running.length) fail(`${basename(exe)} is already running (pid ${running.join(', ')}): a second instance would hand over to it and quit, and the running one is not ours to stop. Close it first.`, 'already_running');
  // the static reading first, for the bridge keys and the channels to correlate
  let stat = null;
  const fsx = isDir ? openSubject(abs) : null;
  if (fsx) { stat = (await analyzeApp(fsx, { all: false })).out; fsx.close(); }
  const seconds = Math.max(3, Math.min(120, Number(flags.seconds || 12)));
  const extra = flags.args ? String(flags.args).split(/\s+/).filter(Boolean) : [];
  const { result, limitations } = await observe(exe, { seconds, args: extra, bridgeKeys: stat ? stat.bridge.map((b) => b.key).filter(Boolean) : [], cwd: dirname(exe) });
  // correlation with the static reading
  let correlation = null;
  if (stat && result.main && result.main.electron) {
    const rt = new Set([...(result.main.electron.ipc.handle || []), ...(result.main.electron.ipc.on || [])]);
    const st = new Set(stat.ipc.handlers.map((h) => h.channel));
    correlation = { runtimeHandlers: rt.size, staticHandlers: st.size, runtimeOnly: [...rt].filter((c) => !st.has(c)).sort(), staticOnly: [...st].filter((c) => !rt.has(c)).sort(), windows: result.main.electron.windows.map((w) => ({ title: w.title, url: w.url.slice(0, 120), preferences: w.preferences })) };
    const staticHosts = new Set(Object.keys(stat.urls));
    correlation.hostsContactedNotInCode = Object.keys(result.network.hosts).filter((h) => h !== 'file' && !staticHosts.has(h)).sort();
    correlation.hostsInCodeNotContacted = [...staticHosts].filter((h) => !result.network.hosts[h]).sort();
  }
  const subject = { name: basename(exe), path: exe, format: 'running-process', bytes: statSync(exe).size, sha256: fileSha(exe) };
  const rec = record(subject, 'observe', { seconds, args: extra, yes: true }, { ...result, correlation }, { confidence: 'observed', authority: 'controlled-run', coverage: { status: 'partial', scope: `${result.seconds} s after start, ${result.pages.length} page(s) on the debugging port, main process ${result.main ? 'probed' : 'not reached'}` }, limitations });
  const L = [];
  const m = result.main;
  L.push(`${subject.name}  pid ${result.pid}  ${result.seconds} s  exit ${result.exitCode === null ? 'stopped by us' : result.exitCode}`);
  if (m && m.electron) {
    const e = m.electron;
    L.push(`app  ${e.name} ${e.version}  electron ${m.versions.electron || '?'} node ${m.versions.node || '?'} chrome ${m.versions.chrome || '?'}  userData ${e.paths.userData}`);
    L.push(`ipc at runtime  ${e.ipc.handle ? e.ipc.handle.length : '?'} handle, ${e.ipc.on.length} on`);
    for (const w of e.windows) L.push(`window  "${w.title}"  ${w.url.slice(0, 100)}  ${Object.entries(w.preferences).filter(([k, v]) => v !== undefined && k !== 'preload').map(([k, v]) => `${k}:${v}`).join(' ')}`);
    if (m.children && m.children.length) L.push(`children  ${m.children.map((c) => `${c.file} ${c.args.slice(1, 4).join(' ')} (pid ${c.pid})`).join('; ')}`);
    if (m.envSecretNames && m.envSecretNames.length) L.push(`env secrets visible to the process  ${m.envSecretNames.join(', ')}`);
  } else if (m) L.push(`main  reached, electron not: ${m.electronError || '?'}`);
  const hosts = Object.entries(result.network.hosts).sort((a, b) => b[1] - a[1]);
  L.push(`network  ${result.network.requests.length} requests to ${hosts.length} hosts: ${hosts.slice(0, 12).map(([h, n]) => `${h} (${n})`).join(', ')}`);
  for (const p of result.pages) { const pr = p.probe; L.push(`page  ${p.type} "${p.title}" ${p.url.slice(0, 100)}${pr ? `  bridges ${Object.entries(pr.bridges).map(([k, v]) => `${k}[${Array.isArray(v) ? v.length : '?'}]`).join(' ') || '-'}  scripts ${pr.scripts.length}` : ''}`); }
  if (result.console.length) L.push(`console  ${result.console.length} lines, ${result.console.filter((c) => c.level === 'error').length} errors: ${result.console.slice(0, 3).map((c) => `[${c.level}] ${c.text.slice(0, 80)}`).join(' | ')}`);
  if (result.exceptions.length) L.push(`exceptions  ${result.exceptions.length}: ${result.exceptions[0].text.slice(0, 120)}`);
  if (correlation) {
    L.push(`correlation  handlers runtime ${correlation.runtimeHandlers} / static ${correlation.staticHandlers}; runtime only ${correlation.runtimeOnly.length}${correlation.runtimeOnly.length ? ' (' + correlation.runtimeOnly.slice(0, 6).join(', ') + ')' : ''}; static only ${correlation.staticOnly.length}${correlation.staticOnly.length ? ' (' + correlation.staticOnly.slice(0, 6).join(', ') + ')' : ''}`);
    L.push(`hosts  contacted and not in the code ${correlation.hostsContactedNotInCode.length}${correlation.hostsContactedNotInCode.length ? ' (' + correlation.hostsContactedNotInCode.slice(0, 6).join(', ') + ')' : ''}; in the code and not contacted ${correlation.hostsInCodeNotContacted.length}`);
  }
  L.push(`coverage ${rec.coverage.status}: ${rec.coverage.scope}`);
  for (const l of limitations) L.push(`limit  ${l}`);
  L.push(`id ${rec.id}`);
  emit(rec, L.join('\n'));
}

// ---------------------------------------------------------------- a .NET method body as instructions

function cmdCil(path) {
  const abs = resolve(path);
  if (!existsSync(abs)) fail(`not found: ${abs}`, 'not_found');
  const buf = readFileSync(abs);
  const typeFilter = flags.type ? String(flags.type).toLowerCase() : null;
  const methodFilter = flags.method ? String(flags.method).toLowerCase() : null;
  const want = (name) => {
    if (methodFilter) return name.toLowerCase().includes(methodFilter);
    if (typeFilter) return name.toLowerCase().split('::')[0].includes(typeFilter);
    return true; // a plain run decodes the first --max methods
  };
  let r;
  try { r = readBinary(buf, { clr: { decodeMethods: want, max: Number(flags.max || 40) } }); } catch (e) { fail(e.message, 'unsupported'); }
  if (!r.dotnet) fail('not a .NET assembly (no CLR metadata)', 'unsupported');
  const d = r.dotnet;
  const cov = d.cilCoverage || { attempted: 0, fullyDecoded: 0, percent: null, unknownOpcodes: [] };
  const limitations = ['CIL read from the bytes, not executed; a token is resolved to a name through the metadata, a signature blob is shown as its token', 'exception-handler regions after a fat body are not listed'];
  if (cov.unknownOpcodes.length) limitations.push(`opcodes not known to this reader, decoding stopped at them: ${cov.unknownOpcodes.join(', ')}`);
  if (cov.truncated) limitations.push(`more methods match than the --max limit (${flags.max || 40}); raise --max or narrow with --type/--method`);
  const subject = { name: basename(abs), path: abs, format: 'cil', bytes: buf.length, sha256: sha256(buf) };
  const bodies = (d.decoded || []).filter((m) => m.instructions);
  const result = { assembly: d.assembly, runtimeVersion: d.runtimeVersion, coverage: cov, methods: (d.decoded || []).map((m) => m.instructions ? { method: m.method, codeSize: m.codeSize, maxStack: m.maxStack, count: m.count, complete: m.complete, stoppedAt: m.stoppedAt, instructions: m.instructions } : { method: m.method, note: m.note }) };
  const rec = record(subject, 'cil', { type: flags.type || null, method: flags.method || null, max: Number(flags.max || 40) }, result, { confidence: 'observed', coverage: { status: cov.unknownOpcodes.length ? 'partial' : 'complete', scope: `${cov.attempted} method bodies decoded, ${cov.fullyDecoded} fully (${cov.percent}%)` }, limitations });
  const L = [`${subject.name}  ${d.assembly ? d.assembly.name + ' ' + d.assembly.version : d.module}  ${d.runtimeVersion}  methods decoded ${cov.attempted}, fully ${cov.fullyDecoded} (${cov.percent}%)`];
  for (const m of (d.decoded || [])) {
    if (!m.instructions) { L.push(`\n// ${m.method} — ${m.note}`); continue; }
    L.push(`\n.method ${m.method}  (IL ${m.codeSize} bytes, maxstack ${m.maxStack}${m.complete ? '' : `, STOPPED at ${m.stoppedAt}`})`);
    for (const ins of m.instructions) L.push('  ' + cilFormat(ins));
  }
  L.push(`\nid ${rec.id}`);
  emit(rec, L.join('\n'));
}

// ---------------------------------------------------------------- native disassembly (x86-64)

function codeSections(r) {
  if (r.format === 'pe') return r.sections.filter((s) => s.flags.includes('exec') || s.name === '.text').map((s) => ({ name: s.name, off: s.raw, size: s.rawSize }));
  if (r.format === 'elf') return r.sections.filter((s) => s.name === '.text' || s.name === '.plt' || s.name === '.init' || s.name === '.fini').map((s) => ({ name: s.name, off: s.off, size: s.size }));
  if (r.format === 'mach-o' && !r.fat) return r.segments.filter((s) => s.sections && s.sections.includes('__text')).map((s) => ({ name: '__text', off: s.fileoff, size: s.filesize }));
  return [];
}

function cmdDisasm(path) {
  const abs = resolve(path);
  if (!existsSync(abs)) fail(`not found: ${abs}`, 'not_found');
  const buf = readFileSync(abs);
  let r;
  try { r = readBinary(buf); } catch (e) { fail(e.message, 'unsupported'); }
  if (r.machine !== 'x86-64' && r.cpu !== 'x86-64') fail(`not x86-64 (${r.machine || r.cpu || r.format}); the ARM64 and Dalvik decoders are being written`, 'unsupported');
  const secs = codeSections(r);
  if (!secs.length) fail('no code section found', 'not_found');
  // coverage across every code section (the quality number)
  let good = 0, bad = 0;
  for (const s of secs) { if (!s.off || !s.size) continue; const d = x86disasm(buf, s.off, Math.min(s.off + s.size, buf.length), 0, 1e9); good += d.good; bad += d.bad; }
  const coverage = good + bad ? Math.round((good / (good + bad)) * 100) : null;
  // a listing: from --at (hex file offset) or the first code section's start
  // the file offset of the entry point, when it is in a code section: the one place sure to
  // be real code, so the listing starts there unless --at is given
  let entryOff = null;
  if (r.format === 'pe' && r.entry) { const s = r.sections.find((x) => r.entry >= x.vaddr && r.entry < x.vaddr + Math.max(x.vsize, x.rawSize)); if (s) entryOff = s.raw + (r.entry - s.vaddr); }
  else if (r.format === 'elf' && r.entry) { const s = r.sections.find((x) => r.entry >= x.addr && x.addr && r.entry < x.addr + x.size); if (s) entryOff = s.off + (r.entry - s.addr); }
  const textSec = secs.find((s) => s.name === '.text' || s.name === '__text') || secs[0];
  const at = flags.at ? parseInt(String(flags.at), 16) : (entryOff !== null ? entryOff : textSec.off);
  const count = Math.max(1, Math.min(2000, Number(flags.count || 60)));
  const secOf = secs.find((s) => at >= s.off && at < s.off + s.size) || textSec;
  const d = x86disasm(buf, at, Math.min(secOf.off + secOf.size, buf.length), at - secOf.off, count);
  const result = { format: r.format, arch: r.machine || r.cpu, sections: secs.map((s) => ({ name: s.name, bytes: s.size })), coverage: { instructions: good + bad, decoded: good, undecoded: bad, percent: coverage }, listingAt: at, listing: d.instructions };
  const subject = { name: basename(abs), path: abs, format: 'disasm', bytes: buf.length, sha256: sha256(buf) };
  const limitations = [
    'instructions decoded from the bytes, not executed; what a value is, where a call goes, what a function does is not inferred here',
    'the coverage is a linear sweep: a code section holds data too (jump tables, padding, constants) and x86 decodes almost any bytes as some instruction, so this number bounds the unknown-opcode rate, it is not proof that every boundary is a real instruction; the listing from the entry point is where real code is read',
    'addresses are file offsets inside the section, not runtime virtual addresses; a call/jmp target is shown as its offset, not resolved to a symbol',
  ];
  const rec = record(subject, 'disasm', { at: flags.at || null, count }, result, { confidence: 'observed', coverage: { status: coverage === 100 ? 'complete' : 'partial', scope: `${secs.length} code section(s), ${good + bad} instructions swept, ${good} decoded (${coverage}%)` }, limitations });
  const L = [`${subject.name}  ${result.arch}  ${secs.map((s) => `${s.name}(${s.bytes})`).join(' ')}  swept ${good + bad} instr, decoded ${coverage}%`];
  L.push(`\n; from 0x${at.toString(16)} (${secOf.name})`);
  for (const i of d.instructions) L.push(`  ${i.addr.toString(16).padStart(8, '0')}  ${i.bad ? '(data) ' + i.text : i.text}`);
  L.push(`\nid ${rec.id}`);
  emit(rec, L.join('\n'));
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
  const next = { asar: 'app', 'electron-app': 'app', 'electron-install': 'app', 'node-app': 'app', sqlite: 'sqlite', 'source-map': 'map', pe: 'bin', elf: 'bin', 'mach-o': 'bin' }[format] || null;
  const subject = { name: basename(abs), path: abs, format, bytes: st.isDirectory() ? null : st.size, sha256: st.isDirectory() ? null : fileSha(abs) };
  const rec = record(subject, 'detect', {}, { format, next: next ? `node artifact.mjs ${next} "${abs}"` : null }, { coverage: { status: 'complete', scope: st.isDirectory() ? 'folder name and package.json' : 'the first 32 bytes and the extension' }, limitations: st.isDirectory() ? [] : ['a format is read from its magic bytes; a file with a wrong header is reported as unknown'] });
  emit(rec, `${format}  ${abs}${next ? `\nnext  ${rec.result.next}` : ''}`);
}

// ---------------------------------------------------------------- main

if (!command || !target || flags.help || (command === 'compare' && !positional[2])) {
  process.stdout.write('usage: node artifact.mjs detect|app|bin|cil|disasm|sqlite|map|fuses <path> | compare <a> <b> | observe <folder|exe> --yes [--seconds 12] [--text] [--all] [--detail summary|full] [--page N --per 60] [--table T --limit 20] [--line L --col C]\n');
  process.exit(command ? 2 : 0);
}
try {
  if (command === 'detect') cmdDetect(target);
  else if (command === 'app') await cmdApp(target);
  else if (command === 'sqlite') await cmdSqlite(target);
  else if (command === 'map') cmdMap(target);
  else if (command === 'fuses') cmdFuses(target);
  else if (command === 'bin') cmdBin(target);
  else if (command === 'cil') cmdCil(target);
  else if (command === 'disasm') cmdDisasm(target);
  else if (command === 'observe') await cmdObserve(target);
  else if (command === 'compare') await cmdCompare(target, positional[2]);
  else fail(`unknown command: ${command}`);
} catch (e) {
  fail(e && e.message ? e.message : String(e), 'internal');
}
