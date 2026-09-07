#!/usr/bin/env node
// ATLAS — UserPromptSubmit hook.
//
// Three jobs:
//   1. parse /atlas commands and natural-language switches
//   2. keep the four dials in the flag file
//   3. re-state the active state each turn, because the SessionStart rules fade
//      once other instructions arrive every turn
//
// Always exits 0. A hook that fails must not cost the user a prompt.

const cfg = require('./atlas-config');

// Natural-language switches.
//
// Every pattern below is anchored to the START of the message, and quoted spans
// are blanked before matching. Both guards exist because of a real failure: a
// message *about* the plugin — "if I write stop atlas, that gets read as a
// command" — switched it off mid-conversation. Mentioning a command must not
// execute it.
//
// Anchoring, not whole-message matching, is deliberate. A dropped deactivation
// is the dangerous direction: the user is left inside a mode with no way out and
// no explanation. So "turn off atlas and write the release notes" still works —
// it opens with the command — while the same words buried in a sentence do not.

// English only, and deliberately so. Supporting exactly one second language is
// arbitrary: the plugin is published in English, and every other language has the
// same claim on a slot here. What covers all of them is `atlas off` — a name, not
// a sentence — plus the rule telling the model to recognise the intent in any
// language and hand that command back. These patterns are a convenience for the
// language the file is written in, not the mechanism.
const OFF_PATTERNS = [
  /^(please\s+)?(stop|disable|deactivate|turn\s+off)\s+(the\s+)?atlas\b/,
  /^atlas\s+(off|stop)\b/,
  /^(?:please\s+)?(?:(?:go|switch|return)\s+(?:back\s+)?to\s+)?normal\s+mode\b/,
];

// Each captures an optional dial after "atlas", because "enable atlas high" named
// a level and used to get the default instead: the phrase matched, the word after
// it was dropped, and the plugin came on one level below what was asked for.
const ON_PATTERNS = [
  /^(?:please\s+)?(?:activate|enable|turn\s+on|start|use)\s+atlas(?:\s+(low|high|ask|check|silent))?\b/,
  /^atlas\s*[.!]?$/,
];

// "atlas status" asks what is on. It changes nothing, and it answers with the
// dials that are ON and nothing else: a list that spells out three things that are
// off is longer than the state it describes.
const STATUS_PATTERNS = [
  /^\/?atlas(?::atlas)?\s+status\s*[?.!]?$/,
];

function statusLine(state) {
  const on = [];
  if (state.level !== 'off') on.push(`atlas ${state.level} on`);
  if (state.rigour === 'ask') on.push('atlas ask on');
  if (state.check === 'on') on.push('atlas check on');
  if (state.silent === 'on') on.push('atlas silent on');
  return on.length ? on.join('\n') : 'atlas off';
}

// A question about ATLAS is not a command to change it.
const QUESTION = /^(what|how|why|when|does|do|is|are|can|could|tell me|explain)\b/;

// Text inside double quotes or backticks is being talked about, not typed as a
// command. Blanked before matching, never before use.
// Two plain patterns rather than one with a backreference: same behaviour, and
// nothing here can be mangled by a tool that rewrites escape sequences.
const QUOTED_SPANS = [/"[^"]*"/g, /`[^`]*`/g];

function blankQuoted(text) {
  return QUOTED_SPANS.reduce((acc, re) => acc.replace(re, ' '), text);
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (c) => { data += c; });
    process.stdin.on('error', () => resolve(''));
    process.stdin.on('end', () => resolve(data));
  });
}

/**
 * Returns the state change requested by `prompt`, or null when it asks for none.
 * `null` means leave the flag exactly as it is — never overwrite on a guess.
 */
function parseCommand(prompt, current) {
  const p = prompt.trim().toLowerCase().replace(/\s+/g, ' ');
  // Quoted text is discussed, not commanded. Blanked for matching only.
  const nl = blankQuoted(p);

  if (OFF_PATTERNS.some((re) => re.test(nl))) return { level: 'off', rigour: 'off', check: 'off', silent: 'off' };

  // Slash commands only exist in the Claude Code terminal. Elsewhere the surface
  // rejects them before the prompt reaches this hook, so the same words are
  // accepted without the slash — but only when they are the entire message, so
  // ordinary sentences mentioning "atlas" never move the dials.
  const slash =
    /^\/atlas(?::atlas)?(?:\s+(.*))?$/.exec(p) ||
    /^atlas\s+(low|high|ask|check|silent|off)(\s+off)?$/.exec(p);
  if (slash) {
    const arg = (slash[1] || '').trim() + (slash[2] || '');
    if (!arg) return cfg.defaultState();
    if (arg === 'off') return { level: 'off', rigour: 'off', check: 'off', silent: 'off' };

    const [first, second] = arg.split(' ');
    // Each dial moves on its own; the other keeps its value. That is what makes
    // "/atlas high" then "/atlas ask" equal to a combined mode without ever
    // needing a combined name.
    if (cfg.LEVELS.includes(first)) return { ...current, level: first };
    if (cfg.RIGOURS.includes(first)) return { ...current, rigour: second === 'off' ? 'off' : first };
    if (first === 'check') return { ...current, check: second === 'off' ? 'off' : 'on' };
    if (first === 'silent') return { ...current, silent: second === 'off' ? 'off' : 'on' };
    return null; // unknown argument: touch nothing
  }

  if (!QUESTION.test(nl)) {
    for (const re of ON_PATTERNS) {
      const m = re.exec(nl);
      if (!m) continue;
      const base = cfg.defaultState();
      const dial = m[1];
      if (!dial) return base;
      if (cfg.LEVELS.includes(dial)) return { ...base, level: dial };
      if (cfg.RIGOURS.includes(dial)) return { ...base, rigour: dial };
      if (dial === 'check') return { ...base, check: 'on' };
      if (dial === 'silent') return { ...base, silent: 'on' };
      return base;
    }
  }

  return null;
}

// The reminder, repeated every turn. It names rules, not only the state: a bare
// label like "level=high" is cheaper but stops working after twenty turns, when the
// session-start rules are far back in context and articles and pleasantries creep
// back. Every token here is paid once per turn, and real sessions are long — 295
// turns on average in the transcripts this was tuned on — so the wording is as short
// as it can be while still naming the rules that slip first. The "no" is written once
// and governs the whole list: "no filler, articles, tables" cannot be read as
// permission. The two structural rules — one word when it answers, answer first and
// only what was asked — are here because their failure costs more than the reminder.
const LEVEL_NOTE = {
  low: 'low: no filler, articles, tables, list markers. one word when it answers, then stop. else answer first, only what was asked',
  high: 'high: facts not reasons. no articles, copulas, tables, list markers. one word when it answers, then stop. else answer first, only what was asked',
};

function reminder(state) {
  const lvl = state.level === 'off' ? 'off' : LEVEL_NOTE[state.level];
  // Rigour is always named, including when off. Stating only the active dial
  // left it ambiguous whether the other one was set or merely unmentioned.
  const rig =
    state.rigour === 'ask'
      ? 'ask: one question at a time, every request'
      : 'ask=off';
  // `check` is named only when on. Off is the default and the expensive state is
  // the one worth repeating; naming an inactive dial every turn buys nothing.
  const chk =
    state.check === 'on'
      ? ' check: look it up, verify corrections.'
      : '';
  // Same rule as `check`: named only when on. Eight tokens a turn, and the first
  // closing report it stops is longer than that — a summary of work the user is
  // already looking at runs a hundred tokens and was not asked for.
  const sil =
    state.silent === 'on'
      ? ' silent: no narration, no closing report.'
      : '';
  return `[ATLAS] ${lvl}. ${rig}.${chk}${sil} code/security normal.`;
}

// Switching off cannot un-inject the ruleset the SessionStart hook already put in
// context: it stays there for the rest of the session. Going silent therefore
// only removed the reminder and left the rules half-applied, which is what
// "stop atlas" appeared to do. So say it explicitly instead.
const OFF_NOTICE =
  '[ATLAS internal] off. Ignore the ATLAS ruleset injected at session start: no compression, ' +
  'no rigour, write normally until the user turns it back on. ' +
  'Confirm in at most three words and say nothing else — not what changed, not what else is ' +
  'installed, not what the user could switch off next. Someone switching a thing off wants it ' +
  'off, not a conversation about it.';

// Said once, on the turn `silent` comes on. The per-turn reminder names the rule
// in five words; this says what the mode is and what ends it, which is worth a
// paragraph once and nothing at all afterwards.
//
// It also authorises the confirmation. Without it the model either says nothing —
// and the user cannot tell the mode took — or writes a paragraph about the mode
// it was just told to be quiet in.
const SILENT_NOTICE =
  '[ATLAS internal] silent on. Confirm in at most three words and say nothing else. ' +
  'From this turn on: no preamble, no narration between tool calls, no closing report, no ' +
  'summary of what was done, no offer of what to do next. Where the result speaks for itself ' +
  '— files written, the output of a command, a diff — say nothing at all. Questions are allowed ' +
  'only before starting and only when the answer changes the result; a blocked or failed task ' +
  'is still reported, in one line. `atlas silent off` ends it.';

async function main() {
  let input;
  try {
    input = JSON.parse((await readStdin()) || '{}');
  } catch (e) {
    process.exit(0);
  }

  const current = cfg.readState() || { level: 'off', rigour: 'off', check: 'off' };
  const prompt = String(input.prompt || '');

  // Asked what is on: answer and stop. No state read is a state change.
  const p = prompt.trim().toLowerCase().replace(/\s+/g, ' ');
  if (STATUS_PATTERNS.some((re) => re.test(p))) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'UserPromptSubmit',
          additionalContext:
            '[ATLAS] The user asked for the dial state. Print exactly the lines below and ' +
            'nothing else — no preamble, no explanation, no offer to change anything:\n\n' +
            statusLine(current),
        },
      })
    );
    process.exit(0);
  }

  const wanted = parseCommand(prompt, current);

  let state = current;
  if (wanted) {
    if (cfg.isAllOff(wanted)) {
      // Written, not cleared. Clearing made "off" last until the next restart,
      // because an absent file used to be read as the default.
      cfg.writeState({ level: 'off', rigour: 'off', check: 'off', silent: 'off' });
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: OFF_NOTICE },
        })
      );
      process.exit(0);
    }
    cfg.writeState(wanted);
    state = wanted;

    // Turned on just now: say what the mode is, once.
    if (wanted.silent === 'on' && current.silent !== 'on') {
      process.stdout.write(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: 'UserPromptSubmit',
            additionalContext: `${SILENT_NOTICE}
${reminder(state)}`,
          },
        })
      );
      process.exit(0);
    }
  }

  // `silent` on its own is a state worth reminding about: it is the one dial that
  // works with no compression at all.
  if (cfg.isAllOff(state)) process.exit(0);

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: reminder(state),
      },
    })
  );
  process.exit(0);
}

if (require.main === module) main();

module.exports = {
  parseCommand,
  reminder,
  statusLine,
  STATUS_PATTERNS,
  OFF_NOTICE,
  SILENT_NOTICE,
  OFF_PATTERNS,
  ON_PATTERNS,
};
