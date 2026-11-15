// atlas-prune — a function hook on `session.compact`. Off unless `~/.claude/atlas.json` has
// `"prune": true` (typed as `atlas prune on`) or the run carries ATLAS_PRUNE=1. When on, a compaction keeps the conversation
// word for word and drops only the tool calls and results that `prune.mjs` can show to be
// useless; when that frees less than `pruneMin` of it, or anything goes wrong, Claude Code's
// own summary runs as if this hook were not there.
//
// Left to the summary on purpose: a `/compact` typed with instructions (the person asked for a
// summary that stresses something) and a subagent's own transcript.
//
// Function hooks are early access in Claude Code and their contract moves between releases.
// This module asks for nothing beyond `session.compact`, `$.env.get`, `$.fs.read`, `$.ui.log`.

import { prune, line, DEFAULTS } from './prune.mjs';

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d);

/** The switch and its three numbers, or null when the switch is off or the file cannot be read. */
export async function settings($) {
  const dir = (await $.env.get('CLAUDE_CONFIG_DIR')) ||
    `${(await $.env.get('USERPROFILE')) || (await $.env.get('HOME')) || ''}/.claude`;
  // One run can be switched without the file: ATLAS_PRUNE=1 turns it on, =0 off. For benches.
  const env = await $.env.get('ATLAS_PRUNE');
  if (env === '0' || /(?:^|[,\s])(?:all|prune)(?:[,\s]|$)/i.test((await $.env.get('ATLAS_SKIP_HOOKS')) || '')) return null;
  let cfg = null;
  try { cfg = JSON.parse(await $.fs.read(`${dir}/atlas.json`)); } catch { cfg = null; }
  if (env !== '1' && (!cfg || cfg.prune !== true)) return null;
  cfg = cfg && typeof cfg === 'object' ? cfg : {};
  return {
    min: Math.min(num(cfg.pruneMin, DEFAULTS.min), 0.95),
    recent: Math.floor(num(cfg.pruneRecent, DEFAULTS.recent)),
    head: Math.floor(num(cfg.pruneHead, DEFAULTS.head)),
  };
}

export const register = (on) => {
  on('session.compact', async ($, e, next) => {
    if (e.agentId || e.instructions) return next(e);
    try {
      const cfg = await settings($);
      if (!cfg) return next(e);
      const r = prune(e.messages, cfg);
      if (r.ratio < cfg.min) {
        $.ui.log(`atlas prune: summary instead, under the ${Math.round(cfg.min * 100)}% minimum (${line(r)})`);
        return next(e);
      }
      $.ui.log(`atlas prune: no summary, ${line(r)}`);
      return { messages: r.messages };
    } catch (err) {
      $.ui.log(`atlas prune: summary instead (${err && err.message ? err.message : String(err)})`);
      return next(e);
    }
  });
};
