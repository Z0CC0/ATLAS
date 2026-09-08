#!/usr/bin/env node
// ATLAS — hook tests. No framework: run `node tests/hooks.test.mjs`.
// These cover the parts a machine can judge. Behaviour of the rules themselves
// is covered by tests/prompts.json, which needs a model to run.

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

// Anchors below are deliberately short and always within one line: the rules get
// reworded, they use CRLF, and a test that pins a whole sentence breaks on a
// rewrite that changed nothing about the rule.

// Isolate every test run from the real ~/.claude.
const SANDBOX = mkdtempSync(join(tmpdir(), 'atlas-test-'));
process.env.CLAUDE_CONFIG_DIR = SANDBOX;

const cfg = require(join(ROOT, 'hooks', 'atlas-config.js'));
const tracker = require(join(ROOT, 'hooks', 'atlas-tracker.js'));
const activate = require(join(ROOT, 'hooks', 'atlas-activate.js'));

let failed = 0;
const check = (name, cond) => {
  console.log(`${cond ? 'OK  ' : 'FAIL'}  ${name}`);
  if (!cond) failed++;
};
const eq = (name, a, b) => check(`${name}  (${JSON.stringify(a)})`, JSON.stringify(a) === JSON.stringify(b));

// --- state file -------------------------------------------------------------

check('no state before anything is written', cfg.readState() === null);
cfg.writeState({ level: 'low', rigour: 'ask', check: 'off', silent: 'off' });
eq('round-trips through the flag file', cfg.readState(), { level: 'low', rigour: 'ask', check: 'off', silent: 'off' });
check('flag content is the documented format', readFileSync(cfg.flagPath(), 'utf8') === 'low:ask:off:off');

writeFileSync(cfg.flagPath(), 'nonsense:whatever');
check('unknown level is rejected, not guessed', cfg.readState() === null);

writeFileSync(cfg.flagPath(), 'high:nonsense');
eq('unknown rigour degrades to off, level survives', cfg.readState(), { level: 'high', rigour: 'off', check: 'off', silent: 'off' });

writeFileSync(cfg.flagPath(), 'x'.repeat(200));
check('oversized flag is refused (exfiltration guard)', cfg.readState() === null);

cfg.clearState();
check('clearState removes the file', !existsSync(cfg.flagPath()));

// --- command parsing --------------------------------------------------------

const S = { level: 'low', rigour: 'off', check: 'off', silent: 'off' };

eq('/atlas high sets the level', tracker.parseCommand('/atlas high', S), { level: 'high', rigour: 'off', check: 'off', silent: 'off' });
eq('level change keeps rigour', tracker.parseCommand('/atlas low', { level: 'low', rigour: 'ask', check: 'off', silent: 'off' }), { level: 'low', rigour: 'ask', check: 'off', silent: 'off' });
eq('rigour change keeps level', tracker.parseCommand('/atlas ask', { level: 'low', rigour: 'off', check: 'off', silent: 'off' }), { level: 'low', rigour: 'ask', check: 'off', silent: 'off' });
eq('ask off clears only rigour', tracker.parseCommand('/atlas ask off', { level: 'low', rigour: 'ask', check: 'off', silent: 'off' }), { level: 'low', rigour: 'off', check: 'off', silent: 'off' });
eq('/atlas off clears both', tracker.parseCommand('/atlas off', { level: 'low', rigour: 'ask', check: 'off', silent: 'off' }), { level: 'off', rigour: 'off', check: 'off', silent: 'off' });
check('unknown argument changes nothing', tracker.parseCommand('/atlas banana', S) === null);
eq('namespaced form is accepted', tracker.parseCommand('/atlas:atlas high', S), { level: 'high', rigour: 'off', check: 'off', silent: 'off' });

eq('English off phrase', tracker.parseCommand('stop atlas please', S), { level: 'off', rigour: 'off', check: 'off', silent: 'off' });
eq('English "normal mode"', tracker.parseCommand('normal mode', S), { level: 'off', rigour: 'off', check: 'off', silent: 'off' });
eq('English on phrase', tracker.parseCommand('activate atlas', S), cfg.defaultState());
// Phrases in other languages are not in the regex, and that is deliberate: supporting
// exactly one second language would be arbitrary. Whoever writes "spegni atlas" gets the
// answer from the model, which recognises the intent and hands back `atlas off` — that
// one works in every language because it is a name, not a sentence.
check('a phrase in another language moves no dial on its own', tracker.parseCommand('spegni atlas', S) === null);
check('but the command itself still works', tracker.parseCommand('atlas off', S) !== null);
// "enable atlas high" named a level and got the default: the phrase matched, the
// word after it was dropped, and the plugin came on one level below what was asked.
const OFFSTATE = { level: 'off', rigour: 'off', check: 'off', silent: 'off' };
eq('switching on with a level named respects it', tracker.parseCommand('enable atlas high', OFFSTATE), { level: 'high', rigour: 'off', check: 'off', silent: 'off' });
eq('and with the other English verb', tracker.parseCommand('turn on atlas high', OFFSTATE), { level: 'high', rigour: 'off', check: 'off', silent: 'off' });
eq('switching on with a dial named turns that dial on', tracker.parseCommand('activate atlas check', OFFSTATE), { level: 'low', rigour: 'off', check: 'on', silent: 'off' });
check('a question that contains the phrase switches nothing on', tracker.parseCommand('cosa fa attiva atlas high?', S) === null);

eq('bare form without slash (no terminal)', tracker.parseCommand('atlas high', S), { level: 'high', rigour: 'off', check: 'off', silent: 'off' });
eq('bare form, rigour', tracker.parseCommand('atlas ask', { level: 'low', rigour: 'off', check: 'off', silent: 'off' }), { level: 'low', rigour: 'ask', check: 'off', silent: 'off' });
eq('bare form, two words', tracker.parseCommand('atlas ask off', { level: 'low', rigour: 'ask', check: 'off', silent: 'off' }), { level: 'low', rigour: 'off', check: 'off', silent: 'off' });
check('bare form only when it is the whole message', tracker.parseCommand('il progetto atlas high sarebbe bello', S) === null);
check('bare form does not fire on project talk', tracker.parseCommand('atlas core has to read the graph', S) === null);

eq('default is low, check off', cfg.DEFAULT_STATE, { level: 'low', rigour: 'off', check: 'off', silent: 'off' });
check('reminder names both dials even when rigour is off', tracker.reminder({ level: 'low', rigour: 'off', check: 'off', silent: 'off' }).includes('ask=off'));
check('reminder states the rules, not just the state', tracker.reminder({ level: 'low', rigour: 'off', check: 'off', silent: 'off' }).includes('no filler'));
check('ask scope covers open research', activate.build({ level: 'low', rigour: 'ask' }).includes('Open-ended research'));
check('rules document the namespaced slash form', activate.build({ level: 'low', rigour: 'off', check: 'off', silent: 'off' }).includes('/atlas:atlas'));

for (const lv of ['low', 'high']) {
  const b = activate.build({ level: lv, rigour: 'off', check: 'off', silent: 'off' });
  check(`${lv} receives the shared rules`, b.includes('At both levels') && b.includes('Each fact once'));
}
check('negations are protected', activate.build({ level: 'low', rigour: 'off', check: 'off', silent: 'off' }).includes('The word that flips a claim stays'));
// Rules that protect a level from its own aggression are gated to the levels that
// are aggressive, so each is checked where it applies and where it must not appear.
check('compression may not grow the output, at the lightest level too', activate.build({ level: 'low', rigour: 'off', check: 'off', silent: 'off' }).includes('Shorter, never stranger'));
check('tool calls fire without preamble', activate.build({ level: 'low', rigour: 'off', check: 'off', silent: 'off' }).includes('The call is the message'));
check('boundaries cover everything persisted outside chat', activate.build({ level: 'low', rigour: 'off', check: 'off', silent: 'off' }).includes('memory file another session will read'));

eq('max is a level', tracker.parseCommand('atlas high', S), { level: 'high', rigour: 'off', check: 'off', silent: 'off' });
check('high carries its own extra rules', /bare\s+domains/.test(activate.build({ level: 'high', rigour: 'off', check: 'off', silent: 'off' })));
check('high states the non-negotiable floor', activate.build({ level: 'high', rigour: 'off', check: 'off', silent: 'off' }).includes('floor holds here too'));
check('lower levels do not get the bare-domain rule', !activate.build({ level: 'low', rigour: 'off', check: 'off', silent: 'off' }).includes('bare domains'));
check('low does not carry the high row', !activate.build({ level: 'low', rigour: 'off', check: 'off', silent: 'off' }).includes('**high**'));

eq('check is a third dial', tracker.parseCommand('atlas check', S), { level: 'low', rigour: 'off', check: 'on', silent: 'off' });
eq('check off leaves the other dials', tracker.parseCommand('atlas check off', { level: 'low', rigour: 'ask', check: 'on', silent: 'off' }), { level: 'low', rigour: 'ask', check: 'off', silent: 'off' });
eq('changing level keeps check', tracker.parseCommand('atlas high', { level: 'low', rigour: 'off', check: 'on', silent: 'off' }), { level: 'high', rigour: 'off', check: 'on', silent: 'off' });
eq('a two-part state file from an older version still reads', cfg.parseState('high:ask'), { level: 'high', rigour: 'ask', check: 'off', silent: 'off' });
check('check on carries the no-premature-closure rule', activate.build({ level: 'low', rigour: 'off', check: 'on', silent: 'off' }).includes('is not "it does not exist"'));
check('check on forbids reflex agreement', activate.build({ level: 'low', rigour: 'off', check: 'on', silent: 'off' }).includes('Verify before agreeing'));
check('check on guards against stubbornness', activate.build({ level: 'low', rigour: 'off', check: 'on', silent: 'off' }).includes('not permission to be stubborn'));
check('check off carries none of it', !activate.build({ level: 'low', rigour: 'off', check: 'off', silent: 'off' }).includes('## Check'));
check('reminder names check when on', tracker.reminder({ level: 'low', rigour: 'off', check: 'on', silent: 'off' }).includes('check: look it up'));

check('check on carries the second pass', activate.build({ level: 'low', rigour: 'off', check: 'on', silent: 'off' }).includes('Second pass on a fact'));
check('the second pass splits facts from solutions', activate.build({ level: 'low', rigour: 'off', check: 'on', silent: 'off' }).includes('that invents one'));
check('the second pass guards against invented rivals', activate.build({ level: 'low', rigour: 'off', check: 'on', silent: 'off' }).includes('Nothing better found'));

check('ask applies to every request, not only the first', activate.build({ level: 'low', rigour: 'ask', check: 'off', silent: 'off' }).includes('does not spend itself'));
check('ask applies afresh to each request', activate.build({ level: 'low', rigour: 'ask', check: 'off', silent: 'off' }).includes('its own questions'));
check('the reminder says ask fires on every request', tracker.reminder({ level: 'low', rigour: 'ask', check: 'off', silent: 'off' }).includes('every request'));

// The failure that started this: a message ABOUT the plugin executed the command.
check('mentioning the off phrase in prose does not fire it', tracker.parseCommand('like writing stop atlas and having it read as a command', S) === null);
check('the off phrase in quotes does not fire it', tracker.parseCommand('se scrivo "stop atlas" cosa succede?', S) === null);
// Quoting is the ONLY thing stopping this one: the phrase opens the message.
check('a quoted off phrase at the start does not fire it', tracker.parseCommand('"stop atlas" is a command, right?', S) === null);
check('a backticked off phrase at the start does not fire it', tracker.parseCommand('`atlas off` switches everything off', S) === null);
eq('the same phrase unquoted at the start still fires', tracker.parseCommand('atlas off switches everything off', S), { level: 'off', rigour: 'off', check: 'off', silent: 'off' });
check('the off phrase mid-sentence does not fire it', tracker.parseCommand('voglio capire se stop atlas funziona', S) === null);
eq('a bare off command still works', tracker.parseCommand('stop atlas', S), { level: 'off', rigour: 'off', check: 'off', silent: 'off' });
eq('a compound off command still works', tracker.parseCommand('turn off atlas and write the release notes', S), { level: 'off', rigour: 'off', check: 'off', silent: 'off' });
check('activation mid-sentence does not fire', tracker.parseCommand('I do not want to activate atlas right now', S) === null);

check('ask asks one at a time', activate.build({ level: 'low', rigour: 'ask', check: 'off', silent: 'off' }).includes('One question at a time'));
check('ask uses multiple choice with a way out', activate.build({ level: 'low', rigour: 'ask', check: 'off', silent: 'off' }).includes('their own words'));
check('ask can be ended by the user', activate.build({ level: 'low', rigour: 'ask', check: 'off', silent: 'off' }).includes('go ahead or decide'));
check('askmax is gone', !cfg.RIGOURS.includes('askmax'));
check('the four working disciplines are always on', activate.build({ level: 'low', rigour: 'off', check: 'off', silent: 'off' }).includes('The cause before the fix'));
check('a check result is named exactly', activate.build({ level: 'low', rigour: 'off', check: 'off', silent: 'off' }).includes('passed, failed, could not run, not run'));

// Substring kept short on purpose: the rules file uses CRLF, so a check that
// spans a line break fails for the wrong reason.
check('user-facing text is shown in the user language', activate.build({ level: 'low', rigour: 'off', check: 'off', silent: 'off' }).includes('because English is the source'));

check('the list rule is a yes-or-no, not a judgment', activate.build({ level: 'low', rigour: 'off', check: 'off', silent: 'off' }).includes('One item per line, no marker'));
check('the blank line between items is not optional', activate.build({ level: 'low', rigour: 'off', check: 'off', silent: 'off' }).includes('The blank line is not optional'));
check('the heading rule is a numeric threshold', activate.build({ level: 'low', rigour: 'off', check: 'off', silent: 'off' }).includes('three or more sections'));
check('high carries the heading threshold too', activate.build({ level: 'high', rigour: 'off', check: 'off', silent: 'off' }).includes('three or more sections'));
// Numbers taken from one sample must not appear as if they were constants.
check('no sample numbers presented as thresholds', !/break-even at four rows|two items cost 29|about five times/.test(activate.build({ level: 'high', rigour: 'off', check: 'off', silent: 'off' })));

// The provenance marker is an opening, and another rule forbids openings.
// The exemption only makes sense where the marker exists, that is under `check`:
// saying where an answer comes from is verification, not compression.
check('the marker is exempted from the no-opening rule, where it exists', activate.build({ level: 'low', rigour: 'off', check: 'on', silent: 'off' }).includes('it is content, and goes first'));
check('no marker when check is off', !activate.build({ level: 'low', rigour: 'off', check: 'off', silent: 'off' }).includes('Where it came from'));
check('nessun marcatore, in qualsiasi scrittura', activate.build({ level: 'low', rigour: 'off', check: 'off', silent: 'off' }).includes('in any script'));
check('article dropping is scoped to languages that have them', activate.build({ level: 'low', rigour: 'off', check: 'off', silent: 'off' }).includes('has nothing to drop in their place'));
// Two levels, not three. The third measured 39.6% against its neighbour's 36.1%:
// 3.5 points on a noise of 1.6, and neither followed its own row. The two furthest
// apart remain. The note stays because it stops a third one being added back on the
// assumption that it is free.
check('there are two compression levels', cfg.LEVELS.length === 3 && !cfg.LEVELS.includes('mid'));
check('a dead level name is refused, not remapped', cfg.parseState('mid:ask:on') === null);
check('typing a dead level changes nothing', tracker.parseCommand('atlas mid', S) === null);
check('filler is defined by function, not by a word list', activate.build({ level: 'low', rigour: 'off', check: 'off', silent: 'off' }).includes('keeps its meaning without'));
check('il grassetto ha un tetto numerico', activate.build({ level: 'low', rigour: 'off', check: 'off', silent: 'off' }).includes('At most two bold spans'));
// The bold rule lives in Form, which reaches both levels, not in the `high` row:
// a long row is followed less than a short one.
check('the bold cap holds at high too', activate.build({ level: 'high', rigour: 'off', check: 'off', silent: 'off' }).includes('At most two bold spans'));

// A level rename once turned the phrase "the full word" into "the mid word".
check('the level rename did not corrupt prose', !/the mid word|a mid sentence|the high answer/.test(activate.build({ level: 'low', rigour: 'off', check: 'off', silent: 'off' })));
check('the shorthand rule names no English-only list', activate.build({ level: 'low', rigour: 'off', check: 'off', silent: 'off' }).includes('No invented shorthand'));

check('a question is not a command (EN)', tracker.parseCommand('what is atlas?', S) === null);
check('a question is not a command (IT)', tracker.parseCommand('cosa fa atlas?', S) === null);
check('ordinary prose changes nothing', tracker.parseCommand('fix the parser in main.ts', S) === null);
check('vim normal mode is not a switch-off', tracker.parseCommand('how do I exit vim normal mode', S) === null);

// --- rule filtering ---------------------------------------------------------

const sample = '<!-- level:low -->L<!-- /level:low -->\n<!-- level:high -->U<!-- /level:high -->\nalways\n';
check('keeps the active level block', activate.filterBlocks(sample, 'level', 'high').includes('U'));
check('drops the inactive level block', !activate.filterBlocks(sample, 'level', 'high').includes('L'));
check('unmarked text always survives', activate.filterBlocks(sample, 'level', 'high').includes('always'));

const skill = readFileSync(join(ROOT, 'skills', 'atlas', 'SKILL.md'), 'utf8');
const built = activate.build({ level: 'low', rigour: 'off', check: 'off', silent: 'off' });
check('built rules name the active state', built.includes('compression: low'));
check('low does not carry the high row', !built.includes('**high**'));
check('rigour off does not carry ask rules', !built.includes('Rigour: ask'));
check('ask has no round limit', activate.build({ level: 'low', rigour: 'ask', check: 'off', silent: 'off' }).includes('No round limit'));
check('ask does not carry the ask ceiling', !activate.build({ level: 'low', rigour: 'ask', check: 'off', silent: 'off' }).includes('Hard ceiling'));
check('no leftover markers in output', !built.includes('<!--'));
check('frontmatter is stripped', !built.startsWith('---'));

// --- untouchable terms ------------------------------------------------------

writeFileSync(cfg.termsPath(), '# comment\nPelicanDB\n\nretry_budget\n');
const withTerms = activate.build({ level: 'low', rigour: 'off', check: 'off', silent: 'off' });
check('terms file is injected', withTerms.includes('PelicanDB') && withTerms.includes('retry_budget'));
check('comments in the terms file are ignored', !withTerms.includes('# comment'));
rmSync(cfg.termsPath());
check('no terms section when the file is absent', !activate.build({ level: 'low', rigour: 'off', check: 'off', silent: 'off' }).includes('Untouchable terms'));

// --- end to end through the real hook process -------------------------------

cfg.writeState({ level: 'low', rigour: 'ask', check: 'off', silent: 'off' });
const out = execFileSync(process.execPath, [join(ROOT, 'hooks', 'atlas-activate.js')], {
  encoding: 'utf8',
  env: { ...process.env, CLAUDE_CONFIG_DIR: SANDBOX },
});
check('activate hook prints rules for the stored state', out.includes('compression: low') && out.includes('rigour: ask'));

const trackerOut = execFileSync(process.execPath, [join(ROOT, 'hooks', 'atlas-tracker.js')], {
  encoding: 'utf8',
  input: JSON.stringify({ prompt: 'fix the parser' }),
  env: { ...process.env, CLAUDE_CONFIG_DIR: SANDBOX },
});
const parsed = JSON.parse(trackerOut);
check('tracker returns valid hook output', parsed.hookSpecificOutput.hookEventName === 'UserPromptSubmit');
check('reminder is marked as internal', parsed.hookSpecificOutput.additionalContext.startsWith('[ATLAS]'));

const offOut = execFileSync(process.execPath, [join(ROOT, 'hooks', 'atlas-tracker.js')], {
  encoding: 'utf8',
  input: JSON.stringify({ prompt: '/atlas off' }),
  env: { ...process.env, CLAUDE_CONFIG_DIR: SANDBOX },
});
// Switching off must SAY so: the session-start ruleset is already in context and
// cannot be un-injected, so silence left it half-applied.
const offParsed = JSON.parse(offOut);
check('switching off emits an explicit override', offParsed.hookSpecificOutput.additionalContext.includes('Ignore the ATLAS ruleset'));

const junkOut = execFileSync(process.execPath, [join(ROOT, 'hooks', 'atlas-tracker.js')], {
  encoding: 'utf8',
  input: 'not json at all',
  env: { ...process.env, CLAUDE_CONFIG_DIR: SANDBOX },
});
check('malformed hook input does not crash the tracker', junkOut.trim() === '');

// The surviving form rules are all binary. If someone puts back one that asks for
// a judgment on every application, this test falls.
const forma = activate.build({ level: 'low', rigour: 'off', check: 'off', silent: 'off' });
check('no judgment-based form rule has come back', !/No full stop before a blank line|A single explanation stays prose|changes a decision, never what is merely important/.test(forma));

// --- installed does not mean on ------------------------------------------------
//
// An absent state file means OFF, not "on at the default". It used to mean the
// default, and that was wrong in two directions: a fresh install rewrote every answer
// before anyone asked, and `atlas off` deleted the file, so switching off lasted until
// the next restart, when the absent file was read as the default again.

cfg.clearState();
check('no state file means no state, not the default', cfg.readState() === null);
cfg.writeState({ level: 'off', rigour: 'off', check: 'off', silent: 'off' });
eq('off is written and read back', cfg.readState(), { level: 'off', rigour: 'off', check: 'off', silent: 'off' });
check('switching off writes the state instead of deleting it', existsSync(cfg.flagPath()));
eq('from off, atlas low turns on the level only', tracker.parseCommand('atlas low', { level: 'off', rigour: 'off', check: 'off', silent: 'off' }), { level: 'low', rigour: 'off', check: 'off', silent: 'off' });
cfg.clearState();

// --- atlas status: says what is on, and changes nothing -------------------------

eq('status lists only what is on', tracker.statusLine({ level: 'high', rigour: 'ask', check: 'on', silent: 'off' }), ['atlas high on', 'atlas ask on', 'atlas check on'].join('\n'));
eq('status is silent about dials that are off', tracker.statusLine({ level: 'low', rigour: 'off', check: 'off', silent: 'off' }), 'atlas low on');
eq('everything off is a single line', tracker.statusLine({ level: 'off', rigour: 'off', check: 'off', silent: 'off' }), 'atlas off');
check('riconosce le forme di status', ['atlas status', '/atlas status', 'atlas status?'].every((x) => tracker.STATUS_PATTERNS.some((re) => re.test(x))));
check('status is not confused with a command', !['atlas high', 'atlas', 'project status report'].some((x) => tracker.STATUS_PATTERNS.some((re) => re.test(x))));
// Asking for the state is not changing it: parseCommand must touch nothing.
check('asking for the state moves no dial', tracker.parseCommand('atlas status', S) === null);

// --- the per-turn reminder names the form, at both levels -----------------------
//
// At `high` it used to say only "facts not reasons": no form rule at all. On long
// sessions the answers came back in full prose, with articles and dashes on list
// rows, because the session-start rules are two thousand tokens back and the only
// thing arriving every turn did not name them.
for (const lv of ['low', 'high']) {
  const r = tracker.reminder({ level: lv, rigour: 'off', check: 'off', silent: 'off' });
  check(`the reminder at ${lv} names articles`, /articles/.test(r));
  check(`the reminder at ${lv} names list markers`, /list markers/.test(r));
  // The two rules that decide length, not wording.
  check(`the reminder at ${lv} carries the two structural rules`, /answer first, only what was asked/.test(r));
}

// --- commands that are only a handle do not ship without their subagent ---------
//
// `atlas-search` and `atlas-sources` do not use `atlas-research`: they are its handle,
// and their body is a pointer. On a build without subagents they were half commands,
// and keeping them alive meant duplicating the rules in a skill — a second copy to
// align by hand, the thing that has already gone wrong twice in this project. The
// build now removes them, and this test checks that a handle and its subagent are
// always in the same build.

const HANDLES = { 'atlas-search': 'atlas-research', 'atlas-sources': 'atlas-research' };
for (const [command, agent] of Object.entries(HANDLES)) {
  const cmd = existsSync(join(ROOT, 'commands', `${command}.md`));
  const ag = existsSync(join(ROOT, 'agents', `${agent}.md`));
  check(`${command} exists only where ${agent} does`, !cmd || ag);
}

// And the skill that remains must not try to manage on its own: if it starts carrying
// the rules again, the duplication is back without anyone saying so.
const searchSkillPath = join(ROOT, 'skills', 'atlas-search', 'SKILL.md');
if (existsSync(searchSkillPath)) {
  const search = readFileSync(searchSkillPath, 'utf8');
  check(
    'the atlas-search skill delegates instead of repeating the rules',
    search.includes('Delegate to the `atlas-research` subagent') && !search.includes('DISCUSSIONI')
  );
}

// --- silent, the fourth dial ------------------------------------------------
//
// `silent` exists as a dial and not only as a skill because a skill has to be
// invoked on the turn it is named. It was answered "on" once and then not applied
// — nothing had written it anywhere, so nothing re-stated it on the next turn.
// These prove the dial is written, survives the other dials, and says so.

const SIL = { level: 'high', rigour: 'off', check: 'off', silent: 'off' };
eq('atlas silent turns on the fourth dial only', tracker.parseCommand('atlas silent', SIL), {
  level: 'high', rigour: 'off', check: 'off', silent: 'on',
});
eq('the slash form does the same', tracker.parseCommand('/atlas silent', SIL), {
  level: 'high', rigour: 'off', check: 'off', silent: 'on',
});
eq('atlas silent off turns off that one only', tracker.parseCommand('atlas silent off', { ...SIL, silent: 'on' }), {
  level: 'high', rigour: 'off', check: 'off', silent: 'off',
});
eq('switching on with silent named respects it', tracker.parseCommand('use atlas silent', SIL), {
  level: 'low', rigour: 'off', check: 'off', silent: 'on',
});
eq('atlas off turns silent off too', tracker.parseCommand('atlas off', { ...SIL, silent: 'on' }), {
  level: 'off', rigour: 'off', check: 'off', silent: 'off',
});
eq('changing the level leaves silent alone', tracker.parseCommand('/atlas low', { ...SIL, silent: 'on' }), {
  level: 'low', rigour: 'off', check: 'off', silent: 'on',
});

cfg.writeState({ level: 'high', rigour: 'ask', check: 'on', silent: 'on' });
check('silent lands in the state file', readFileSync(cfg.flagPath(), 'utf8') === 'high:ask:on:on');
eq('and reads back', cfg.readState(), { level: 'high', rigour: 'ask', check: 'on', silent: 'on' });
cfg.clearState();

check(
  'the reminder says no narration and no summary',
  /silent: no narration, no closing report/.test(tracker.reminder({ level: 'high', rigour: 'off', check: 'off', silent: 'on' }))
);
check(
  'silent holds without compression too',
  /silent:/.test(tracker.reminder({ level: 'off', rigour: 'off', check: 'off', silent: 'on' }))
);
check(
  'silent off costs nothing',
  !/silent/.test(tracker.reminder({ level: 'high', rigour: 'off', check: 'off', silent: 'off' }))
);
check('the status says it is on', tracker.statusLine({ level: 'off', rigour: 'off', check: 'off', silent: 'on' }) === 'atlas silent on');

// The defect that shipped in 0.43.0: from a cold start, `atlas silent` produced a state the
// tracker read as "everything off" and answered with the off notice. One predicate now decides.
check('silent alone is not "all off"', !cfg.isAllOff({ level: 'off', rigour: 'off', check: 'off', silent: 'on' }));
check('all four off is "all off"', cfg.isAllOff({ level: 'off', rigour: 'off', check: 'off', silent: 'off' }));
check('no state is "all off"', cfg.isAllOff(null));
check('a three-part state with nothing on is "all off"', cfg.isAllOff({ level: 'off', rigour: 'off', check: 'off' }));
check('the session start carries the silent rules when silent is on',
  activate.build({ level: 'off', rigour: 'off', check: 'off', silent: 'on' }).includes('## Silent'));
check('and not when it is off',
  !activate.build({ level: 'high', rigour: 'ask', check: 'on', silent: 'off' }).includes('## Silent'));
check('the silent rules keep the three exceptions',
  activate.build({ level: 'low', rigour: 'off', check: 'off', silent: 'on' }).includes('Three things are still said'));

// Compression off with another dial on injected the whole compression ruleset under a
// header saying "compression: off". Only the dial that is on may reach the model.
const soloSilent = activate.build({ level: 'off', rigour: 'off', check: 'off', silent: 'on' });
check('silent alone carries the silent rules', soloSilent.includes('## Silent'));
check('silent alone carries no compression rules', !soloSilent.includes('## Form') && !soloSilent.includes('At both levels'));
const soloCheck = activate.build({ level: 'off', rigour: 'off', check: 'on', silent: 'off' });
check('check alone carries the check rules', soloCheck.includes('## Check'));
check('check alone carries no compression rules', !soloCheck.includes('## Form') && !soloCheck.includes('half the words'));
const soloAsk = activate.build({ level: 'off', rigour: 'ask', check: 'off', silent: 'off' });
check('ask alone carries the ask rules and nothing else', soloAsk.includes('## Rigour: ask') && !soloAsk.includes('## Form'));
check('no leftover markers when compression is off', !soloSilent.includes('<!--') && !soloCheck.includes('<!--'));
check(
  'the switch-on note allows the confirmation and names the way out',
  /Confirm in at most three words/.test(tracker.SILENT_NOTICE) && /atlas silent off/.test(tracker.SILENT_NOTICE)
);

// --- no frontmatter may contain an angle-bracket tag -------------------------
//
// The desktop app's upload validator rejects a description with anything that
// looks like an XML tag, and it rejected 0.44.0 over `<task>`. Nothing in the
// unit tests had looked. Now every frontmatter of every skill, agent and command
// is checked for `<word>`.
for (const dir of ['skills', 'agents', 'commands']) {
  const files = dir === 'skills'
    ? readdirSync(join(ROOT, dir)).map((d) => join(ROOT, dir, d, 'SKILL.md')).filter(existsSync)
    : readdirSync(join(ROOT, dir)).map((f) => join(ROOT, dir, f));
  for (const f of files) {
    const fm = (readFileSync(f, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/) || [])[1] || '';
    const short = f.replaceAll('\\', '/').split('/').slice(-2).join('/');
    check(`no angle-bracket tag in the frontmatter of ${short}`, !/<[^>\n]+>/.test(fm));
  }
}

// --- the rules themselves must not contain private data ---------------------

// No user name, no home path, no project of the author's: the rules are the same for everyone.
const PRIVATE = [/Users\\[A-Za-z]+\\/, /\/home\/[a-z]+\//, /Desktop\\/];
check('SKILL.md carries nothing personal', !PRIVATE.some((re) => re.test(skill)));

rmSync(SANDBOX, { recursive: true, force: true });
console.log(failed === 0 ? `\nAll good. ${'—'} no test failed.` : `\n${failed} test(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
