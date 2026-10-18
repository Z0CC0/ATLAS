/**
 * ATLAS — an application observed while it runs, for a few seconds, under its own
 * debugging ports. The only reader here that starts the program; it does so only when the
 * caller passes the person's yes, on the person's own software, and it stops the process
 * it started (by its id, never by name) when the time is up.
 *
 * Two doors: the Chromium remote-debugging port for every renderer (what pages exist, what
 * they request on the network, what they log, which bridge keys they see) and the Node
 * inspector of the main process (which IPC channels are really registered, which windows
 * exist with which preferences, which child processes are alive, the paths and versions).
 * Both speak the DevTools protocol over a WebSocket; Node's own WebSocket is enough.
 */

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const freePort = () => new Promise((res, rej) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function listTargets(port) {
  try { const r = await fetch(`http://127.0.0.1:${port}/json/list`); return r.ok ? await r.json() : null; } catch { return null; }
}

/** One DevTools session: send(method, params) → result; on(method, fn) for events. */
class Session {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.handlers = new Map(); }
  open() {
    return new Promise((res, rej) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = () => res(this);
      ws.onerror = (e) => rej(new Error(`websocket: ${e.message || 'failed'}`));
      ws.onmessage = (ev) => {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.id && this.pending.has(m.id)) { const { ok, ko } = this.pending.get(m.id); this.pending.delete(m.id); if (m.error) ko(new Error(m.error.message)); else ok(m.result); }
        else if (m.method && this.handlers.has(m.method)) for (const fn of this.handlers.get(m.method)) fn(m.params);
      };
    });
  }
  send(method, params) { const id = ++this.id; return new Promise((ok, ko) => { this.pending.set(id, { ok, ko }); this.ws.send(JSON.stringify({ id, method, params: params || {} })); setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); ko(new Error(`${method}: no answer in 10 s`)); } }, 10000); }); }
  on(method, fn) { if (!this.handlers.has(method)) this.handlers.set(method, []); this.handlers.get(method).push(fn); }
  async evaluate(expression) { const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; }
  close() { try { this.ws.close(); } catch { /* gone */ } }
}

/** The expression that asks the main process what it really holds. Returns JSON text. */
const MAIN_PROBE = `(() => {
  const req = typeof require === 'function' ? require : (process.mainModule && process.mainModule.require ? process.mainModule.require.bind(process.mainModule) : null);
  const out = { versions: process.versions, execPath: process.execPath, cwd: process.cwd(), argv: process.argv, pid: process.pid, envSecretNames: Object.keys(process.env).filter((k) => /KEY|TOKEN|SECRET|PASS/i.test(k)) };
  try { const hs = process._getActiveHandles(); out.children = hs.filter((h) => h && h.constructor && h.constructor.name === 'ChildProcess').map((h) => ({ pid: h.pid, file: h.spawnfile, args: (h.spawnargs || []).slice(0, 12) })); out.handles = hs.reduce((a, h) => { const k = h && h.constructor ? h.constructor.name : 'unknown'; a[k] = (a[k] || 0) + 1; return a; }, {}); } catch (e) { out.handlesError = String(e); }
  if (!req) { out.electronError = 'require not reachable from the inspector context'; return JSON.stringify(out); }
  try {
    const e = req('electron');
    const invoke = e.ipcMain._invokeHandlers ? [...e.ipcMain._invokeHandlers.keys()] : null;
    const on = e.ipcMain.eventNames().map(String);
    const wins = e.BrowserWindow.getAllWindows().map((w) => { let p = {}; try { p = w.webContents.getLastWebPreferences ? w.webContents.getLastWebPreferences() || {} : {}; } catch (x) { p = {}; } return { id: w.id, title: w.getTitle(), url: w.webContents.getURL(), visible: w.isVisible(), preferences: { contextIsolation: p.contextIsolation, nodeIntegration: p.nodeIntegration, sandbox: p.sandbox, webSecurity: p.webSecurity, preload: p.preload || null } }; });
    out.electron = { name: e.app.getName(), version: e.app.getVersion(), ready: e.app.isReady(), ipc: { handle: invoke, on }, windows: wins, paths: { userData: e.app.getPath('userData'), exe: e.app.getPath('exe'), temp: e.app.getPath('temp') }, loginItem: (() => { try { return e.app.getLoginItemSettings().openAtLogin; } catch (x) { return null; } })(), defaultProtocols: null };
  } catch (x) { out.electronError = String(x && x.message || x); }
  return JSON.stringify(out);
})()`;

const PAGE_PROBE = (keys) => `(() => {
  const out = { href: location.href, title: document.title, scripts: [...document.scripts].map((s) => s.src).filter(Boolean).slice(0, 50), frames: window.frames.length, bridges: {} };
  for (const k of ${JSON.stringify(keys)}) { try { const v = window[k]; if (v && typeof v === 'object') out.bridges[k] = Object.keys(v).slice(0, 200); } catch (e) { out.bridges[k] = String(e); } }
  const own = Object.getOwnPropertyNames(window).filter((k) => /api|bridge|electron|ipc|native/i.test(k) && !/^on/.test(k)).slice(0, 40);
  out.windowKeysOfInterest = own;
  return JSON.stringify(out);
})()`;

/**
 * Start the executable with debugging ports, read both sides for `seconds`, stop it.
 * `bridgeKeys` are the keys the static reading found, asked of every page.
 */
async function observe(exe, { seconds = 12, args = [], bridgeKeys = [], cwd } = {}) {
  const cdpPort = await freePort(), inspectPort = await freePort();
  const limitations = [];
  // the observed program inherits the caller's environment minus the caller's own secrets:
  // a token of the session that runs this reader is not the program's to see
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(CLAUDE|ANTHROPIC)/i.test(k)));
  const child = spawn(exe, [`--remote-debugging-port=${cdpPort}`, '--remote-allow-origins=*', `--inspect=${inspectPort}`, ...args], { cwd: cwd || undefined, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: false });
  const stderr = []; const stdout = [];
  child.stderr.on('data', (d) => { if (stderr.length < 200) stderr.push(String(d)); });
  child.stdout.on('data', (d) => { if (stdout.length < 200) stdout.push(String(d)); });
  const started = Date.now();
  const result = { pid: child.pid, exitCode: null, main: null, pages: [], network: { hosts: {}, requests: [], blocked: 0 }, console: [], exceptions: [], timeline: [] };
  let exited = false;
  child.on('exit', (code) => { exited = true; result.exitCode = code; });
  try {
    // main inspector
    let mainTargets = null;
    for (let i = 0; i < 60 && !exited; i += 1) { mainTargets = await listTargets(inspectPort); if (mainTargets && mainTargets.length) break; await sleep(250); }
    let main = null;
    if (mainTargets && mainTargets.length) {
      try { main = await new Session(mainTargets[0].webSocketDebuggerUrl).open(); await main.send('Runtime.enable'); result.main = JSON.parse(await main.evaluate(MAIN_PROBE)); result.timeline.push({ at: Date.now() - started, event: 'main probed' }); }
      catch (e) { limitations.push(`main process: inspector reached but the probe failed: ${e.message}`); }
    } else limitations.push(exited ? `the program exited after ${((Date.now() - started) / 1000).toFixed(1)} s (code ${result.exitCode})` : 'main process: no inspector target in 15 s (the inspect argument is ignored when the fuse is off, or the app rewrites its arguments)');
    // renderers
    let targets = null;
    for (let i = 0; i < 40 && !exited; i += 1) { targets = await listTargets(cdpPort); if (targets && targets.some((t) => t.type === 'page')) break; await sleep(250); }
    const sessions = [];
    if (targets && targets.length) {
      for (const t of targets.filter((x) => x.type === 'page' || x.type === 'webview').slice(0, 8)) {
        try {
          const s = await new Session(t.webSocketDebuggerUrl).open();
          sessions.push(s);
          await s.send('Network.enable'); await s.send('Runtime.enable');
          s.on('Network.requestWillBeSent', (p) => { try { const u = new URL(p.request.url); if (u.protocol === 'data:' || u.protocol === 'blob:') return; const host = u.protocol === 'file:' ? 'file' : u.host; result.network.hosts[host] = (result.network.hosts[host] || 0) + 1; if (result.network.requests.length < 300) result.network.requests.push({ at: Date.now() - started, method: p.request.method, url: p.request.url.slice(0, 200), page: t.id.slice(0, 8), initiator: p.initiator?.type || null }); } catch { /* odd url */ } });
          s.on('Network.loadingFailed', (p) => { if (p.blockedReason) result.network.blocked += 1; });
          s.on('Runtime.consoleAPICalled', (p) => { if (result.console.length < 200) result.console.push({ at: Date.now() - started, level: p.type, text: (p.args || []).map((a) => a.value !== undefined ? String(a.value) : a.description || a.type).join(' ').slice(0, 300), page: t.id.slice(0, 8) }); });
          s.on('Runtime.exceptionThrown', (p) => { if (result.exceptions.length < 100) result.exceptions.push({ at: Date.now() - started, text: (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || '').slice(0, 400), page: t.id.slice(0, 8) }); });
          result.pages.push({ id: t.id.slice(0, 8), type: t.type, title: t.title, url: t.url, probe: null, session: s });
        } catch (e) { limitations.push(`page ${t.url.slice(0, 80)}: ${e.message}`); }
      }
    } else limitations.push(exited ? 'no renderer: the program had exited' : 'no renderer reachable on the debugging port (the app filters its arguments, or opened no window in 10 s)');
    // let it live
    const remain = seconds * 1000 - (Date.now() - started);
    if (remain > 0) await sleep(remain);
    // probes at the end: pages (bridges, scripts), main again (channels registered late)
    for (const p of result.pages) { try { p.probe = JSON.parse(await p.session.evaluate(PAGE_PROBE(bridgeKeys))); } catch (e) { p.probeError = e.message; } delete p.session; }
    if (main && !exited) { try { const again = JSON.parse(await main.evaluate(MAIN_PROBE)); if (again.electron) result.main = again; } catch { /* keep the first */ } main.close(); }
    for (const s of sessions) s.close();
  } finally {
    if (!exited) {
      if (process.platform === 'win32') { await new Promise((r) => { const k = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); k.on('exit', r); k.on('error', r); }); }
      else { try { process.kill(-child.pid, 'SIGTERM'); } catch { try { child.kill('SIGTERM'); } catch { /* gone */ } } }
      result.timeline.push({ at: Date.now() - started, event: 'stopped by pid' });
    }
  }
  result.seconds = Number(((Date.now() - started) / 1000).toFixed(1));
  result.stderr = stderr.join('').slice(0, 2000) || null;
  result.stdout = stdout.join('').slice(0, 2000) || null;
  limitations.push(`${result.seconds} s of life with nothing clicked and nothing typed: what the program does on a click, after a login or on a timer longer than that is not seen`);
  return { result, limitations };
}

export { observe, Session, listTargets, freePort };
