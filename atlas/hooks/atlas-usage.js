#!/usr/bin/env node
// atlas-usage — counts, on this machine and nowhere else, how often each ATLAS skill and
// subagent is called, so the ones nobody calls can be seen and dropped. Every description is
// paid for in every session; a skill never used is a permanent cost with no return.
//
//   PostToolUse on Skill, Agent, Task   a skill loaded or a subagent started by the model
//   UserPromptSubmit (from the tracker) a skill typed as /atlas-name
//   SessionStart (from atlas-activate)  one session more, on a fresh start only
//   `atlas usage`                       the table, with what was never called
//
// What is kept, in `~/.claude/atlas-state/usage.json`: names, counts, the date of the last
// call, the number of sessions. No prompt, no path, no argument, no name that is not ATLAS's.
// Nothing is sent anywhere. Deleting the file starts the count again.
//
// The idea — a hook on the Skill tool that counts what is actually invoked — after
// vercel/vercel-plugin (Apache-2.0), where the count goes to their servers. Here it stays.

'use strict';

const fs = require('fs');
const path = require('path');
const cfg = require('./atlas-config');

const file = () => path.join(cfg.stateDir(), 'usage.json');
const today = () => new Date().toISOString().slice(0, 10);
const DEDUPE_MS = 120000;

/** `atlas-plan` out of `atlas-code:atlas-plan`; null for anything that is not an ATLAS name. */
function nameOf(raw) {
  const n = String(raw || '').split(':').pop().trim().toLowerCase();
  return /^atlas-[a-z0-9-]+$/.test(n) ? n : null;
}

/** The count, an empty one when there is no file, null when the file cannot be read back. */
function read() {
  let text;
  try { text = fs.readFileSync(file(), 'utf8'); } catch (e) { return { since: today(), sessions: 0, skills: {}, agents: {} }; }
  try {
    const v = JSON.parse(text);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    return { since: v.since || today(), sessions: Number(v.sessions) || 0, skills: v.skills || {}, agents: v.agents || {}, last: v.last };
  } catch (e) { return null; }
}

// The state folder is made by the first session, which also says that ATLAS is installed and
// off. Making it here would swallow that notice, so before it exists nothing is counted.
function write(u) {
  if (!fs.existsSync(cfg.stateDir())) return false;
  try {
    const tmp = `${file()}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(u, null, 2) + '\n');
    fs.renameSync(tmp, file());
    return true;
  } catch (e) { return false; }
}

function bump(kind, name, session, now = Date.now()) {
  const u = read();
  if (!u || !name) return false;
  // A skill typed as /name is seen by the prompt hook, and in some hosts loaded through the
  // Skill tool a moment later: one call, counted once.
  const l = u.last;
  if (l && l.kind === kind && l.name === name && l.session === (session || '') && now - l.t < DEDUPE_MS) return false;
  const e = u[kind][name] || { n: 0 };
  u[kind][name] = { n: e.n + 1, last: today() };
  u.last = { kind, name, session: session || '', t: now };
  return write(u);
}

/** PostToolUse: a skill the model loaded, a subagent it started. */
function record(input, now) {
  if (!input || !input.tool_input) return false;
  if (input.tool_name === 'Skill') return bump('skills', nameOf(input.tool_input.skill), input.session_id, now);
  if (input.tool_name === 'Agent' || input.tool_name === 'Task') return bump('agents', nameOf(input.tool_input.subagent_type), input.session_id, now);
  return false;
}

/** UserPromptSubmit: `/atlas-recap`, `/atlas-code:atlas-recap`. The dial command is not a skill. */
function typed(prompt, session, now) {
  const m = /^\/(?:atlas(?:-[a-z0-9-]+)?:)?(atlas-[a-z0-9-]+)(?![\w:-])/.exec(String(prompt || '').trim().toLowerCase());
  return m ? bump('skills', m[1], session, now) : false;
}

/** SessionStart: one more session, when it is a new one and not a resume or a compaction. */
function session(input) {
  if (input && input.source && input.source !== 'startup') return false;
  const u = read();
  if (!u) return false;
  u.sessions += 1;
  return write(u);
}

/** What this build ships: its skills (the rules file is not called, so not listed) and its subagents. */
function shipped(root) {
  const names = (dir, keep) => { try { return fs.readdirSync(path.join(root, dir)).map(keep).filter(Boolean); } catch (e) { return []; } };
  return {
    skills: names('skills', (n) => (n !== 'atlas' && nameOf(n) ? n : null)),
    agents: names('agents', (n) => (n.endsWith('.md') ? nameOf(n.slice(0, -3)) : null)),
  };
}

/** The table `atlas usage` prints. */
function report(root) {
  const u = read();
  if (!u) return `usage: ${file()} could not be read; delete it to start the count again`;
  const ship = shipped(root);
  const rows = (kind) => Object.entries(u[kind]).sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]));
  const width = Math.max(12, ...[...Object.keys(u.skills), ...Object.keys(u.agents)].map((n) => n.length));
  const line = ([name, e]) => `  ${name.padEnd(width)}  ${String(e.n).padStart(4)}  last ${e.last}`;
  const out = [`ATLAS usage since ${u.since}, ${u.sessions} session${u.sessions === 1 ? '' : 's'}`];
  if (rows('skills').length) out.push('skills', ...rows('skills').map(line));
  if (rows('agents').length) out.push('subagents', ...rows('agents').map(line));
  if (!rows('skills').length && !rows('agents').length) out.push('nothing called yet');
  const never = [...ship.skills.filter((n) => !u.skills[n]), ...ship.agents.filter((n) => !u.agents[n]).map((n) => `${n} (subagent)`)];
  if (never.length) out.push('never called', `  ${never.join(', ')}`);
  return out.join('\n');
}

function main() {
  let input = {};
  try { if (!process.stdin.isTTY) input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch (e) { input = {}; }
  record(input);
}

// A hook that fails must not cost the user a tool call: always exit 0, never print.
// ATLAS_SKIP_HOOKS=name,name (or `all`) makes a hook do nothing for one run: for a bench that
// measures one hook without the others, and for finding which hook is behind a problem.
if (require.main === module && !/(?:^|[,\s])(?:all|usage)(?:[,\s]|$)/i.test(process.env.ATLAS_SKIP_HOOKS || '')) { try { main(); } catch (e) { /* nothing to say */ } process.exit(0); }

module.exports = { nameOf, read, record, typed, session, shipped, report, file };
