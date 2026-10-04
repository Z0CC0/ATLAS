#!/usr/bin/env node
// atlas-guard — one hook file for PreToolUse and Stop. Every switch is off
// unless a config file turns it on, and each works without the others.
//
//   guard   PreToolUse. A shell command that destroys or publishes: recursive
//           forced deletes, forced pushes, hard resets, dropped tables, package
//           publishes, skipped commit hooks. Answered with "ask": the user sees
//           the command and the reason, and decides. With "freeze" beside it, a
//           file written outside that one directory is asked about too.
//   gate    PreToolUse. The first edit of each file in a session is turned
//           back once, with the facts to look up before trying again: who
//           depends on the file, or who will call a new one. Asking a model
//           "are you sure" changes nothing; making it run the search does.
//   finish  Stop. Reads the end of the last answer for phrases that mean the
//           work is not as done as it sounds, and checks free disk space. It
//           warns the user; it never blocks and never sends the model back.
//
// Config, first found wins: the nearest `.atlas.json` at or above the working
// directory, then `~/.claude/atlas.json`.
//
//   { "guard": true }
//   { "guard": true, "freeze": "src/api" }
//   { "gate": true, "finish": true, "diskWarnGb": 5 }
//
// When this moves into the plugin it should read its settings through
// atlas-config.js instead of parsing the files itself.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

// One entry per kind of damage. `why` is shown to the user, so it says what the
// command does, not that it is "dangerous".
const RULES = [
  { re: /\brm\s+(?:-[a-z]*\s+)*-(?=[a-z]*r)(?=[a-z]*f)[a-z]+/i, why: 'deletes a directory tree without asking (rm -rf)' },
  { re: /\brm\s+(?:-[a-z]+\s+)*(?:-r\s+-f|-f\s+-r|--recursive\s+--force|--force\s+--recursive)\b/i, why: 'deletes a directory tree without asking (rm -r -f)' },
  { re: /\bRemove-Item\b(?=[^|;]*-Recurse)(?=[^|;]*-Force)/i, why: 'deletes a directory tree without asking (Remove-Item -Recurse -Force)' },
  { re: /\b(?:rd|rmdir)\s+\/s\b/i, why: 'deletes a directory tree (rd /s)' },
  { re: /\bgit\s+push\b(?![^|;&]*--force-with-lease)[^|;&]*(?:\s--force\b|\s-[a-z]*f[a-z]*\b)/i, why: 'overwrites the remote branch (git push --force)' },
  { re: /\bgit\s+reset\s+[^|;&]*--hard\b/i, why: 'discards uncommitted work (git reset --hard)' },
  { re: /\bgit\s+(?:checkout|restore)\s+(?:--\s+)?\.(?:\s|$)/i, why: 'discards every uncommitted change in this directory' },
  { re: /\bgit\s+clean\s+[^|;&]*-[a-z]*f/i, why: 'deletes untracked files (git clean -f)' },
  { re: /\bgit\s+branch\s+[^|;&]*-D\b/, why: 'deletes a branch that may not be merged (git branch -D)' },
  { re: /--no-verify\b/i, why: 'skips the commit or push hooks (--no-verify)' },
  { re: /\b(?:DROP\s+(?:TABLE|DATABASE|SCHEMA)|TRUNCATE\s+TABLE)\b/i, why: 'destroys database data (DROP / TRUNCATE)' },
  { re: /\bdocker\s+(?:system|volume)\s+prune\b|\bdocker\s+volume\s+rm\b/i, why: 'deletes Docker volumes or images' },
  { re: /\bkubectl\s+delete\b/i, why: 'deletes cluster resources (kubectl delete)' },
  { re: /\bterraform\s+destroy\b/i, why: 'destroys infrastructure (terraform destroy)' },
  { re: /\bchmod\s+(?:-[a-z]+\s+)*0?777\b/i, why: 'makes files writable by everyone (chmod 777)' },
  { re: /\b(?:npm|pnpm|yarn|bun)\s+publish\b|\bcargo\s+publish\b|\btwine\s+upload\b|\bgem\s+push\b/i, why: 'publishes a package, which cannot be fully withdrawn' },
  { re: /\bdd\s+[^|;&]*\bof=\/dev\/|\bmkfs(?:\.[a-z0-9]+)?\b/i, why: 'writes over a disk device' },
];

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);

function readJson(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

// Returns { config, dir } for the nearest project file, else the user's file.
function loadConfig(cwd) {
  let dir = path.resolve(cwd || process.cwd());
  for (;;) {
    const found = readJson(path.join(dir, '.atlas.json'));
    if (found) return { config: found, dir };
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const user = readJson(path.join(os.homedir(), '.claude', 'atlas.json'));
  return { config: user || {}, dir: path.resolve(cwd || process.cwd()) };
}

function matchCommand(command) {
  if (typeof command !== 'string') return null;
  const rule = RULES.find((r) => r.re.test(command));
  return rule ? rule.why : null;
}

// True when `file` is `root` or inside it. Compared case-insensitively on
// Windows, where the same folder can be spelled two ways.
function isInside(file, root) {
  const norm = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
  const rel = path.relative(norm(path.resolve(root)), norm(path.resolve(file)));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function decide(input) {
  const { config, dir } = loadConfig(input.cwd);
  if (config.guard !== true) return null;

  const tool = input.tool_name;
  const args = input.tool_input || {};

  if (SHELL_TOOLS.has(tool)) {
    const why = matchCommand(args.command);
    return why ? `ATLAS guard: this command ${why}.` : null;
  }

  if (WRITE_TOOLS.has(tool) && typeof config.freeze === 'string' && config.freeze) {
    const target = args.file_path || args.notebook_path;
    if (typeof target !== 'string') return null;
    const root = path.resolve(dir, config.freeze);
    const file = path.resolve(input.cwd || dir, target);
    if (!isInside(file, root)) {
      return `ATLAS guard: writes are frozen to ${config.freeze}; this file is outside it.`;
    }
  }
  return null;
}

// --- gate -------------------------------------------------------------------

// Files already turned back once in this session. Kept in the temp directory,
// one small file per session; without a session id nothing can be remembered,
// so the gate stays open rather than turning the same edit back forever.
function gatePath(sessionId) {
  const safe = String(sessionId).replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 80);
  return path.join(os.tmpdir(), `atlas-gate-${safe}.json`);
}

function gate(input) {
  const { config, dir } = loadConfig(input.cwd);
  if (config.gate !== true || !input.session_id) return null;
  if (!WRITE_TOOLS.has(input.tool_name)) return null;

  const args = input.tool_input || {};
  const target = args.file_path || args.notebook_path;
  if (typeof target !== 'string') return null;
  const file = path.resolve(input.cwd || dir, target);
  const key = process.platform === 'win32' ? file.toLowerCase() : file;

  const store = gatePath(input.session_id);
  const seen = readJson(store) || {};
  if (seen[key]) return null;
  seen[key] = 1;
  try { fs.writeFileSync(store, JSON.stringify(seen)); } catch { return null; }

  const name = path.basename(file);
  if (fs.existsSync(file)) {
    return `ATLAS gate: first edit of ${name} in this session. Before trying again, look up and state: ` +
      '(1) every file that imports or calls it, found by searching, not from memory; ' +
      '(2) the public names this change touches; ' +
      "(3) the user's instruction this edit serves, quoted. " +
      'Then repeat the edit. If other edits to this file were sent in the same batch, some may already have been applied: read the file first.';
  }
  return `ATLAS gate: ${name} does not exist yet. Before creating it, look up and state: ` +
    '(1) the file and line that will call it; ' +
    '(2) that no existing file already does this job, found by searching; ' +
    "(3) the user's instruction this file serves, quoted. " +
    'Then repeat the write.';
}

// --- finish -----------------------------------------------------------------

// Phrases in an answer that say the work is less done than it sounds. English
// only: an answer written in another language is not checked.
const UNFINISHED = [
  { re: /\bskip(?:ped|ping)?\s+(?:the\s+)?(?:tests?|checks?|lint(?:er|ing)?|type ?check)/i, what: 'tests or checks skipped' },
  { re: /\b(?:tests?|checks?|build|lint)\s+(?:(?:is|are|was|were)\s+)?(?:still\s+)?failing\b/i, what: 'something still failing' },
  { re: /\bpre-?existing\s+(?:bug|failure|error|issue|problem)s?\b/i, what: 'a failure set aside as pre-existing' },
  { re: /\b(?:left|leaving|leave)\s+(?:it\s+|this\s+|that\s+)?(?:as\s+)?(?:a\s+)?TODO\b/i, what: 'work left as a TODO' },
  { re: /\bshould\s+(?:now\s+)?(?:work|pass|be\s+fixed)\b/i, what: '"should work", which is not "was run"' },
  { re: /\b(?:did\s+not|didn't|could\s+not|couldn't|was\s+unable\s+to|haven't|have\s+not)\s+(?:run|verify|verified|test|tested|check|checked)\b/i, what: 'something not run or not verified' },
];

function matchUnfinished(text) {
  if (typeof text !== 'string') return [];
  return UNFINISHED.filter((u) => u.re.test(text)).map((u) => u.what);
}

// Text of the last assistant message, read from the tail of the transcript so a
// long session costs the same as a short one.
function lastAnswer(transcriptPath) {
  let tail;
  try {
    const size = fs.statSync(transcriptPath).size;
    const want = Math.min(size, 256 * 1024);
    const buf = Buffer.alloc(want);
    const fd = fs.openSync(transcriptPath, 'r');
    try { fs.readSync(fd, buf, 0, want, size - want); } finally { fs.closeSync(fd); }
    tail = buf.toString('utf8');
  } catch {
    return '';
  }
  const lines = tail.split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    let rec;
    try { rec = JSON.parse(lines[i]); } catch { continue; }
    if (!rec || rec.type !== 'assistant' || !rec.message) continue;
    const content = rec.message.content;
    const text = Array.isArray(content)
      ? content.filter((c) => c && c.type === 'text').map((c) => c.text).join('\n')
      : (typeof content === 'string' ? content : '');
    if (text.trim()) return text;
  }
  return '';
}

function freeGb(dir) {
  try {
    const s = fs.statfsSync(dir);
    return (Number(s.bavail) * Number(s.bsize)) / 1e9;
  } catch {
    return null;
  }
}

function finish(input) {
  const { config, dir } = loadConfig(input.cwd);
  if (config.finish !== true || input.stop_hook_active) return null;

  const notes = [];
  const found = matchUnfinished(lastAnswer(input.transcript_path));
  if (found.length) notes.push(`the last answer mentions ${found.join('; ')}`);

  const limit = typeof config.diskWarnGb === 'number' ? config.diskWarnGb : 5;
  const free = freeGb(dir);
  if (free !== null && free < limit) notes.push(`${free.toFixed(1)} GB free on this disk`);

  return notes.length ? `ATLAS finish check: ${notes.join('. ')}. Worth a look before treating the work as done.` : null;
}

// --- entry ------------------------------------------------------------------

function respond(input) {
  if (input.hook_event_name === 'Stop') {
    const warning = finish(input);
    return warning ? { systemMessage: warning } : null;
  }
  const ask = decide(input);
  if (ask) {
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: ask } };
  }
  const deny = gate(input);
  if (deny) {
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: deny } };
  }
  return null;
}

function main() {
  if (process.stdin.isTTY) return;
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => { raw += chunk; });
  process.stdin.on('end', () => {
    let input;
    try { input = JSON.parse(raw); } catch { return; }
    let out = null;
    try { out = respond(input || {}); } catch { return; }
    if (out) process.stdout.write(JSON.stringify(out));
  });
}

if (require.main === module) main();

module.exports = {
  RULES, UNFINISHED, matchCommand, matchUnfinished, isInside, decide, gate, finish, lastAnswer, gatePath, loadConfig,
};
