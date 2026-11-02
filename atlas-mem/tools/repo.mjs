/**
 * ATLAS memory — the files of a repository (graph, slice 2).
 *
 * When a symbol is no longer where a note left it, the other files of the repository are
 * searched for it. This lists those files: what git tracks plus what it does not ignore,
 * or, outside git, a walk that skips the usual generated folders. Big files and files
 * without a known source extension are left out: a definition is not looked for in a
 * bundle or an image.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'out', 'target', 'vendor', '.venv', 'venv', '__pycache__', '.next', '.nuxt', 'coverage', '.cache', '.atlas']);
const MAX_BYTES = 1024 * 1024;

const cache = new Map(); // repo → files, for the life of one process

function gitFiles(repo) {
  try {
    const out = execFileSync('git', ['-C', repo, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
    return out.split('\0').filter(Boolean);
  } catch {
    return null;
  }
}

function walk(repo) {
  const out = [];
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    let entries;
    try { entries = readdirSync(join(repo, rel), { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) stack.push(r); } else if (e.isFile()) out.push(r);
    }
  }
  return out;
}

/**
 * The source files of `repo`, as paths relative to it with forward slashes, limited to
 * extensions in `exts` (a Set of lower-case extensions with the dot) and to files under 1 MB.
 */
function listFiles(repo, exts) {
  if (!cache.has(repo)) cache.set(repo, gitFiles(repo) || walk(repo));
  const out = [];
  for (const rel of cache.get(repo)) {
    const file = rel.replace(/\\/g, '/');
    if (!exts.has(extname(file).toLowerCase())) continue;
    if (file.split('/').some((part) => SKIP_DIRS.has(part))) continue;
    try { if (statSync(join(repo, file)).size > MAX_BYTES) continue; } catch { continue; }
    out.push(file);
  }
  return out;
}

/** Forget the listings: the next call reads the disk again. */
const forget = () => cache.clear();

export { listFiles, forget, SKIP_DIRS, MAX_BYTES };
