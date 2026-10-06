#!/usr/bin/env node
/**
 * ATLAS memory — the deterministic part of "memory that does not lie".
 *
 * A model cannot compute a hash in its head, so every fingerprint, every comparison and
 * every relocation of a symbol happens here, never in prose. The notes stay plain markdown
 * in the vault; what this tool needs lives in one sidecar file the memory app never
 * rewrites: `<vault>/.atlas/links.json`.
 *
 *   node memcheck.mjs link    <vault> <slug> <repo> <file> [<first>-<last>] <symbol>
 *   node memcheck.mjs defs    <repo> <file> [<symbol>] [--json]
 *   node memcheck.mjs impact  <vault> <repo> <file> [<symbol>] [--json]
 *   node memcheck.mjs check   <vault> [--write] [--repo <path>] [--json]
 *   node memcheck.mjs unlink  <vault> <slug> [<symbol>]
 *   node memcheck.mjs rekey   <vault> <old-slug> <new-slug>
 *   node memcheck.mjs status  <vault> [--json]
 *
 * There is no "confirm" command on purpose. A note whose code changed and whose fact still
 * holds is linked again with the range the code has now: that retakes the fingerprint over
 * the right lines. Keeping the old range length would fingerprint half a function.
 *
 * Two ways to find a definition. With the optional parser installed (`parse.mjs`,
 * tree-sitter) the file is parsed: a name is a definition only where the grammar says so,
 * and the lines it spans are exact, so `link` needs no range. Without it, or for a language
 * with no grammar, text mode: a definition-shaped line, which knows the common shapes of a
 * dozen languages and nothing about their grammar. The sidecar format is the same for both.
 *
 * No required dependencies: Node 18 or later.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as parse from './parse.mjs';
import { listFiles, forget as forgetFiles } from './repo.mjs';

const SIDE_DIR = '.atlas';
const SIDE_FILE = 'links.json';
const TRUST = ['firm', 'suspect', 'unverified'];

// ---------------------------------------------------------------------------------------
// fingerprint

/**
 * The text a fingerprint is taken over. Line endings and trailing spaces are normalised:
 * git on Windows checks files out with CRLF, and editors strip trailing spaces, and
 * neither is a change to what the code does. Everything else counts, indentation included.
 */
function normalise(lines) {
  return lines.map((l) => l.replace(/[ \t]+$/, '')).join('\n');
}

function fingerprint(lines) {
  return 'sha256:' + createHash('sha256').update(normalise(lines), 'utf8').digest('hex').slice(0, 16);
}

function readLines(path) {
  let text = readFileSync(path, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r?\n/);
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function parseRange(range) {
  const m = /^(\d+)(?:-(\d+))?$/.exec(String(range).trim());
  if (!m) throw new Error(`not a line range: ${range} (expected 40-58 or 40)`);
  const first = Number(m[1]);
  const last = m[2] ? Number(m[2]) : first;
  if (first < 1 || last < first) throw new Error(`not a line range: ${range}`);
  return { first, last };
}

const fmtRange = (first, last) => (first === last ? String(first) : `${first}-${last}`);

// ---------------------------------------------------------------------------------------
// finding a symbol's definition, text mode

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const DEF_KEYWORDS =
  'function|def|class|interface|type|enum|struct|trait|impl|fn|func|fun|const|let|var|val|module|record|object|protocol|extension|namespace';
const MODIFIERS =
  '(?:export\\s+|default\\s+|declare\\s+|async\\s+|static\\s+|public\\s+|private\\s+|protected\\s+|internal\\s+|override\\s+|abstract\\s+|final\\s+|readonly\\s+|pub(?:\\([a-z]+\\))?\\s+|unsafe\\s+|inline\\s+|virtual\\s+|extern\\s+)*';
// A line that starts with one of these is a statement using the name, never its definition.
const NOT_A_TYPE = /^\s*(?:return|await|yield|throw|new|else|case|if|while|for|switch|delete|typeof|import|from|print|assert|del|raise|go|defer)\b/;

/**
 * True when `line` looks like the place `symbol` is defined, not a place it is used.
 * `next` is the following line: a definition without a keyword is only believed when its
 * body opens, on the same line or on the next (Allman braces).
 */
function isDefinition(line, symbol, next = '') {
  const s = escapeRe(symbol);
  const opens = /\{\s*$/.test(line) || /^\s*\{/.test(next);

  // `function refreshSession`, `def refresh_session`, `class Session`, `func (r *T) Name(`,
  // `const retries =`. The symbol must be the thing declared: `const x = refreshSession()`
  // has the keyword and the name on one line and is not a definition.
  if (new RegExp(`(?:^|[^\\w$])(?:${DEF_KEYWORDS})\\s+(?:\\([^)]*\\)\\s*)?${s}(?![\\w$])`).test(line)) return true;

  // `refreshSession = async (id) => {`, `refreshSession: function (id) {`
  if (new RegExp(`^\\s*${MODIFIERS}${s}\\s*[:=]\\s*(?:async\\s*)?(?:function\\b|\\([^)]*\\)\\s*(?::[^=]+)?=>|[A-Za-z_$][\\w$]*\\s*=>)`).test(line)) return true;

  // a method with no keyword: `async refreshSession(req) {`. A bare call has the same
  // shape, so the body must open.
  if (opens && new RegExp(`^\\s*${MODIFIERS}${s}\\s*(?:<[^>]*>)?\\s*\\([^;]*\\)\\s*(?::\\s*[^=;{]+)?\\s*\\{?\\s*$`).test(line)) return true;

  // a return type in front: `int refresh(int id) {`, `public void refresh() {`
  if (opens && !NOT_A_TYPE.test(line) && new RegExp(`^\\s*${MODIFIERS}[A-Za-z_][\\w<>\\[\\],.:*&?\\s]*?[\\s*&]${s}\\s*\\([^;]*\\)\\s*(?:const\\s*|throws\\s+[\\w.,\\s]+)?\\{?\\s*$`).test(line)) return true;

  return false;
}

/**
 * Every definition of `symbol` the grammar sees, with the lines it spans, or null when the
 * file cannot be parsed here (no parser installed, no grammar for the language, `file` not
 * given). A file with syntax errors in which the grammar finds nothing also gives null: the
 * error may be what hides the definition, so the text search gets its say.
 */
function parsedDefinitions(lines, symbol, file) {
  if (!file || !parse.ready(file)) return null;
  const parsed = parse.definitions(lines.join('\n'), file);
  if (!parsed) return null;
  const defs = parsed.defs.filter((d) => d.name === symbol);
  return !defs.length && parsed.broken ? null : defs;
}

/**
 * Every line (1-based) where `symbol` is defined. With `file` and a loaded grammar the
 * answer comes from the parse; otherwise from the shape of the line.
 */
function findDefinitions(lines, symbol, file = null) {
  const parsed = parsedDefinitions(lines, symbol, file);
  if (parsed) return [...new Set(parsed.map((d) => d.line))];
  const out = [];
  lines.forEach((line, i) => { if (isDefinition(line, symbol, lines[i + 1] || '')) out.push(i + 1); });
  return out;
}

// ---------------------------------------------------------------------------------------
// paths, git, the sidecar

/** One spelling per repository: absolute, forward slashes, and lower case where the OS ignores case. */
function normRepo(repo) {
  const abs = resolve(repo).replace(/\\/g, '/').replace(/\/+$/, '');
  return process.platform === 'win32' ? abs.toLowerCase() : abs;
}

function gitCommit(repo) {
  try {
    return execFileSync('git', ['-C', repo, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch {
    return null;
  }
}

function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const sidecarPath = (vault) => join(vault, SIDE_DIR, SIDE_FILE);

function loadSidecar(vault) {
  const p = sidecarPath(vault);
  if (!existsSync(p)) return { version: 1, notes: {} };
  const data = JSON.parse(readFileSync(p, 'utf8'));
  if (!data || typeof data !== 'object' || !data.notes || typeof data.notes !== 'object') throw new Error(`${p} is not an ATLAS memory sidecar`);
  return data;
}

function saveSidecar(vault, data) {
  const p = sidecarPath(vault);
  mkdirSync(dirname(p), { recursive: true });
  const notes = {};
  for (const k of Object.keys(data.notes).sort()) if ((data.notes[k].links || []).length) notes[k] = data.notes[k];
  const tmp = `${p}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify({ version: 1, notes }, null, 2) + '\n', 'utf8');
  renameSync(tmp, p);
}

function requireVault(vault) {
  if (!vault || !existsSync(vault) || !statSync(vault).isDirectory()) throw new Error(`vault not found: ${vault}`);
}

function requireSlug(slug) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(slug || '')) throw new Error(`not a note name: ${slug}`);
}

const noteExists = (vault, slug) => existsSync(join(vault, `${slug}.md`));

// ---------------------------------------------------------------------------------------
// one link, judged against the code as it is now

/**
 * Returns { state, reason?, first?, last? }. States:
 *   held         the stored lines still hash the same
 *   moved        the same code at other lines (harmless; `check --write` updates the lines)
 *   changed      the symbol is there, its code differs from when the note was written
 *   renamed      the same code under another name (same file or another): suspect, the
 *                note names a symbol that no longer exists
 *   gone         the symbol is no longer in the file, nor anywhere else in the repository
 *   missing      the file is not in the repository any more, and the code is nowhere else
 *   unreachable  the repository itself is not on this machine: nothing can be said
 *
 * `moved` can cross files: the same code found in another file of the repository is the
 * same code, and `check --write` records the new file.
 */
function judge(link) {
  if (!link.repo || !existsSync(link.repo)) return { state: 'unreachable', reason: `the repository ${link.repo} is not on this machine` };
  const path = join(link.repo, link.file);
  const { first, last } = parseRange(link.lines);
  const span = last - first;
  const anchor = Number.isInteger(link.anchor) ? link.anchor : 0;

  if (!existsSync(path)) {
    return elsewhere(link, span, anchor, null) || { state: 'missing', reason: `the file ${link.file} was moved or deleted, and its code is nowhere else in the repository` };
  }

  const lines = readLines(path);
  if (last <= lines.length && fingerprint(lines.slice(first - 1, last)) === link.fingerprint) return withDeps(link, { state: 'held', first, last });

  const defs = findDefinitions(lines, link.symbol, link.file);
  if (!defs.length) {
    return renamedIn(link, lines, link.file, span, anchor)
      || elsewhere(link, span, anchor, link.file)
      || { state: 'gone', reason: `${link.symbol} is no longer in ${link.file}, nor anywhere else in the repository` };
  }

  // Among several definitions of the name, one whose lines still hash the same is the one.
  for (const at of defs) {
    const nFirst = at - anchor;
    const nLast = nFirst + span;
    if (nFirst >= 1 && nLast <= lines.length && fingerprint(lines.slice(nFirst - 1, nLast)) === link.fingerprint) {
      return withDeps(link, { state: 'moved', first: nFirst, last: nLast, reason: `${link.symbol} moved from ${link.lines} to ${fmtRange(nFirst, nLast)}` });
    }
  }
  const was = first + anchor;
  const at = defs.reduce((best, d) => (Math.abs(d - was) < Math.abs(best - was) ? d : best), defs[0]);
  return { state: 'changed', at, reason: `${link.symbol} in ${link.file} changed since this note was written${link.commit ? ` (at ${link.commit})` : ''}; it is defined at line ${at} now` };
}

/**
 * The code of a held or moved link is intact; what it depends on may not be. Each recorded
 * dependency is judged like a link of its own (without dependencies of its own: depth one).
 * One of them changed, renamed, gone or missing → `dep-changed`. Moved dependencies are
 * fine, and `check --write` records where they went.
 */
function withDeps(link, result) {
  if (!Array.isArray(link.deps) || !link.deps.length) return result;
  const judged = link.deps.map((d) => ({ dep: d, ...judge({ ...d, repo: link.repo, deps: undefined }) }));
  result.deps = judged;
  const bad = judged.find((j) => BAD.has(j.state));
  if (!bad) return result;
  const where = `${bad.dep.file}:${bad.dep.lines}`;
  const what = bad.state === 'changed' ? 'changed' : bad.state === 'renamed' ? `was renamed${bad.to ? ` to ${bad.to}` : ''}` : bad.state === 'gone' ? 'is gone' : 'is in a file that is gone';
  return { ...result, state: 'dep-changed', reason: `${link.symbol} in ${link.file} is intact, but ${bad.dep.symbol} (${where}), which it depends on, ${what}` };
}

/**
 * The same code under another name, in `lines`: a definition whose body (every line of the
 * range but the one that names it) hashes like the body the link recorded. Only links that
 * carry a `body` fingerprint can say this; older links cannot.
 */
function renamedIn(link, lines, file, span, anchor) {
  if (!link.body || span < 1) return null;
  const parsed = parse.ready(file) ? parse.definitions(lines.join('\n'), file) : null;
  const starts = parsed ? [...new Set(parsed.defs.filter((d) => d.name !== link.symbol).map((d) => ({ name: d.name, at: d.line })))] : [];
  for (const { name, at } of starts) {
    const nFirst = at - anchor;
    const nLast = nFirst + span;
    if (nFirst < 1 || nLast > lines.length) continue;
    if (bodyFingerprint(lines.slice(nFirst - 1, nLast), anchor) === link.body) {
      return { state: 'renamed', first: nFirst, last: nLast, to: name, file, reason: `${link.symbol} seems renamed to ${name} in ${file}:${fmtRange(nFirst, nLast)} (same body); link the note again under the new name if the fact holds` };
    }
  }
  return null;
}

/**
 * The link's code in another file of the repository: the same fingerprint under the same
 * name is `moved`; the same body under another name is `renamed`. Files of the same language
 * are searched, the one the link named is skipped.
 */
function elsewhere(link, span, anchor, skip) {
  const ext = extname(link.file).toLowerCase();
  const exts = new Set([ext]);
  const grammar = parse.grammarOf(link.file);
  if (grammar) for (const [e, g] of Object.entries(parse.GRAMMAR_BY_EXT)) if (g === grammar) exts.add(e);

  let renamed = null;
  for (const file of listFiles(link.repo, exts)) {
    if (file === skip) continue;
    let lines;
    try { lines = readLines(join(link.repo, file)); } catch { continue; }
    for (const at of findDefinitions(lines, link.symbol, file)) {
      const nFirst = at - anchor;
      const nLast = nFirst + span;
      if (nFirst >= 1 && nLast <= lines.length && fingerprint(lines.slice(nFirst - 1, nLast)) === link.fingerprint) {
        return { state: 'moved', first: nFirst, last: nLast, file, reason: `${link.symbol} moved from ${link.file}:${link.lines} to ${file}:${fmtRange(nFirst, nLast)}` };
      }
    }
    if (!renamed) renamed = renamedIn(link, lines, file, span, anchor);
  }
  return renamed;
}

// ---------------------------------------------------------------------------------------
// dependencies (graph, slice 3)

const MAX_DEPS = 25;

/** Every command starts from the disk as it is now: the caches live for one command. */
function freshen() { indexes.clear(); forgetFiles(); }
const indexes = new Map(); // repo + grammar → Map name → [{ file, line, first, last }]

/**
 * Every definition in the files of `repo` written in the language of `file`, by name.
 * Built once per process; a check of many links into one repository parses it once.
 */
function symbolIndex(repo, file) {
  const grammar = parse.grammarOf(file);
  if (!grammar) return null;
  const key = `${repo}\n${grammar}`;
  if (indexes.has(key)) return indexes.get(key);
  const exts = new Set(Object.entries(parse.GRAMMAR_BY_EXT).filter(([, g]) => g === grammar).map(([e]) => e));
  const index = new Map();
  for (const f of listFiles(repo, exts)) {
    let lines;
    try { lines = readLines(join(repo, f)); } catch { continue; }
    const parsed = parse.ready(f) ? parse.definitions(lines.join('\n'), f) : null;
    if (!parsed) continue;
    for (const d of parsed.defs) {
      if (!index.has(d.name)) index.set(d.name, []);
      if (d.top) index.get(d.name).push({ file: f, line: d.line, first: d.first, last: d.last });
    }
  }
  indexes.set(key, index);
  return index;
}

/**
 * What the code in `lines[first..last]` of `file` depends on, as sub-links: each name it
 * uses that is defined in this repository, in the same file or in exactly one other file.
 * Only direct dependencies, only this repository, never a library. Null without a grammar.
 */
function depsOf(repo, file, lines, first, last, symbol) {
  const names = parse.references(lines.join('\n'), file, first, last);
  if (!names) return null;
  const index = symbolIndex(repo, file);
  if (!index) return null;
  const deps = [];
  for (const name of names) {
    if (name === symbol) continue;
    let defs = index.get(name);
    if (!defs) continue;
    // the same file wins; otherwise the name must be defined in one place only
    const here = defs.filter((d) => d.file === file && !(d.first >= first && d.last <= last));
    if (here.length) defs = here;
    else if (new Set(defs.map((d) => d.file)).size !== 1) continue;
    const d = defs[0];
    let depLines;
    try { depLines = d.file === file ? lines : readLines(join(repo, d.file)); } catch { continue; }
    const range = depLines.slice(d.first - 1, d.last);
    const dep = { file: d.file, symbol: name, lines: fmtRange(d.first, d.last), anchor: d.line - d.first, fingerprint: fingerprint(range) };
    if (d.last > d.first) dep.body = bodyFingerprint(range, d.line - d.first);
    deps.push(dep);
    if (deps.length >= MAX_DEPS) break;
  }
  return deps;
}

/** The fingerprint of a range without the line that names the symbol. */
function bodyFingerprint(lines, anchor) {
  return fingerprint(lines.filter((_, i) => i !== anchor));
}

const BAD = new Set(['changed', 'renamed', 'gone', 'missing', 'dep-changed']);

/** The trust a note has, from the states of its links. Unreachable links say nothing. */
function verdictOf(items, previous) {
  if (items.some((i) => BAD.has(i.state))) return 'suspect';
  if (items.some((i) => i.state === 'held' || i.state === 'moved')) return 'firm';
  return TRUST.includes(previous) ? previous : 'unverified';
}

// ---------------------------------------------------------------------------------------
// commands

function cmdLink(vault, slug, repo, file, range, symbol) {
  // `link <vault> <slug> <repo> <file> <symbol>`: no range given, the grammar supplies it.
  if (range && !symbol) { symbol = range; range = null; }
  if (!slug || !repo || !file || !symbol) throw new Error('usage: link <vault> <slug> <repo> <file> [<first>-<last>] <symbol>');
  requireVault(vault);
  requireSlug(slug);
  freshen();
  if (!noteExists(vault, slug)) throw new Error(`no note ${slug}.md in ${vault}: write the note first, then link it`);
  if (!existsSync(repo) || !statSync(repo).isDirectory()) throw new Error(`repository not found: ${repo}`);
  const root = resolve(repo);
  const rel = relative(root, resolve(root, file)).replace(/\\/g, '/');
  if (!rel || rel.startsWith('..')) throw new Error(`${file} is not inside ${repo}`);
  const path = join(root, rel);
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`file not found: ${path}`);

  const lines = readLines(path);
  if (!range) {
    const found = parsedDefinitions(lines, symbol, rel);
    if (!found) throw new Error(`${rel} cannot be parsed here (no parser, or no grammar for this language); give the range: link … ${rel} <first>-<last> ${symbol}`);
    if (!found.length) throw new Error(`${symbol} is not defined in ${rel}`);
    if (found.length > 1) throw new Error(`${symbol} is defined ${found.length} times in ${rel} (${found.map((d) => fmtRange(d.first, d.last)).join(', ')}); give the range of the one meant`);
    range = fmtRange(found[0].first, found[0].last);
  }
  const { first, last } = parseRange(range);
  if (last > lines.length) throw new Error(`${rel} has ${lines.length} lines; ${range} is past the end`);
  const inRange = findDefinitions(lines, symbol, rel).filter((d) => d >= first && d <= last);
  if (!inRange.length) throw new Error(`${symbol} is not defined inside ${rel}:${range}; give the range that holds its definition`);

  const link = {
    repo: normRepo(root),
    file: rel,
    lines: fmtRange(first, last),
    anchor: inRange[0] - first,
    symbol,
    fingerprint: fingerprint(lines.slice(first - 1, last)),
    body: last > first ? bodyFingerprint(lines.slice(first - 1, last), inRange[0] - first) : undefined,
    commit: gitCommit(root),
  };
  const deps = depsOf(link.repo, rel, lines, first, last, symbol);
  if (deps && deps.length) link.deps = deps;

  const side = loadSidecar(vault);
  const entry = side.notes[slug] || { links: [] };
  entry.links = (entry.links || []).filter((l) => !(l.repo === link.repo && l.file === link.file && l.symbol === link.symbol));
  entry.links.push(link);
  // One link retaken does not clear a note whose other links are still broken.
  const items = entry.links.map((l) => ({ link: l, ...judge(l) }));
  entry.trust = verdictOf(items, entry.trust);
  entry.checked = today();
  const reasons = items.filter((i) => BAD.has(i.state)).map((i) => i.reason);
  if (reasons.length) entry.reason = reasons; else delete entry.reason;
  side.notes[slug] = entry;
  saveSidecar(vault, side);
  const depLine = link.deps ? ` · depends on ${link.deps.length}: ${link.deps.map((d) => d.symbol).join(', ')}` : '';
  return `linked ${slug} → ${link.file}:${link.lines} (${symbol}) ${link.fingerprint}${link.commit ? ` @ ${link.commit}` : ''}${depLine} · note is ${entry.trust}`;
}

/** What `defs` prints: every definition in a file, or those of one name. */
function cmdDefs(repo, file, symbol, json) {
  if (!repo || !file) throw new Error('usage: defs <repo> <file> [<symbol>] [--json]');
  const path = join(resolve(repo), file);
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`file not found: ${path}`);
  const lines = readLines(path);
  const parsed = parse.ready(file) ? parse.definitions(lines.join('\n'), file) : null;
  if (!parsed) throw new Error(`${file} cannot be parsed here (no parser, or no grammar for this language)`);
  const defs = symbol ? parsed.defs.filter((d) => d.name === symbol) : parsed.defs;
  if (json) return JSON.stringify(defs, null, 2);
  if (!defs.length) return symbol ? `${symbol} is not defined in ${file}` : `no definitions in ${file}`;
  return defs.map((d) => `${fmtRange(d.first, d.last).padEnd(9)} ${d.name}  (${d.kind})`).join('\n')
    + (parsed.broken ? '\nnote: the file has syntax errors; the list may be incomplete' : '');
}

/**
 * What `impact` prints: the notes a change to this file (or this symbol in it) would touch,
 * because they are linked to it or depend on it.
 */
function cmdImpact(vault, repo, file, symbol, json) {
  if (!vault || !repo || !file) throw new Error('usage: impact <vault> <repo> <file> [<symbol>] [--json]');
  requireVault(vault);
  const root = normRepo(repo);
  const rel = file.replace(/\\/g, '/');
  const hits = [];
  for (const [slug, entry] of Object.entries(loadSidecar(vault).notes)) {
    for (const l of entry.links || []) {
      if (l.repo !== root) continue;
      if (l.file === rel && (!symbol || l.symbol === symbol)) hits.push({ slug, how: 'linked', symbol: l.symbol, file: l.file, lines: l.lines, trust: entry.trust });
      for (const d of l.deps || []) {
        if (d.file === rel && (!symbol || d.symbol === symbol)) hits.push({ slug, how: 'depends', symbol: l.symbol, via: d.symbol, file: d.file, lines: d.lines, trust: entry.trust });
      }
    }
  }
  if (json) return JSON.stringify(hits, null, 2);
  if (!hits.length) return `no note is linked to or depends on ${rel}${symbol ? `:${symbol}` : ''}`;
  return hits.map((h) => h.how === 'linked'
    ? `${h.slug}  linked to ${h.symbol} (${h.file}:${h.lines}) · ${h.trust}`
    : `${h.slug}  ${h.symbol} depends on ${h.via} (${h.file}:${h.lines}) · ${h.trust}`).join('\n');
}

function runCheck(vault, { write = false, repo = null } = {}) {
  requireVault(vault);
  freshen();
  const side = loadSidecar(vault);
  const only = repo ? normRepo(repo) : null;
  const results = [];

  for (const [slug, entry] of Object.entries(side.notes)) {
    if (!noteExists(vault, slug)) {
      results.push({ slug, verdict: 'orphan', items: [], reason: `no note ${slug}.md: the note was removed or renamed` });
      continue;
    }
    const all = entry.links || [];
    const links = all.filter((l) => !only || l.repo === only);
    if (!links.length) continue;

    const items = links.map((l) => ({ link: l, ...judge(l) }));
    const was = TRUST.includes(entry.trust) ? entry.trust : 'unverified';
    const partial = links.length < all.length;
    let verdict = verdictOf(items, was);
    // Only some of the note's links were looked at: good news about those cannot clear a
    // note that the others made suspect.
    if (partial && verdict === 'firm' && was === 'suspect') verdict = 'suspect';
    results.push({ slug, verdict, items, was, partial });

    if (write) {
      for (const i of items) {
        if (i.state === 'moved') { i.link.lines = fmtRange(i.first, i.last); if (i.file) i.link.file = i.file; }
        // a link made before body fingerprints or dependencies existed gets them while its
        // code is still intact
        if ((i.state === 'held' || i.state === 'moved') && (!i.link.body || !('deps' in i.link))) {
          const lines = readLines(join(i.link.repo, i.link.file));
          const anchor = Number.isInteger(i.link.anchor) ? i.link.anchor : 0;
          if (!i.link.body && i.last > i.first) i.link.body = bodyFingerprint(lines.slice(i.first - 1, i.last), anchor);
          if (!('deps' in i.link)) {
            const deps = depsOf(i.link.repo, i.link.file, lines, i.first, i.last, i.link.symbol);
            if (deps) i.link.deps = deps;
          }
        }
        if (i.deps) for (const j of i.deps) if (j.state === 'moved') { j.dep.lines = fmtRange(j.first, j.last); if (j.file) j.dep.file = j.file; }
      }
      const judged = items.some((i) => i.state !== 'unreachable');
      if (judged) {
        entry.trust = verdict;
        entry.checked = today();
        const reasons = items.filter((i) => BAD.has(i.state)).map((i) => i.reason);
        if (reasons.length) entry.reason = reasons;
        else if (!partial) delete entry.reason;
      }
    }
  }
  if (write) saveSidecar(vault, side);
  return results;
}

function report(results) {
  const noted = results.filter((r) => r.verdict !== 'orphan');
  const firm = noted.filter((r) => r.verdict === 'firm');
  const moved = firm.filter((r) => r.items.some((i) => i.state === 'moved')).length;
  const suspect = noted.filter((r) => r.verdict === 'suspect');
  const unreachable = noted.filter((r) => r.items.some((i) => i.state === 'unreachable'));
  const orphans = results.filter((r) => r.verdict === 'orphan');
  const out = [];
  out.push(`checked   ${noted.length} notes with code links`);
  out.push(`firm      ${firm.length} held${moved ? `; ${moved} had code that only moved` : ''}`);
  for (const r of firm) if (r.was === 'suspect') out.push(`  ${r.slug}  back to firm: its code is again what the note was written against`);
  out.push(`suspect   ${suspect.length}`);
  for (const r of suspect) {
    const bad = r.items.filter((i) => BAD.has(i.state));
    if (bad.length) for (const i of bad) out.push(`  ${r.slug}  ${i.reason}`);
    else out.push(`  ${r.slug}  still suspect from an earlier check (only some of its links were looked at)`);
  }
  if (unreachable.length) {
    out.push(`not checked ${unreachable.length}`);
    for (const r of unreachable) for (const i of r.items) if (i.state === 'unreachable') out.push(`  ${r.slug}  ${i.reason}`);
  }
  if (orphans.length) {
    out.push(`orphan    ${orphans.length}`);
    for (const r of orphans) out.push(`  ${r.slug}  ${r.reason}`);
  }
  return out.join('\n');
}

function cmdUnlink(vault, slug, symbol) {
  requireVault(vault);
  requireSlug(slug);
  const side = loadSidecar(vault);
  const entry = side.notes[slug];
  if (!entry) return `${slug} had no links`;
  if (symbol) {
    const before = entry.links.length;
    entry.links = entry.links.filter((l) => l.symbol !== symbol);
    if (entry.links.length === before) return `${slug} had no link to ${symbol}`;
    if (entry.links.length) {
      const items = entry.links.map((l) => ({ link: l, ...judge(l) }));
      entry.trust = verdictOf(items, entry.trust);
      const reasons = items.filter((i) => BAD.has(i.state)).map((i) => i.reason);
      if (reasons.length) entry.reason = reasons; else delete entry.reason;
    }
  } else {
    entry.links = [];
  }
  saveSidecar(vault, side);
  return symbol ? `unlinked ${slug} from ${symbol}` : `unlinked ${slug}`;
}

function cmdRekey(vault, from, to) {
  requireVault(vault);
  requireSlug(from);
  requireSlug(to);
  if (from === to) throw new Error('rekey needs two different names');
  const side = loadSidecar(vault);
  const src = side.notes[from];
  if (!src) return `${from} had no links`;
  const dst = side.notes[to] || { links: [] };
  const key = (l) => `${l.repo}|${l.file}|${l.symbol}`;
  const seen = new Set((dst.links || []).map(key));
  dst.links = dst.links || [];
  for (const l of src.links || []) if (!seen.has(key(l))) dst.links.push(l);
  const order = { suspect: 2, unverified: 1, firm: 0 };
  dst.trust = [dst.trust, src.trust].filter((t) => TRUST.includes(t)).sort((a, b) => order[b] - order[a])[0] || 'unverified';
  dst.checked = [dst.checked, src.checked].filter(Boolean).sort()[0];
  const reasons = [...(dst.reason || []), ...(src.reason || [])];
  if (reasons.length) dst.reason = reasons;
  side.notes[to] = dst;
  delete side.notes[from];
  saveSidecar(vault, side);
  return `rekeyed ${from} → ${to} (${dst.links.length} links, trust ${dst.trust})`;
}

function status(vault) {
  requireVault(vault);
  const side = loadSidecar(vault);
  const counts = { firm: 0, suspect: 0, unverified: 0 };
  for (const e of Object.values(side.notes)) counts[TRUST.includes(e.trust) ? e.trust : 'unverified'] += 1;
  return { notes_with_links: Object.keys(side.notes).length, ...counts };
}

// ---------------------------------------------------------------------------------------
// entry

function main(argv) {
  const [cmd, ...rest] = argv;
  const flag = (name) => rest.includes(name);
  const opt = (name) => { const i = rest.indexOf(name); return i >= 0 ? rest[i + 1] : null; };
  const pos = rest.filter((a, i) => !a.startsWith('--') && !(i > 0 && rest[i - 1] === '--repo'));

  switch (cmd) {
    case 'link': return cmdLink(...pos);
    case 'defs': return cmdDefs(pos[0], pos[1], pos[2], flag('--json'));
    case 'impact': return cmdImpact(pos[0], pos[1], pos[2], pos[3], flag('--json'));
    case 'check': {
      const results = runCheck(pos[0], { write: flag('--write'), repo: opt('--repo') });
      return flag('--json') ? JSON.stringify(results, null, 2) : report(results);
    }
    case 'unlink': return cmdUnlink(pos[0], pos[1], pos[2]);
    case 'rekey': return cmdRekey(pos[0], pos[1], pos[2]);
    case 'status': {
      const s = status(pos[0]);
      return flag('--json') ? JSON.stringify(s) : `notes with code links ${s.notes_with_links} · firm ${s.firm} · suspect ${s.suspect} · unverified ${s.unverified}`;
    }
    default:
      throw Object.assign(new Error('usage: node memcheck.mjs <link|check|defs|impact|unlink|rekey|status> …'), { usage: true });
  }
}

/**
 * Load the grammars a command will need, before it runs: loading is asynchronous, the
 * commands are not. Never throws; with no parser every command works in text mode.
 */
async function prepare(argv) {
  const [cmd] = argv;
  // all of them: a check may have to search a whole repository, and loading all takes ~90 ms
  if (cmd === 'check' || cmd === 'link' || cmd === 'defs' || cmd === 'impact') await parse.load(Object.keys(parse.GRAMMAR_BY_EXT).map((e) => `x${e}`));
}

// Nothing runs on import: a test that loads this file must not touch a vault.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await prepare(process.argv.slice(2));
    process.stdout.write(main(process.argv.slice(2)) + '\n');
  } catch (err) {
    process.stderr.write(`memcheck: ${err.message}\n`);
    // not process.exit: with a WASM grammar loaded it can crash the process on Windows
    process.exitCode = err.usage ? 2 : 1;
  }
}

export { normalise, fingerprint, readLines, parseRange, isDefinition, findDefinitions, parsedDefinitions, judge, verdictOf, runCheck, report, status, prepare, main };
