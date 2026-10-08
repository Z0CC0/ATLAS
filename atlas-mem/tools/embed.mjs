#!/usr/bin/env node
/**
 * ATLAS memory — search by meaning, locally.
 *
 * The index and the descriptions find a note by its words. This finds it by what it means:
 * "the database choice" reaches a note that says "why Postgres and not SQLite". Every note
 * is turned into a vector once (name, description, body) by a small multilingual model that
 * runs on this machine; a query is turned into a vector the same way, and the nearest notes
 * come back whole, never as fragments. Nothing leaves the machine; the model (about 130 MB)
 * is downloaded once, the first time, into ~/.atlas/models (or ATLAS_MODELS).
 *
 *   node embed.mjs index  <vault>                 (re)build <vault>/.atlas/embeddings.json
 *   node embed.mjs search <vault> "<query>" [--k 8] [--json]
 *   node embed.mjs status <vault>
 *
 * Optional: it needs the `@huggingface/transformers` package. It is looked for beside this
 * file, then in the folder named by ATLAS_NODE_MODULES, then in the usual places. Without
 * it every command says so and the word search stays the only one. The index keeps a hash
 * of each note, so `index` re-embeds only what changed.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const indexPath = (vault) => join(vault, '.atlas', 'embeddings.json');
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16);

let pipe = null;
/** The embedding pipeline, or null when the library is not installed. */
async function loadModel() {
  if (pipe) return pipe;
  const bases = [HERE, process.env.ATLAS_NODE_MODULES && dirname(process.env.ATLAS_NODE_MODULES), process.cwd()].filter(Boolean);
  let lib = null;
  for (const b of bases) {
    try { const req = createRequire(join(b, 'x.js')); const p = req.resolve('@huggingface/transformers'); lib = await import(pathToFileURL(p).href); break; } catch { /* next */ }
  }
  if (!lib) return null;
  // the model (about 130 MB) lives in the user's home, never inside the plugin or its builds
  lib.env.cacheDir = process.env.ATLAS_MODELS || join(homedir(), '.atlas', 'models');
  mkdirSync(lib.env.cacheDir, { recursive: true });
  lib.env.allowLocalModels = true;
  pipe = await lib.pipeline('feature-extraction', MODEL, { dtype: 'q8' });
  return pipe;
}

async function embed(texts) {
  const p = await loadModel();
  if (!p) throw Object.assign(new Error('@huggingface/transformers is not installed: `npm install @huggingface/transformers` in the plugin folder, or set ATLAS_NODE_MODULES; until then only the word search works'), { missing: true });
  const out = [];
  for (let i = 0; i < texts.length; i += 8) {
    const batch = texts.slice(i, i + 8);
    const t = await p(batch, { pooling: 'mean', normalize: true });
    const dims = t.dims[1];
    for (let j = 0; j < batch.length; j += 1) out.push(Array.from(t.data.slice(j * dims, (j + 1) * dims)).map((x) => Math.round(x * 1e4) / 1e4));
  }
  return out;
}

/** Whether the library is on this machine, without loading the model (that would download 130 MB). */
function libraryInstalled() {
  for (const b of [HERE, process.env.ATLAS_NODE_MODULES ? dirname(process.env.ATLAS_NODE_MODULES) : null, process.cwd()].filter(Boolean)) {
    try { createRequire(join(b, 'x.js')).resolve('@huggingface/transformers'); return true; } catch { /* next */ }
  }
  return false;
}

function notesOf(vault) {
  return readdirSync(vault).filter((f) => f.endsWith('.md') && f !== 'MEMORY.md').map((f) => {
    const text = readFileSync(join(vault, f), 'utf8').replace(/<private>[\s\S]*?<\/private>/gi, ' ');
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
    const fm = m ? m[1] : '';
    const get = (k) => { const r = new RegExp(`^${k}:\\s*(.*)$`, 'm').exec(fm); return r ? r[1].trim().replace(/^"|"$/g, '') : ''; };
    const body = (m ? m[2] : text).trim();
    const slug = basename(f, '.md');
    const passage = `${get('name') || slug}. ${get('description')}. ${body}`.slice(0, 2000);
    // a second, short text: the name and the description alone. A question is short and
    // about one thing; against the whole body the signal drowns (measured on 30 questions:
    // body alone found 11 at the first place, the best of the two 21)
    const head = `${slug.replace(/-/g, ' ')}. ${get('description')}`;
    return { slug, description: get('description'), passage, head, hash: sha(passage + '\n' + head) };
  });
}

const RECIPE = 2; // 1: one vector per note; 2: two (whole note, and name + description)
const empty = () => ({ model: MODEL, recipe: RECIPE, notes: {} });
function loadIndex(vault) {
  if (!existsSync(indexPath(vault))) return empty();
  try { const i = JSON.parse(readFileSync(indexPath(vault), 'utf8')); return i && i.notes && i.recipe === RECIPE && i.model === MODEL ? i : empty(); } catch { return empty(); }
}

/** Embeds the notes whose text changed since the last run; drops the ones that are gone. */
async function index(vault) {
  const notes = notesOf(vault);
  const idx = loadIndex(vault);
  if (idx.model !== MODEL) idx.notes = {};
  idx.model = MODEL;
  const todo = notes.filter((n) => !idx.notes[n.slug] || idx.notes[n.slug].hash !== n.hash);
  if (todo.length) {
    const vecs = await embed(todo.map((n) => n.passage));
    const heads = await embed(todo.map((n) => n.head));
    todo.forEach((n, i) => { idx.notes[n.slug] = { hash: n.hash, v: vecs[i], h: heads[i] }; });
  }
  const live = new Set(notes.map((n) => n.slug));
  let dropped = 0;
  for (const slug of Object.keys(idx.notes)) if (!live.has(slug)) { delete idx.notes[slug]; dropped += 1; }
  idx.built = new Date().toISOString().slice(0, 10);
  mkdirSync(join(vault, '.atlas'), { recursive: true });
  writeFileSync(indexPath(vault), JSON.stringify(idx));
  return `indexed   ${notes.length} notes · ${todo.length} embedded now · ${dropped} dropped · model ${MODEL}`;
}

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i += 1) s += a[i] * b[i]; return s; };

/** The notes nearest to the query, by meaning: `{ slug, score, description }`, best first. */
async function search(vault, query, k = 8) {
  const idx = loadIndex(vault);
  const slugs = Object.keys(idx.notes);
  if (!slugs.length) throw new Error(`no index in ${vault}: run \`embed index\` first`);
  const [q] = await embed([query]);
  const descs = new Map(notesOf(vault).map((n) => [n.slug, n.description]));
  const scoreOf = (n) => Math.max(dot(q, n.v), n.h ? dot(q, n.h) : -1);
  return slugs.map((slug) => ({ slug, score: Number(scoreOf(idx.notes[slug]).toFixed(3)), description: descs.get(slug) || '' })).sort((a, b) => b.score - a.score).slice(0, k);
}

function status(vault) {
  const idx = loadIndex(vault);
  const n = Object.keys(idx.notes).length;
  const notes = notesOf(vault);
  const stale = notes.filter((x) => !idx.notes[x.slug] || idx.notes[x.slug].hash !== x.hash).length;
  return { indexed: n, notes: notes.length, stale, built: idx.built || null, model: MODEL, installed: null };
}

async function main(argv) {
  const [cmd, ...rest] = argv;
  const opt = (n) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : null; };
  const flag = (n) => rest.includes(n);
  const pos = rest.filter((a, i) => !a.startsWith('--') && !(i > 0 && rest[i - 1] === '--k'));
  const vault = pos[0] && resolve(pos[0]);
  if (!vault || !existsSync(vault)) throw Object.assign(new Error('usage: node embed.mjs <index|search|status> <vault> …'), { usage: true });
  switch (cmd) {
    case 'index': return index(vault);
    case 'search': {
      if (!pos[1]) throw Object.assign(new Error('usage: search <vault> "<query>" [--k 8] [--json]'), { usage: true });
      const k = Number(opt('--k') || 8);
      if (!Number.isInteger(k) || k < 1) throw Object.assign(new Error('--k must be a whole number of at least 1'), { usage: true });
      const r = await search(vault, pos.slice(1).join(' '), k);
      return flag('--json') ? JSON.stringify(r, null, 2) : r.map((x) => `${x.score.toFixed(3)}  ${x.slug.padEnd(44)} ${x.description.slice(0, 80)}`).join('\n');
    }
    case 'status': { const s = status(vault); s.installed = libraryInstalled(); return `index     ${s.indexed} of ${s.notes} notes · ${s.stale} stale · built ${s.built || 'never'} · library ${s.installed ? 'present' : 'missing'}`; }
    default: throw Object.assign(new Error('usage: node embed.mjs <index|search|status> <vault> …'), { usage: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write((await main(process.argv.slice(2))) + '\n');
  } catch (err) {
    process.stderr.write(`embed: ${err.message}\n`);
    process.exitCode = err.usage ? 2 : 1;
  }
}

export { index, search, status, embed, loadModel, notesOf, MODEL };
