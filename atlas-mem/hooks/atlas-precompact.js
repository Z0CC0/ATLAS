#!/usr/bin/env node
// atlas-precompact — PreCompact. Before Claude Code compacts the conversation, the lines
// of this session that read like a decision, a rule, a preference or a correction are
// pulled out of the transcript (the same extraction `harvest extract` applies to past
// sessions) and written to `<vault>/.atlas/harvest/<session>.md`. Compaction keeps a
// summary and drops the words; this keeps the words that matter, where `harvest run`
// will find them. Nothing enters the vault: the file is raw material for the inbox, and
// a candidate still needs the user's yes.
//
// The vault is found as the labels hook finds it: the nearest `.atlas.json` with
// `"vault"` at or above the working directory, then `~/.claude/atlas.json`, then the
// Claude Code memory folder of the working directory. No vault, or no transcript, or
// nothing decision-shaped in it: the hook writes nothing and says nothing. Always exits
// 0: compaction must never be held up by memory.
//
// The same file runs on SessionStart with the `compact` matcher, when the conversation
// resumes on its summary: the lines kept for this session come back as additional context,
// capped at 6 KB, so a decision made before the compaction is still in front of the model
// after it. That is the point of the pair: compaction keeps the gist, this keeps the rules.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

function readJson(file) {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function vaultFor(cwd) {
  let dir = path.resolve(cwd || process.cwd());
  for (;;) {
    const c = readJson(path.join(dir, '.atlas.json'));
    if (c && typeof c.vault === 'string') return path.resolve(dir, c.vault);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const user = readJson(path.join(os.homedir(), '.claude', 'atlas.json'));
  if (user && typeof user.vault === 'string') return path.resolve(user.vault);
  const auto = path.join(os.homedir(), '.claude', 'projects', path.resolve(cwd || process.cwd()).replace(/[^A-Za-z0-9]/g, '-'), 'memory');
  return fs.existsSync(auto) ? auto : null;
}

function readInput() {
  try {
    if (process.stdin.isTTY) return {};
    return JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

/** Writes the extraction; returns the file written, or null with the reason. */
async function keep(input, { toolsDir = path.join(__dirname, '..', 'tools') } = {}) {
  const transcript = input.transcript_path;
  if (typeof transcript !== 'string' || !fs.existsSync(transcript)) return { file: null, why: 'no transcript' };
  const vault = vaultFor(input.cwd);
  if (!vault || !fs.existsSync(vault)) return { file: null, why: 'no vault' };
  const harvest = await import(pathToFileURL(path.join(toolsDir, 'harvest.mjs')).href);
  const got = harvest.extractSession(transcript);
  // the extraction always keeps the first request of the session; alone, it is not a decision
  if (!got || got.turns < 2) return { file: null, why: 'nothing decision-shaped' };
  const dir = path.join(vault, '.atlas', 'harvest');
  fs.mkdirSync(dir, { recursive: true });
  const name = `${path.basename(transcript, '.jsonl')}.md`;
  const file = path.join(dir, name);
  // the same session compacts more than once: the later extraction covers the earlier
  // one (it reads the whole transcript), so the file is replaced, never appended
  fs.writeFileSync(file, `${got.text}\n(kept before compaction, ${new Date().toISOString().slice(0, 16)}; trigger: ${input.trigger || '?'})\n`);
  return { file, why: null, turns: got.turns };
}

const CAP = 6000; // characters: well under the 10 KB Claude Code hands the model whole

/** After compaction: the kept lines of this session, as additional context, or null. */
function restore(input) {
  const vault = vaultFor(input.cwd);
  if (!vault || typeof input.session_id !== 'string') return null;
  const file = path.join(vault, '.atlas', 'harvest', `${input.session_id}.md`);
  if (!fs.existsSync(file)) return null;
  let text = fs.readFileSync(file, 'utf8');
  // the header (session, project, dates) and the trailer are for the harvest, not for the model
  text = text.replace(/^# session[^\n]*\n(?:[a-z ]+: [^\n]*\n)*\n?/, '').replace(/\n\(kept before compaction[^\n]*\)\n?$/, '').trim();
  if (!text) return null;
  if (text.length > CAP) text = text.slice(0, CAP - 1).trimEnd() + '…';
  return `ATLAS memory — what this session decided before it was compacted (U = the user, A = the assistant); these hold unless the user says otherwise:\n\n${text}`;
}

async function main() {
  const input = readInput();
  try {
    if (input.hook_event_name === 'SessionStart') {
      const context = input.source === 'compact' ? restore(input) : null;
      if (context) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context } }));
      return;
    }
    await keep(input);
  } catch {
    // a broken transcript or an unreadable vault must not cost the user the compaction
  }
}

if (require.main === module) main().then(() => process.exit(0), () => process.exit(0));

module.exports = { keep, restore, vaultFor, CAP };
