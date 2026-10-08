#!/usr/bin/env node
/**
 * inbox-page — one HTML file to review the inbox away from the app: every candidate with its
 * title, description, body and source, grouped by source, with Accept / Reject buttons that
 * work offline. "Save decisions" downloads a JSON; `harvest.mjs inbox apply <vault> <json>`
 * then accepts and rejects for real. Nothing on the page touches the vault by itself.
 *
 *   node inbox-page.mjs <vault> <out.html> [--title "<page title>"]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const harvest = await import(pathToFileURL(join(HERE, 'harvest.mjs')).href);

const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The source label a candidate came from, shortened to what a person recognises. */
function groupOf(source) {
  const s = String(source || '');
  const doc = /^doc__(.+?)(?:__|$)/.exec(s);
  if (doc) return `document: ${doc[1]}`;
  const m = /^(?:C--Users-[^_]*?-)?(?:HUB-\d--APP-CLAUDE-THE-HUB-)?(THE-[A-Z]+|[A-Za-z0-9-]+?)__/.exec(s);
  if (m) return `session: ${m[1].replace(/-/g, ' ')}`;
  return s.slice(0, 40) || 'unknown';
}

function page(items, title) {
  const groups = new Map();
  for (const c of items) { const g = groupOf(c.source); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c); }
  const data = JSON.stringify(items.map((c) => ({ slug: c.slug, title: c.title || c.slug, description: c.description, type: c.type, source: c.source, body: c.body, group: groupOf(c.source) })));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{--bg:#0b0b0d;--panel:#141418;--text:#e8e8ec;--dim:#9a9aa6;--faint:#5c5c68;--red:#e0342b;--gold:#d9a51f;--line:rgba(255,255,255,.1)}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.5 system-ui,Segoe UI,Roboto,sans-serif}
header{position:sticky;top:0;background:var(--bg);border-bottom:1px solid var(--line);padding:10px 16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;z-index:2}
header input{flex:1;min-width:200px;background:var(--panel);border:1px solid var(--line);color:var(--text);padding:6px 10px;border-radius:8px;font:inherit}
button{background:var(--panel);border:1px solid var(--line);color:var(--text);padding:5px 10px;border-radius:8px;font:600 12px system-ui;cursor:pointer}
button.red{background:var(--red);border-color:var(--red);color:#fff}
button.on{outline:2px solid var(--gold)}
main{padding:12px 16px;max-width:1100px;margin:0 auto}
h2{font-size:13px;color:var(--dim);text-transform:uppercase;letter-spacing:.06em;margin:22px 0 8px;display:flex;gap:10px;align-items:center}
h2 button{font-size:11px;padding:3px 8px}
.card{border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:8px;background:rgba(255,255,255,.02)}
.card.accepted{border-color:var(--red)} .card.rejected{opacity:.45}
.row{display:flex;gap:8px;align-items:baseline;cursor:pointer}
.row b{flex:1;min-width:0;word-break:break-word}
.chip{font-size:10px;padding:1px 7px;border-radius:999px;border:1px solid var(--line);color:var(--dim)}
.chip.feedback{color:var(--red);border-color:var(--red)} .chip.user{color:var(--gold);border-color:var(--gold)}
.desc{color:var(--dim);font-size:12.5px;margin-top:3px} .src{color:var(--faint);font-size:10.5px;margin-top:2px;word-break:break-all}
pre{white-space:pre-wrap;word-break:break-word;font:12px/1.55 ui-monospace,Consolas,monospace;background:rgba(0,0,0,.35);border:1px solid var(--line);border-radius:8px;padding:10px;margin:8px 0 0;user-select:text}
.acts{display:flex;gap:6px;margin-top:8px} .acts .state{margin-left:auto;font-size:11px;color:var(--dim);align-self:center}
#count{color:var(--dim);font-size:12px}
</style></head><body>
<header>
  <input id="q" placeholder="filter: title, description, body, source…">
  <span id="types"></span>
  <span id="count"></span>
  <button id="save" class="red">Save decisions</button>
  <button id="clear">Clear</button>
</header>
<main id="main"></main>
<script>
const ITEMS = ${data};
const KEY = 'atlas-inbox-decisions';
let decisions = {}; try { decisions = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
let typeOn = null, q = '';
const esc = (s) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(decisions)); } catch {} };
function visible() { const t = q.trim().toLowerCase(); return ITEMS.filter((c) => (!typeOn || c.type === typeOn) && (!t || [c.title, c.description, c.body, c.source, c.group].some((s) => (s || '').toLowerCase().includes(t)))); }
function render() {
  const rows = visible(); const groups = new Map();
  for (const c of rows) { if (!groups.has(c.group)) groups.set(c.group, []); groups.get(c.group).push(c); }
  const acc = Object.values(decisions).filter((d) => d === 'accepted').length, rej = Object.values(decisions).filter((d) => d === 'rejected').length;
  document.getElementById('count').textContent = rows.length + ' shown · ' + acc + ' accepted · ' + rej + ' rejected · ' + (ITEMS.length - acc - rej) + ' undecided';
  const counts = {}; for (const c of ITEMS) counts[c.type] = (counts[c.type] || 0) + 1;
  document.getElementById('types').innerHTML = Object.keys(counts).sort().map((k) => '<button data-type="' + k + '" class="' + (typeOn === k ? 'on' : '') + '">' + k + ' ' + counts[k] + '</button>').join(' ');
  let html = '';
  for (const [g, list] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    html += '<h2>' + esc(g) + ' <span class="chip">' + list.length + '</span> <button data-all="accepted" data-group="' + esc(g) + '">accept all</button><button data-all="rejected" data-group="' + esc(g) + '">reject all</button></h2>';
    for (const c of list) {
      const d = decisions[c.slug] || '';
      html += '<div class="card ' + d + '" data-slug="' + esc(c.slug) + '"><div class="row" data-toggle="1"><b>' + esc(c.title) + '</b><span class="chip ' + esc(c.type) + '">' + esc(c.type) + '</span></div>'
        + '<div class="desc">' + esc(c.description) + '</div><div class="src">' + esc(c.source) + '</div>'
        + '<pre hidden>' + esc(c.body) + '</pre>'
        + '<div class="acts"><button class="red" data-dec="accepted">Accept</button><button data-dec="rejected">Reject</button><button data-dec="">Undo</button><span class="state">' + (d || 'undecided') + '</span></div></div>';
    }
  }
  document.getElementById('main').innerHTML = html || '<p style="color:var(--faint);text-align:center;padding:40px">nothing matches</p>';
}
document.getElementById('main').addEventListener('click', (e) => {
  const card = e.target.closest('.card'); const btn = e.target.closest('button');
  if (btn && btn.dataset.all) { const g = btn.dataset.group; for (const c of visible()) if (c.group === g) decisions[c.slug] = btn.dataset.all; persist(); render(); return; }
  if (!card) return;
  if (btn && 'dec' in btn.dataset) { if (btn.dataset.dec) decisions[card.dataset.slug] = btn.dataset.dec; else delete decisions[card.dataset.slug]; persist(); render(); return; }
  if (e.target.closest('[data-toggle]')) { const pre = card.querySelector('pre'); pre.hidden = !pre.hidden; }
});
document.getElementById('types').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; typeOn = typeOn === b.dataset.type ? null : b.dataset.type; render(); });
document.getElementById('q').addEventListener('input', (e) => { q = e.target.value; render(); });
document.getElementById('clear').addEventListener('click', () => { if (confirm('Forget every decision on this page?')) { decisions = {}; persist(); render(); } });
document.getElementById('save').addEventListener('click', () => {
  const out = { accepted: [], rejected: [] };
  for (const [slug, d] of Object.entries(decisions)) if (out[d]) out[d].push(slug);
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })); a.download = 'inbox-decisions.json'; a.click();
});
render();
</script></body></html>`;
}

function main(argv) {
  const pos = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--title');
  const ti = argv.indexOf('--title');
  if (pos.length < 2) throw new Error('usage: inbox-page.mjs <vault> <out.html> [--title "<title>"]');
  const items = JSON.parse(harvest.inboxList(pos[0], true));
  const out = resolve(pos[1]);
  writeFileSync(out, page(items, ti >= 0 ? argv[ti + 1] : 'Memory inbox'));
  return `written   ${out}  (${items.length} candidates)`;
}

export { page, groupOf, main };

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(main(process.argv.slice(2)) + '\n'); } catch (e) { process.stderr.write(`${e.message}\n`); process.exitCode = 1; }
}
