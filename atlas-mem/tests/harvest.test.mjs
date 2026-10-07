// Tests for harvest: extraction from transcripts, documents, and the inbox.
// node --test tests/harvest.test.mjs — no parser needed.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const h = await import(pathToFileURL(path.join(here, '..', 'tools', 'harvest.mjs')).href);

const rec = (type, content, extra = {}) => JSON.stringify({ type, timestamp: '2026-10-01T10:00:00Z', cwd: 'C:/work/app', message: { content, model: type === 'assistant' ? 'claude-x' : undefined }, ...extra });

function session(dir, name, lines) { fs.writeFileSync(path.join(dir, `${name}.jsonl`), lines.join('\n') + '\n'); }

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harvest-'));
  const projects = path.join(root, 'projects');
  const main = path.join(projects, 'C--work-app');
  fs.mkdirSync(main, { recursive: true });
  fs.mkdirSync(path.join(projects, 'C--work-app-atlas-test'), { recursive: true });
  session(main, 'big', [
    rec('user', 'Sistema il build che non parte'),
    rec('assistant', [{ type: 'text', text: 'Guardo il file.' }, { type: 'tool_use', name: 'Read', input: {} }]),
    rec('user', [{ type: 'tool_result', content: 'lots of output ' + 'x'.repeat(60000) }]),
    rec('user', 'ok'),
    rec('user', 'da ora in poi non usare mai npm install -g, voglio tutto locale'),
    rec('assistant', [{ type: 'text', text: 'Fatto.\n\n**Deciso:** le dipendenze restano locali al progetto, mai globali, perché il profilo utente non va toccato.\n\nAltro paragrafo di cronaca che non conta.' }]),
    rec('user', 'perfetto'),
  ]);
  session(main, 'tiny', [rec('user', 'ciao')]);
  session(path.join(projects, 'C--work-app-atlas-test'), 'bench', [rec('user', 'decidiamo tutto qui'), rec('user', 'voglio che resti locale ' + 'y'.repeat(60000))]);
  const vault = path.join(root, 'vault');
  fs.mkdirSync(vault);
  fs.writeFileSync(path.join(vault, 'MEMORY.md'), '- [Esistente](esistente.md) — una nota\n');
  fs.writeFileSync(path.join(vault, 'esistente.md'), '---\nname: esistente\ndescription: una nota\nmetadata:\n  type: project\n---\n\nUn fatto.\n');
  return { root, projects, vault };
}

test('extract keeps the first request, decision-like lines, assistant statements; drops tools and noise', () => {
  const s = setup();
  const out = path.join(s.root, 'extract');
  const report = h.extract(s.projects, { out, minKb: 1 });
  assert.match(report, /extracted C--work-app__big\.md/);
  assert.match(report, /skip {6}C--work-app-atlas-test/);
  assert.ok(!fs.existsSync(path.join(out, 'C--work-app__tiny.md')), 'a tiny session is skipped');
  const text = fs.readFileSync(path.join(out, 'C--work-app__big.md'), 'utf8');
  assert.match(text, /U: Sistema il build che non parte/);
  assert.match(text, /U: da ora in poi non usare mai npm install -g/);
  assert.match(text, /A: \*\*Deciso:\*\* le dipendenze restano locali/);
  assert.ok(!text.includes('lots of output'), 'tool results are dropped');
  assert.ok(!text.includes('Altro paragrafo di cronaca'), 'plain narration is dropped');
  assert.ok(!/U: ok\b/.test(text), 'bare acknowledgements are dropped');
  assert.match(text, /project: C:\/work\/app/);
});

test('docs copies project markdown with its origin, skips big and generated files', () => {
  const s = setup();
  const root = path.join(s.root, 'hub');
  fs.mkdirSync(path.join(root, 'P1', 'node_modules', 'x'), { recursive: true });
  fs.mkdirSync(path.join(root, 'P1', 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'P1', 'README.md'), '# P1\nDeciso: niente Electron.\n');
  fs.writeFileSync(path.join(root, 'P1', 'docs', 'NOTE.md'), 'note\n');
  fs.writeFileSync(path.join(root, 'P1', 'node_modules', 'x', 'README.md'), 'dep\n');
  fs.writeFileSync(path.join(root, 'P1', 'BIG.md'), 'x'.repeat(200 * 1024));
  const out = path.join(s.root, 'docs');
  const report = h.docs(root, { out, maxKb: 120 });
  assert.match(report, /copied {4}P1\/README\.md/);
  assert.match(report, /copied {4}P1\/docs\/NOTE\.md/);
  assert.match(report, /skip {6}P1\/BIG\.md/);
  assert.ok(!report.includes('node_modules'));
  assert.match(fs.readFileSync(path.join(out, 'doc__P1__README.md'), 'utf8'), /^# document P1\/README\.md\nroot: /);
});

test('pairs and verdicts: notes that may say the same thing or contradict each other', () => {
  const s = setup();
  const w = (slug, title, desc, body) => fs.writeFileSync(path.join(s.vault, `${slug}.md`), `---\nname: ${slug}\ndescription: ${desc}\nmetadata:\n  type: project\n---\n\n${body}\n`);
  w('dati-dal-2009', 'Dati dal 2009', 'dati Dukascopy tenuti dal 2009, HistData secondario', 'I dati Dukascopy si tengono dal 2009.');
  w('dati-dal-2015', 'Dati dal 2015', 'dati Dukascopy solo dal 2015, niente prima', 'I dati Dukascopy prima del 2015 non si tengono.');
  w('vetro', 'Vetro satinato', 'effetto vetro satinato scelto per i widget', 'Opzione B.');
  const list = h.pairs(s.vault);
  assert.ok(list.some((p) => [p.a, p.b].sort().join('|') === 'dati-dal-2009|dati-dal-2015'), 'the two data notes are a pair');
  assert.ok(!list.some((p) => p.a === 'vetro' || p.b === 'vetro'), 'the glass note shares nothing');
  assert.match(h.pairsReport(s.vault), /dati-dal-2009 {2}↔ {2}dati-dal-2015/);
  const vf = path.join(s.root, 'v.json');
  fs.writeFileSync(vf, JSON.stringify([{ a: 'dati-dal-2009', b: 'dati-dal-2015', verdict: 'contradiction', why: 'una dice 2009, l\'altra 2015' }, { a: 'vetro', b: 'esistente', verdict: 'neither' }]));
  assert.match(h.verdictsWrite(s.vault, vf), /2 recorded · 0 same · 1 contradiction/);
  assert.match(h.verdictsList(s.vault), /^contradiction dati-dal-2009 {2}↔ {2}dati-dal-2015/);
  assert.equal(JSON.parse(h.verdictsList(s.vault, true)).length, 2);
  fs.rmSync(path.join(s.vault, 'dati-dal-2015.md'));
  assert.equal(h.verdictsList(s.vault), 'no pair marked as the same thing or as a contradiction', 'a verdict on a note that is gone is not shown');
});

test('inbox: write, list, accept into the vault with an index line, reject and never propose again', () => {
  const s = setup();
  const cands = path.join(s.root, 'c.json');
  fs.writeFileSync(cands, JSON.stringify([
    { name: 'Dipendenze locali', description: 'mai npm install -g', type: 'feedback', body: 'Le dipendenze restano locali.\n\n**Why:** il profilo non si tocca.\n**How to apply:** niente -g.', source: 'C--work-app__big' },
    { name: 'Esistente', description: 'doppione', type: 'project', body: 'già nel vault', source: 'x' },
    { name: 'Da rifiutare', description: 'no', type: 'project', body: 'rumore', source: 'C--work-app__big' },
    { description: 'senza nome', body: 'x' },
    { name: 'Dipendenze sempre locali', description: 'mai usare npm install -g, tutto locale', type: 'feedback', body: 'uguale detto in altre parole', source: 'altra-sessione' },
  ]));
  const w = h.inboxWrite(s.vault, cands);
  assert.match(w, /candidate dipendenze-locali {2}\[feedback\]/);
  assert.match(w, /exists {4}esistente/);
  assert.match(w, /skip {6}malformed/);
  assert.match(w, /similar {3}dipendenze-sempre-locali ≈ dipendenze-locali/);
  assert.match(h.inboxList(s.vault), /dipendenze-locali/);
  assert.equal(JSON.parse(h.inboxList(s.vault, true)).length, 2);
  // accept
  assert.match(h.inboxAccept(s.vault, 'dipendenze-locali'), /accepted/);
  const note = fs.readFileSync(path.join(s.vault, 'dipendenze-locali.md'), 'utf8');
  assert.match(note, /^---\nname: dipendenze-locali\ndescription: "mai npm install -g"\nmetadata:\n {2}type: feedback\n---\n/);
  assert.ok(!note.includes('harvested:'), 'harvest fields are dropped from the note');
  assert.match(note, /Fonte: C--work-app__big/);
  assert.match(fs.readFileSync(path.join(s.vault, 'MEMORY.md'), 'utf8'), /- \[Dipendenze locali\]\(dipendenze-locali\.md\) — mai npm install -g/);
  assert.ok(!fs.existsSync(path.join(s.vault, '.atlas', 'inbox', 'dipendenze-locali.md')));
  // reject, then the same candidate again
  assert.match(h.inboxReject(s.vault, 'da-rifiutare'), /rejected/);
  assert.equal(h.inboxList(s.vault), 'inbox empty');
  assert.match(h.inboxWrite(s.vault, cands), /rejected {2}da-rifiutare \(seen before\)/);
  assert.throws(() => h.inboxAccept(s.vault, 'nope'), /no candidate/);
  assert.throws(() => h.inboxAccept(s.vault, '../x'), /bad slug/);
});
