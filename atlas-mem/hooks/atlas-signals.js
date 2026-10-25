#!/usr/bin/env node
// atlas-signals — Stop. One sign in the transcript that a note is due: a check failed then passed
// after an edit (`fixed`), a correction then code work (`corrected`), a git undo with no commit
// after it (`undone`), an option picked (`chose`). The best is the reason for one more turn: a
// note per `write.md`, or nothing to keep. Writes nothing; three asks a session, each sign once,
// `undone` once a session; silent without a vault or under stop_hook_active; exit 0 always.
// Signs after trailhq/Trail-Code `src/claude/note-signals.ts` (MIT); correction lead/neutraliser
// idea from BayramAnnakov/claude-reflect (MIT).
'use strict';
const fs = require('fs'); const os = require('os'); const path = require('path');

const MAX_ASKS = 3;
const MARK = '[atlas signal ';
const CHECK = /(?:^|[;&|(]\s*|\s)((?:npx\s+|pnpm\s+exec\s+)?(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|build|lint|typecheck|check)(?::[\w-]+)?|go\s+(?:test|build|vet)|cargo\s+(?:test|build|check|clippy)|python3?\s+-m\s+(?:pytest|unittest|engine\.collaudo)|tsc|jest|vitest|node\s+--test|make(?:\s+(?!-)[\w-]+)?))(?=$|[\s;&|)])/;
const FAILED = /\b[1-9]\d* (?:failed|failing)\b|^FAIL\b|\bFAILED\b|^# fail [1-9]|\bpanic:|Traceback \(most recent|\berror TS\d+|npm ERR!|\bBUILD FAILED\b|^error(?:\[E\d+\])?:/m;
const UNDO = /\bgit\s+(?:restore|revert|reset\s+--hard|checkout\s+(?:\S+\s+)?--\s)/;
const BASH_WRITE = /\bsed\s+(?:-[a-zA-Z]+\s+)*-i|(?:^|[^>&0-9])>>?\s*[\w./~-]+\.\w+|\bgit\s+apply\b/m;
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit']);
// a correction: a lead at the start, or a rule inside
const LEAD = /^\s*(?:no|nope|nah|wrong|actually|don't|dont|do not|never|stop|not (?:that|this|like that|quite)|that'?s (?:not|wrong)|nono|sbagliat[oa]|non (?:così|cosi|va|è così|e così|devi|usare|si fa|si usa)|anzi|in realtà|aspetta)\b[\s,.!:;-]/i;
const RULE = /\b(?:instead of|use \S+ instead|we (?:always |usually |never )?(?:use|do|don't|keep|put|run)\b|that'?s not how|should(?:n't| not) (?:be|use)|you (?:forgot|missed|broke)\b|invece di|al posto di|usa \S+ invece|noi (?:usiamo|facciamo|non usiamo|non facciamo)|non si (?:usa|fa)|così non va|hai (?:dimenticato|sbagliato|rotto|tolto)|te l'ho (?:detto|già detto)|ti ho detto|ho detto di|d'ora in poi|da ora in poi|mai più)\b/i;
const CLARIFY = /\bi mean(?:t)?\b|\bjust asking\b|\bintend(?:o|evo)\b|\bchiedevo\b|\bera una domanda\b|\bvolevo solo sapere\b|[?？]\s*$/i;
const PICK = /^\s*(?:(?:option|choice|opzione|scelta|piano|plan)\s*)?(?:[1-9]|[a-d])\s*[.)!]?\s*(?:please|pls|grazie)?\s*$|^\s*(?:let'?s |go with |use |pick |take |yes,? |vai con |facciamo |scelgo |la |il )?(?:the )?(?:first|second|third|last|1st|2nd|3rd|prim[ao]|second[ao]|terz[ao]|ultim[ao]|(?:option|choice|opzione|scelta)\s*[a-d1-9])\b/i;
const OPTION_LINE = /^\s*(?:\d+[.)]|[A-D][.)]|[-*]\s+\*\*(?:option|choice|opzione)|(?:option|choice|opzione)\s+[A-D1-9]\b)/gim;

function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }
function vaultFor(cwd) {
  let dir = path.resolve(cwd || process.cwd());
  for (;;) { const c = readJson(path.join(dir, '.atlas.json')); if (c && typeof c.vault === 'string') return path.resolve(dir, c.vault); const p = path.dirname(dir); if (p === dir) break; dir = p; }
  const u = readJson(path.join(os.homedir(), '.claude', 'atlas.json')); if (u && typeof u.vault === 'string') return path.resolve(u.vault);
  const auto = path.join(os.homedir(), '.claude', 'projects', path.resolve(cwd || process.cwd()).replace(/[^A-Za-z0-9]/g, '-'), 'memory');
  return fs.existsSync(auto) ? auto : null;
}
const textOf = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((b) => (b && typeof b.text === 'string' ? b.text : '')).join('\n') : '');
const quoted = (s, n = 60) => { const l = s.split('\n')[0].trim().replace(/"/g, "'"); return l.length > n ? l.slice(0, n - 1).trimEnd() + '…' : l; };

/** The signs in a transcript, best first. Pure. */
function signals(jsonl, cwd) {
  const tools = [], results = new Map(), prompts = [], said = []; let at = 0, asked = 0, spoke = false, lastAsk = 0; const askedKeys = new Set();
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue; let e; try { e = JSON.parse(line); } catch { continue; }
    at += 1; const uuid = typeof e.uuid === 'string' ? e.uuid : '#' + at; const blocks = Array.isArray(e.message && e.message.content) ? e.message.content : [];
    if (e.type === 'assistant') { for (const b of blocks) { if (b && b.type === 'tool_use') tools.push({ at, uuid, name: String(b.name || ''), input: b.input || {}, id: String(b.id || '') }); else if (b && b.type === 'text' && typeof b.text === 'string') said.push({ at, text: b.text }); } if (blocks.length) spoke = true; continue; }
    if (e.type !== 'user') continue;
    for (const b of blocks) if (b && b.type === 'tool_result') results.set(String(b.tool_use_id || ''), { error: b.is_error === true, text: textOf(b.content) });
    const raw = typeof e.message?.content === 'string' ? e.message.content : blocks.some((b) => b && b.type === 'text') ? blocks.filter((b) => b && b.type === 'text').map((b) => String(b.text || '')).join('\n') : null;
    if (raw === null) continue; const t = raw.trim();
    if (t.includes(MARK)) { asked += 1; lastAsk = at; for (const m of t.matchAll(/\[atlas signal (([a-z]+)#[\w-]+)\]/g)) askedKeys.add(m[1]).add(m[2]); continue; }
    if (e.isMeta || !t || t.startsWith('<') || t.startsWith('[Request interrupted') || t.startsWith('Caveat:') || /^Stop hook feedback/i.test(t)) continue;
    if (spoke) prompts.push({ at, uuid, text: t });
  }
  if (asked >= MAX_ASKS) return { out: [], asked };
  const since = (xs) => xs.filter((x) => x.at > lastAsk); const work = since(tools);
  const root = path.resolve(cwd || process.cwd());
  const inRepo = (f) => { if (typeof f !== 'string' || !f) return null; const rel = path.relative(root, path.resolve(root, f)); if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null; const p = rel.split(path.sep).join('/'); return /^(?:\.atlas|\.claude|memory)\//.test(p) || /\.atlas\.json$/.test(p) ? null : p; };
  const bash = (t) => (t.name === 'Bash' && typeof t.input.command === 'string' ? t.input.command : null);
  const ok = (t) => !(results.get(t.id) || {}).error;
  const codeEdit = (t) => { if (EDIT_TOOLS.has(t.name)) return inRepo(t.input.file_path || t.input.notebook_path); const c = bash(t); return c && BASH_WRITE.test(c) && ok(t) ? '' : null; };
  const workedAfter = (when) => work.some((t) => t.at > when && codeEdit(t) !== null);
  const out = []; const push = (kind, uuid, what) => { const key = kind + '#' + String(uuid).slice(0, 8); if (!askedKeys.has(key)) out.push({ kind, key, what }); };
  // fixed: a check failed, then passed after an edit
  const checks = work.map((t) => { const c = bash(t); const m = c && CHECK.exec(c); const r = results.get(t.id); if (!m || !r) return null; return { t, name: m[1].replace(/\s+/g, ' ').trim(), failed: FAILED.test(r.text) || (r.error && !/[|;&]/.test(c)) }; }).filter(Boolean); // a pipeline's exit is grep's
  for (let i = checks.length - 1; i >= 0; i -= 1) {
    const pass = checks[i]; if (pass.failed) continue;
    const fails = checks.slice(0, i).filter((c) => c.failed && c.name === pass.name); if (!fails.length) continue;
    const edits = work.filter((t) => t.at > fails[0].t.at && t.at < pass.t.at).map(codeEdit).filter((f) => f !== null); if (!edits.length) continue;
    const file = [...edits].reverse().find((f) => f);
    push('fixed', pass.t.uuid, `\`${pass.name}\` failed ${fails.length === 1 ? 'once' : fails.length + ' times'}, then passed after your change${file ? ' to ' + file : ''}.`); break;
  }
  for (const p of since(prompts).reverse()) { if (CLARIFY.test(p.text) || !(LEAD.test(p.text) || RULE.test(p.text)) || !workedAfter(p.at)) continue; push('corrected', p.uuid, `The user corrected you ("${quoted(p.text)}").`); break; }
  // undone: once a session, never when a commit follows
  if (!askedKeys.has('undone')) for (const t of [...work].reverse()) { const c = bash(t); if (!c || !UNDO.test(c) || !ok(t) || work.some((u) => u.at > t.at && /\bgit\s+commit\b/.test(bash(u)) && ok(u))) continue; push('undone', t.uuid, `You undid a change (\`${quoted(c, 50)}\`).`); break; }
  let chose = null;
  for (const t of [...work].reverse()) { if (t.name !== 'AskUserQuestion') continue; const r = results.get(t.id); if (!r || r.error || !workedAfter(t.at)) continue; chose = { uuid: t.uuid, text: r.text.replace(/^[^:]*answered[^:]*:\s*/i, '') }; break; }
  if (!chose) for (const p of since(prompts).reverse()) { if (p.text.length > 80 || !PICK.test(p.text) || !workedAfter(p.at)) continue; const offer = [...said].reverse().find((s) => s.at < p.at); if (!offer || !offer.text.includes('?') || (offer.text.match(OPTION_LINE) || []).length < 2) continue; chose = { uuid: p.uuid, text: p.text }; break; }
  if (chose) push('chose', chose.uuid, `The user picked one of your options ("${quoted(chose.text)}").`);
  return { out, asked };
}

const TAIL = { fixed: 'Cause not plain from the diff? Keep it', corrected: 'Keep the rule', undone: 'Approach ruled out? Keep why', chose: 'Choice matters later? Keep it, with the options dropped' };
function ask(s) { return `${MARK}${s.key}] ${s.what} ${TAIL[s.kind]}: one note per atlas-memory write.md (one fact, the why, the file), through the gate. Nothing worth keeping: say so in one line and stop.`; }

function main() {
  let input = {}; try { if (!process.stdin.isTTY) input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch { input = {}; }
  try {
    if (input.hook_event_name !== 'Stop' || input.stop_hook_active) return;
    if (typeof input.transcript_path !== 'string' || !fs.existsSync(input.transcript_path)) return;
    const vault = vaultFor(input.cwd); if (!vault || !fs.existsSync(vault)) return;
    const { out } = signals(fs.readFileSync(input.transcript_path, 'utf8'), input.cwd);
    if (out.length) process.stdout.write(JSON.stringify({ decision: 'block', reason: ask(out[0]) }));
  } catch { /* exit 0 */ }
}
if (require.main === module) { main(); process.exit(0); }
module.exports = { signals, ask, vaultFor, MAX_ASKS };
