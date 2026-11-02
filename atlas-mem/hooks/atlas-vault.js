#!/usr/bin/env node
// atlas-vault — where the vault is: one rule for the three hooks and the labels tool.
//
// A `.atlas.json` arrives with whatever repository was cloned, so its "vault" is a request,
// not a setting. Taken as it was, a repository could choose where the pre-compaction hook
// writes the lines of your sessions: inside itself, ready to be committed, or a shared folder.
// So a project's vault is used only when `~/.claude/atlas.json` confirms that same path, as
// its "vault" or in its "vaults" list. An unconfirmed one is skipped as if absent;
// `pendingVault` names it, so the tool can say what to add. Then the user's own vault, then
// the Claude Code memory folder of the directory. Fails silent: no vault is null.
//
// The user file is `atlas.json` in the Claude config folder: CLAUDE_CONFIG_DIR when set, else
// ~/.claude. The same rule as atlas-config.js, so the file the tracker writes is the file read here.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

function readJson(file) {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

const claudeDir = () => process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
/** The user file, or {}. Read here so every memory hook reads the same one. */
const userConfig = () => readJson(path.join(claudeDir(), 'atlas.json')) || {};

const norm = (p) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));

/** `{ vault, pending }`: the vault to use (or null) and an unconfirmed project vault (or null). */
function resolveVault(cwd) {
  const user = userConfig();
  const mine = typeof user.vault === 'string' ? path.resolve(user.vault) : null;
  const confirmed = new Set([mine, ...(Array.isArray(user.vaults) ? user.vaults : [])].filter((v) => typeof v === 'string').map(norm));
  let pending = null;
  let dir = path.resolve(cwd || process.cwd());
  for (;;) {
    const c = readJson(path.join(dir, '.atlas.json'));
    if (c && typeof c.vault === 'string') {
      const v = path.resolve(dir, c.vault);
      if (confirmed.has(norm(v))) return { vault: v, pending: null };
      pending = v;
      break;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (mine) return { vault: mine, pending };
  const auto = path.join(claudeDir(), 'projects', path.resolve(cwd || process.cwd()).replace(/[^A-Za-z0-9]/g, '-'), 'memory');
  return { vault: fs.existsSync(auto) ? auto : null, pending };
}

const vaultFor = (cwd) => resolveVault(cwd).vault;
const pendingVault = (cwd) => resolveVault(cwd).pending;

module.exports = { vaultFor, pendingVault, resolveVault, userConfig, claudeDir };
