// atlas-status — the dials that are on, pinned under the prompt: `atlas low · check · prune`.
// A status line is drawn by the interface and never enters the conversation, so it costs no
// tokens; `atlas status` answers the same question for one turn's worth of them. When every
// dial is off the line is removed, and `"statusline": false` in `~/.claude/atlas.json`
// (typed as `atlas statusline off`) removes it for good.
//
// It reads what the command hooks wrote: the state file of the project the session runs in,
// found the way hooks/atlas-config.js finds it (the folder walked up to the nearest `.git` or
// `.atlas.json`, its path with every character that is not a letter or a digit turned to `-`).
//
// Function hooks are early access in Claude Code: without CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1
// this module is not loaded and nothing is drawn.
//
// The idea of the state always on screen after Yeachan-Heo/oh-my-claudecode (MIT, its HUD).

const SEP = /[\\/]/;

/** The folders from `cwd` up to the root, nearest first. */
export function ancestors(cwd) {
  let dir = String(cwd || '').replace(/[\\/]+$/, '');
  const out = [];
  for (let i = 0; i < 64 && dir; i++) {
    out.push(/^[A-Za-z]:$/.test(dir) ? dir + '\\' : dir);
    const cut = Math.max(dir.lastIndexOf('/'), dir.lastIndexOf('\\'));
    if (cut < 0) break;
    const up = dir.slice(0, cut);
    if (up === dir) break;
    dir = up;
  }
  if (String(cwd || '').startsWith('/') && out[out.length - 1] !== '/') out.push('/');
  return out;
}

/** The project a session in `cwd` belongs to. */
export async function rootOf(cwd, exists) {
  const dirs = ancestors(cwd);
  for (const d of dirs) {
    const base = d.replace(/[\\/]+$/, '');
    const sep = SEP.test(d) && d.includes('\\') ? '\\' : '/';
    if ((await exists(`${base}${sep}.git`)) || (await exists(`${base}${sep}.atlas.json`))) return d;
  }
  return dirs[0] || '';
}

export const slug = (root) => String(root).replace(/[^A-Za-z0-9]/g, '-');

/** `atlas low · ask · check · silent · prune`, or undefined when there is nothing to show. */
export function text(raw, prune = false) {
  const [level, rigour, check, silent] = String(raw || '').trim().toLowerCase().split(':');
  const on = [];
  if (level === 'low' || level === 'high') on.push(level);
  if (rigour === 'ask') on.push('ask');
  if (check === 'on') on.push('check');
  if (silent === 'on') on.push('silent');
  if (prune) on.push('prune');
  return on.length ? `atlas ${on.join(' · ')}` : undefined;
}

const roots = new Map();

export async function line($) {
  if (/(?:^|[,\s])(?:all|statusline)(?:[,\s]|$)/i.test((await $.env.get('ATLAS_SKIP_HOOKS')) || '')) return undefined;
  const dir = (await $.env.get('CLAUDE_CONFIG_DIR')) ||
    `${(await $.env.get('USERPROFILE')) || (await $.env.get('HOME')) || ''}/.claude`;
  let cfg = {};
  try { cfg = JSON.parse(await $.fs.read(`${dir}/atlas.json`)) || {}; } catch { cfg = {}; }
  if (cfg.statusline === false) return undefined;
  const cwd = await $.session.cwd();
  if (!roots.has(cwd)) roots.set(cwd, await rootOf(cwd, (p) => $.fs.exists(p).catch(() => false)));
  let raw = '';
  try { raw = await $.fs.read(`${dir}/atlas-state/${slug(roots.get(cwd))}.state`); } catch { raw = ''; }
  return text(raw, cfg.prune === true);
}

// Declared here and not inside `register`: the engine follows `$` only into functions of the
// file's top level.
async function draw($) {
  try { $.ui.status(await line($)); } catch { /* a status line is never worth a turn */ }
}

export const register = (on) => {
  on('session.start', async ($, e, next) => { const r = await next(e); await draw($); return r; });
  // The command hooks change the state while the prompt is submitted: read it after they ran.
  on('prompt.submit', async ($, e, next) => { const r = await next(e); await draw($); return r; });
  on('turn.complete', async ($, e, next) => { const r = await next(e); await draw($); return r; });
};
