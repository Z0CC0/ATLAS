#!/usr/bin/env node
/**
 * ATLAS memory — the live layer: a language server tells who calls a symbol, now.
 *
 * tree-sitter (codegraph) orients: it reads every file once and draws the graph by names,
 * so a name used twice in a project cannot be attributed and `obj.method()` is not seen.
 * A language server resolves: it knows types and imports, and answers "who references this
 * definition" exactly, for the code as it is at this moment. This is the sorter the base
 * document asked for: codegraph for the map, the server for the precise answer.
 *
 *   node lsp.mjs refs  <project-root> <file> <line> [<col>|<symbol>]   who references what is defined there
 *   node lsp.mjs check <project-root>                                   which servers this machine has
 *
 * Servers, found beside this file's node_modules, in ATLAS_NODE_MODULES or on the PATH:
 * `typescript-language-server` (JavaScript, TypeScript) and `pyright-langserver` (Python).
 * Nothing is installed by this tool; without a server it says so.
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SERVERS = {
  typescript: { bin: 'typescript-language-server', entry: 'typescript-language-server/lib/cli.mjs', args: ['--stdio'], exts: ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.mts', '.cts'], language: { '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.jsx': 'javascriptreact', '.ts': 'typescript', '.tsx': 'typescriptreact', '.mts': 'typescript', '.cts': 'typescript' } },
  python: { bin: 'pyright-langserver', entry: 'pyright/langserver.index.js', args: ['--stdio'], exts: ['.py'], language: { '.py': 'python' } },
};

/**
 * The server's JavaScript entry, run with this same Node (no shell, so a path with spaces
 * is fine, and inside Electron it runs as Node). Looked for in the node_modules beside this
 * file, the plugin's, ATLAS_NODE_MODULES, then the global npm folder.
 */
function findServer(name) {
  const s = SERVERS[name];
  const roots = [join(HERE, 'node_modules'), join(HERE, '..', 'node_modules'), process.env.ATLAS_NODE_MODULES, process.env.APPDATA && join(process.env.APPDATA, 'npm', 'node_modules'), '/usr/local/lib/node_modules', '/usr/lib/node_modules'].filter(Boolean);
  for (const r of roots) { const p = join(r, s.entry); if (existsSync(p)) return p; }
  return null;
}

const serverFor = (file) => Object.keys(SERVERS).find((k) => SERVERS[k].exts.includes(extname(file).toLowerCase())) || null;

/** One JSON-RPC conversation over stdio: initialize, open the file, ask, shut down. */
function rpc(entry, args, root) {
  const child = spawn(process.execPath, [entry, ...args], { cwd: root, windowsHide: true, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
  let buf = Buffer.alloc(0);
  let id = 0;
  const waits = new Map();
  child.stdout.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    for (;;) {
      const head = buf.indexOf('\r\n\r\n');
      if (head < 0) break;
      const len = Number(/Content-Length:\s*(\d+)/i.exec(buf.slice(0, head).toString())?.[1] || 0);
      if (buf.length < head + 4 + len) break;
      const msg = JSON.parse(buf.slice(head + 4, head + 4 + len).toString('utf8'));
      buf = buf.slice(head + 4 + len);
      if (msg.id != null && waits.has(msg.id)) { const w = waits.get(msg.id); waits.delete(msg.id); msg.error ? w.rej(new Error(msg.error.message)) : w.res(msg.result); }
    }
  });
  const send = (obj) => { const s = JSON.stringify(obj); child.stdin.write(`Content-Length: ${Buffer.byteLength(s)}\r\n\r\n${s}`); };
  const request = (method, params) => new Promise((res, rej) => { const i = ++id; const timer = setTimeout(() => { if (waits.has(i)) { waits.delete(i); rej(new Error(`${method}: no answer in 30 s`)); } }, 30000); timer.unref(); waits.set(i, { res: (v) => { clearTimeout(timer); res(v); }, rej: (e) => { clearTimeout(timer); rej(e); } }); send({ jsonrpc: '2.0', id: i, method, params }); });
  const notify = (method, params) => send({ jsonrpc: '2.0', method, params });
  const close = () => { try { child.kill(); } catch { /* gone */ } };
  return { request, notify, close, child };
}

/** Line (1-based) and column (0-based) of `symbol` in `file`, at its definition if there is one. */
function locate(lines, line, colOrSymbol) {
  if (/^\d+$/.test(String(colOrSymbol))) return { line, col: Number(colOrSymbol) };
  const text = lines[line - 1] || '';
  const re = new RegExp(`\\b${String(colOrSymbol).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  const m = re.exec(text);
  if (!m) throw new Error(`${colOrSymbol} is not on line ${line}`);
  return { line, col: m.index };
}

/**
 * Who references the symbol at `file:line` (col or symbol name) in `root`: `{ file, line, text }`,
 * the definition itself excluded. Throws when no server is available for the language.
 */
async function references(root, file, line, colOrSymbol) {
  root = resolve(root);
  const abs = resolve(root, file);
  const name = serverFor(abs);
  if (!name) throw new Error(`no language server for ${extname(abs) || file}`);
  const entry = findServer(name);
  if (!entry) throw Object.assign(new Error(`${SERVERS[name].bin} is not installed: \`npm install ${name === 'python' ? 'pyright' : 'typescript-language-server typescript'}\` in the plugin folder or in ATLAS_NODE_MODULES`), { missing: true });
  const lines = readFileSync(abs, 'utf8').split(/\r?\n/);
  const pos = locate(lines, Number(line), colOrSymbol);
  const lsp = rpc(entry, SERVERS[name].args, root);
  try {
    await lsp.request('initialize', { processId: process.pid, rootUri: pathToFileURL(root).href, workspaceFolders: [{ uri: pathToFileURL(root).href, name: 'root' }], capabilities: { textDocument: { references: {} } }, initializationOptions: name === 'python' ? { python: { analysis: { autoSearchPaths: true, diagnosticMode: 'openFilesOnly' } } } : {} });
    lsp.notify('initialized', {});
    lsp.notify('textDocument/didOpen', { textDocument: { uri: pathToFileURL(abs).href, languageId: SERVERS[name].language[extname(abs).toLowerCase()], version: 1, text: lines.join('\n') } });
    // a server needs a moment to see the workspace: ask again while the answer is empty
    let refs = [];
    // a big Python project takes pyright tens of seconds to analyse: keep asking for up to a minute
    const attempts = name === 'python' ? 30 : 6;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      refs = (await lsp.request('textDocument/references', { textDocument: { uri: pathToFileURL(abs).href }, position: { line: pos.line - 1, character: pos.col }, context: { includeDeclaration: false } })) || [];
      if (refs.length) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    const out = [];
    const cache = new Map();
    for (const r of refs) {
      const f = fileURLToPath(r.uri);
      if (!cache.has(f)) cache.set(f, existsSync(f) ? readFileSync(f, 'utf8').split(/\r?\n/) : []);
      const ln = r.range.start.line + 1;
      if (resolve(f) === abs && ln === pos.line) continue;
      out.push({ file: relative(root, f).replace(/\\/g, '/'), line: ln, text: (cache.get(f)[ln - 1] || '').trim().slice(0, 160) });
    }
    lsp.notify('exit', null); // no shutdown handshake: some servers never answer it, and the process is killed anyway
    return { server: name, refs: out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line) };
  } finally {
    lsp.close();
  }
}

function check() {
  return Object.keys(SERVERS).map((k) => `${k.padEnd(11)} ${SERVERS[k].bin.padEnd(28)} ${findServer(k) || 'not found'}`).join('\n');
}

async function main(argv) {
  const [cmd, ...pos] = argv;
  if (cmd === 'check') return check();
  if (cmd === 'refs') {
    if (!pos[0] || !pos[1] || !pos[2]) throw Object.assign(new Error('usage: refs <project-root> <file> <line> [<col>|<symbol>]'), { usage: true });
    const r = await references(pos[0], pos[1], pos[2], pos[3] ?? '0');
    if (!r.refs.length) return `no references (${r.server})`;
    return `${r.refs.length} references (${r.server})\n` + r.refs.map((x) => `  ${x.file}:${x.line}  ${x.text}`).join('\n');
  }
  throw Object.assign(new Error('usage: node lsp.mjs <refs|check> …'), { usage: true });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write((await main(process.argv.slice(2))) + '\n');
  } catch (err) {
    process.stderr.write(`lsp: ${err.message}\n`);
    process.exitCode = err.usage ? 2 : 1;
  }
}

export { references, findServer, serverFor, check, SERVERS };
