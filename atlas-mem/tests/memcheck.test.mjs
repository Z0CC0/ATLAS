// Run with: node --test tests/memcheck.test.mjs
// Everything happens in temporary folders: no real vault and no real repository is touched.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const tool = path.join(here, '..', 'tools', 'memcheck.mjs');
const m = await import(pathToFileURL(tool).href);

const SRC = `// invoice totals
import { rate } from "./tax";

// total with tax, rounded half up
export function invoiceTotal(lines) {
  let sum = 0;
  for (const l of lines) sum += l.qty * l.price;
  return Math.round(sum * (1 + rate));
}

export function printTotal(lines) { return String(invoiceTotal(lines)); }
`;

function setup(extraNotes = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memcheck-'));
  const repo = path.join(root, 'repo');
  const vault = path.join(root, 'vault');
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.mkdirSync(vault);
  const file = path.join(repo, 'src', 'totals.ts');
  fs.writeFileSync(file, SRC);
  const git = (...a) => execFileSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], { stdio: 'ignore' });
  git('init', '-q');
  git('add', '-A');
  git('commit', '-q', '-m', 'init');
  for (const slug of ['totals-rounding', ...extraNotes]) {
    fs.writeFileSync(path.join(vault, `${slug}.md`), `---\nname: ${slug}\ndescription: a note\nmetadata:\n  type: project\n---\n\nA fact.\n`);
  }
  return { root, repo, vault, file };
}

const run = (...args) => m.main(args);
const side = (vault) => JSON.parse(fs.readFileSync(path.join(vault, '.atlas', 'links.json'), 'utf8'));
const linkIt = (s) => run('link', s.vault, 'totals-rounding', s.repo, 'src/totals.ts', '4-9', 'invoiceTotal');
const check = (vault, write = false, repo = null) => m.runCheck(vault, { write, repo });

test('importing the tool does nothing', () => {
  assert.equal(typeof m.main, 'function');
});

test('fingerprint ignores line endings and trailing spaces, and nothing else', () => {
  const a = m.fingerprint(['a', '  b']);
  assert.equal(m.fingerprint(['a  ', '  b\t']), a);
  assert.notEqual(m.fingerprint(['a', 'b']), a, 'indentation counts');
  assert.notEqual(m.fingerprint(['a', '  c']), a);
  assert.match(a, /^sha256:[0-9a-f]{16}$/);
});

test('readLines: LF, CRLF and a BOM give the same lines', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memcheck-'));
  const w = (n, s) => { const p = path.join(dir, n); fs.writeFileSync(p, s); return p; };
  const lf = m.readLines(w('a', 'x\ny\n'));
  assert.deepEqual(lf, ['x', 'y']);
  assert.deepEqual(m.readLines(w('b', 'x\r\ny\r\n')), lf);
  assert.deepEqual(m.readLines(w('c', '﻿x\ny')), lf);
});

test('parseRange accepts 4-9 and 4, refuses the rest', () => {
  assert.deepEqual(m.parseRange('4-9'), { first: 4, last: 9 });
  assert.deepEqual(m.parseRange('4'), { first: 4, last: 4 });
  for (const bad of ['9-4', '0-3', 'a-b', '', '4-']) assert.throws(() => m.parseRange(bad));
});

test('isDefinition: definitions in several languages', () => {
  const yes = [
    ['export async function invoiceTotal(lines) {', 'invoiceTotal'],
    ['def invoice_total(self, lines):', 'invoice_total'],
    ['class Invoice:', 'Invoice'],
    ['func (s *Store) Total(id int) error {', 'Total'],
    ['pub fn total(id: u32) -> bool {', 'total'],
    ['const invoiceTotal = async (lines) => {', 'invoiceTotal'],
    ['export const RATE = 22;', 'RATE'],
    ['  async invoiceTotal(lines) {', 'invoiceTotal'],
    ['invoiceTotal: function (lines) {', 'invoiceTotal'],
    ['public int total(int id) {', 'total'],
    ['fun total(id: Int): Int {', 'total'],
    ['type Invoice struct {', 'Invoice'],
  ];
  for (const [line, sym] of yes) assert.ok(m.isDefinition(line, sym), `definition: ${line}`);
  assert.ok(m.isDefinition('int total(int id)', 'total', '{'), 'brace on the next line');
});

test('isDefinition: uses of the name are not definitions', () => {
  const no = [
    '  const t = await invoiceTotal(lines);',
    'export function printTotal(lines) { return String(invoiceTotal(lines)); }',
    'invoiceTotal(lines);',
    'invoiceTotal(lines)',
    '  return invoiceTotal(lines)',
    '// see invoiceTotal',
    'function invoiceTotalWithTax(lines) {',
    'const myinvoiceTotal = 1;',
  ];
  for (const line of no) assert.ok(!m.isDefinition(line, 'invoiceTotal'), `not a definition: ${line}`);
});

test('link records repo, file, lines, anchor, fingerprint and commit', () => {
  const s = setup();
  assert.match(linkIt(s), /linked totals-rounding .* note is firm/);
  const entry = side(s.vault).notes['totals-rounding'];
  const l = entry.links[0];
  assert.equal(l.file, 'src/totals.ts');
  assert.equal(l.lines, '4-9');
  assert.equal(l.anchor, 1, 'the definition is one line below the start of the range');
  assert.equal(l.symbol, 'invoiceTotal');
  assert.match(l.fingerprint, /^sha256:/);
  assert.match(l.commit, /^[0-9a-f]{4,}$/);
  assert.ok(path.isAbsolute(l.repo) || /^[a-z]:\//.test(l.repo));
  assert.equal(entry.trust, 'firm');
});

test('link refuses what it cannot stand behind', () => {
  const s = setup();
  assert.throws(() => run('link', s.vault, 'totals-rounding', s.repo, 'src/totals.ts', '1-3', 'invoiceTotal'), /not defined inside/);
  assert.throws(() => run('link', s.vault, 'totals-rounding', s.repo, 'src/totals.ts', '4-99', 'invoiceTotal'), /past the end/);
  assert.throws(() => run('link', s.vault, 'no-such-note', s.repo, 'src/totals.ts', '4-9', 'invoiceTotal'), /write the note first/);
  assert.throws(() => run('link', s.vault, 'totals-rounding', s.repo, '../outside.ts', '1-2', 'x'), /not inside/);
  assert.throws(() => run('link', s.vault, '../evil', s.repo, 'src/totals.ts', '4-9', 'invoiceTotal'), /not a note name/);
  assert.ok(!fs.existsSync(path.join(s.vault, '.atlas')), 'nothing was written');
});

test('linking the same symbol again replaces the link, it does not add one', () => {
  const s = setup();
  linkIt(s);
  linkIt(s);
  assert.equal(side(s.vault).notes['totals-rounding'].links.length, 1);
});

test('check: untouched code holds', () => {
  const s = setup();
  linkIt(s);
  const [r] = check(s.vault);
  assert.equal(r.verdict, 'firm');
  assert.equal(r.items[0].state, 'held');
});

test('check: code that only moved stays firm; --write updates the lines', () => {
  const s = setup();
  linkIt(s);
  fs.writeFileSync(s.file, '// one\n// two\n// three\n' + SRC);
  const [dry] = check(s.vault);
  assert.equal(dry.items[0].state, 'moved');
  assert.equal(side(s.vault).notes['totals-rounding'].links[0].lines, '4-9', 'a dry run writes nothing');
  const [r] = check(s.vault, true);
  assert.equal(r.verdict, 'firm');
  assert.equal(side(s.vault).notes['totals-rounding'].links[0].lines, '7-12');
  assert.equal(check(s.vault)[0].items[0].state, 'held');
});

test('check: the same code checked out with CRLF still holds', () => {
  const s = setup();
  linkIt(s);
  fs.writeFileSync(s.file, SRC.replace(/\n/g, '\r\n'));
  assert.equal(check(s.vault)[0].items[0].state, 'held');
});

test('check: a changed body makes the note suspect and says why', () => {
  const s = setup();
  linkIt(s);
  fs.writeFileSync(s.file, SRC.replace('Math.round', 'Math.floor'));
  const [r] = check(s.vault, true);
  assert.equal(r.verdict, 'suspect');
  assert.equal(r.items[0].state, 'changed');
  const entry = side(s.vault).notes['totals-rounding'];
  assert.equal(entry.trust, 'suspect');
  assert.match(entry.reason[0], /invoiceTotal in src\/totals\.ts changed/);
  const text = m.report([r]);
  assert.match(text, /suspect   1/);
  assert.match(text, /totals-rounding  invoiceTotal/);
});

test('linking again with the range the code has now clears the suspicion for good', () => {
  const s = setup();
  linkIt(s);
  const longer = SRC.replace('  let sum = 0;', '  let sum = 0;\n  if (!lines.length) return 0;');
  fs.writeFileSync(s.file, longer);
  assert.equal(check(s.vault, true)[0].verdict, 'suspect');
  assert.match(run('link', s.vault, 'totals-rounding', s.repo, 'src/totals.ts', '4-10', 'invoiceTotal'), /note is firm/);
  const entry = side(s.vault).notes['totals-rounding'];
  assert.equal(entry.trust, 'firm');
  assert.equal(entry.reason, undefined);
  assert.equal(entry.links[0].lines, '4-10');
  assert.equal(check(s.vault, true)[0].verdict, 'firm');
});

test('check: code put back as it was brings the note back to firm by itself', () => {
  const s = setup();
  linkIt(s);
  fs.writeFileSync(s.file, SRC.replace('Math.round', 'Math.floor'));
  check(s.vault, true);
  fs.writeFileSync(s.file, SRC);
  const [r] = check(s.vault, true);
  assert.equal(r.verdict, 'firm');
  assert.equal(r.was, 'suspect');
  assert.match(m.report([r]), /back to firm/);
  assert.equal(side(s.vault).notes['totals-rounding'].reason, undefined);
});

test('check: a removed symbol and a removed file are suspect', () => {
  const s = setup();
  linkIt(s);
  fs.writeFileSync(s.file, 'export function printTotal() { return "0"; }\n');
  assert.equal(check(s.vault)[0].items[0].state, 'gone');
  fs.rmSync(s.file);
  const [r] = check(s.vault);
  assert.equal(r.items[0].state, 'missing');
  assert.equal(r.verdict, 'suspect');
});

test('check: a repository that is not on this machine is reported, and trust is left alone', () => {
  const s = setup();
  linkIt(s);
  fs.rmSync(s.repo, { recursive: true, force: true });
  const [r] = check(s.vault, true);
  assert.equal(r.items[0].state, 'unreachable');
  assert.equal(r.verdict, 'firm', 'nothing was learned, so nothing changes');
  assert.equal(side(s.vault).notes['totals-rounding'].trust, 'firm');
  assert.match(m.report([r]), /not checked 1/);
});

test('check: of two definitions with the same name, the one that still matches is followed', () => {
  const s = setup();
  linkIt(s);
  const twin = 'function invoiceTotal(lines) {\n  return 0;\n}\n\n';
  fs.writeFileSync(s.file, twin + SRC);
  const [r] = check(s.vault);
  assert.equal(r.items[0].state, 'moved');
  assert.equal(r.items[0].first, 8);
});

test('a note with two links is suspect while either is broken, and one fixed link does not clear it', () => {
  const s = setup();
  linkIt(s);
  run('link', s.vault, 'totals-rounding', s.repo, 'src/totals.ts', '11', 'printTotal');
  fs.writeFileSync(s.file, SRC.replace('Math.round', 'Math.floor').replace('String(', 'String( '));
  assert.equal(check(s.vault, true)[0].verdict, 'suspect');
  assert.match(run('link', s.vault, 'totals-rounding', s.repo, 'src/totals.ts', '4-9', 'invoiceTotal'), /note is suspect/);
  assert.match(run('link', s.vault, 'totals-rounding', s.repo, 'src/totals.ts', '11', 'printTotal'), /note is firm/);
});

test('check --repo looks at one repository and cannot clear a note the others made suspect', () => {
  const s = setup();
  const repo2 = path.join(s.root, 'repo2');
  fs.mkdirSync(repo2);
  fs.writeFileSync(path.join(repo2, 'a.py'), 'def helper(x):\n    return x\n');
  linkIt(s);
  run('link', s.vault, 'totals-rounding', repo2, 'a.py', '1-2', 'helper');
  fs.writeFileSync(path.join(repo2, 'a.py'), 'def helper(x):\n    return x + 1\n');
  assert.equal(check(s.vault, true)[0].verdict, 'suspect');
  const [r] = check(s.vault, true, s.repo);
  assert.equal(r.partial, true);
  assert.equal(r.verdict, 'suspect');
  assert.equal(side(s.vault).notes['totals-rounding'].trust, 'suspect');
  assert.equal(side(s.vault).notes['totals-rounding'].reason.length, 1, 'the reason from the other repository is kept');
});

test('a note that was removed shows up as an orphan, and unlink clears it', () => {
  const s = setup();
  linkIt(s);
  fs.rmSync(path.join(s.vault, 'totals-rounding.md'));
  const [r] = check(s.vault);
  assert.equal(r.verdict, 'orphan');
  assert.match(m.report([r]), /orphan    1/);
  run('unlink', s.vault, 'totals-rounding');
  assert.deepEqual(side(s.vault).notes, {});
});

test('unlink with a symbol removes that link only', () => {
  const s = setup();
  linkIt(s);
  run('link', s.vault, 'totals-rounding', s.repo, 'src/totals.ts', '11', 'printTotal');
  run('unlink', s.vault, 'totals-rounding', 'printTotal');
  const links = side(s.vault).notes['totals-rounding'].links;
  assert.equal(links.length, 1);
  assert.equal(links[0].symbol, 'invoiceTotal');
});

test('rekey moves links to the surviving note and keeps the worse trust', () => {
  const s = setup(['totals-old']);
  linkIt(s);
  run('link', s.vault, 'totals-old', s.repo, 'src/totals.ts', '11', 'printTotal');
  fs.writeFileSync(s.file, SRC.replace('String(', 'String( '));
  check(s.vault, true);
  assert.match(run('rekey', s.vault, 'totals-old', 'totals-rounding'), /2 links, trust suspect/);
  const notes = side(s.vault).notes;
  assert.deepEqual(Object.keys(notes), ['totals-rounding']);
  assert.equal(notes['totals-rounding'].links.length, 2);
});

test('status counts by trust', () => {
  const s = setup();
  assert.deepEqual(m.status(s.vault), { notes_with_links: 0, firm: 0, suspect: 0, unverified: 0 });
  linkIt(s);
  assert.deepEqual(m.status(s.vault), { notes_with_links: 1, firm: 1, suspect: 0, unverified: 0 });
});

test('the note files themselves are never modified', () => {
  const s = setup();
  const note = path.join(s.vault, 'totals-rounding.md');
  const before = fs.readFileSync(note, 'utf8');
  linkIt(s);
  fs.writeFileSync(s.file, SRC.replace('Math.round', 'Math.floor'));
  check(s.vault, true);
  assert.equal(fs.readFileSync(note, 'utf8'), before);
});

test('command line: usage error exits 2, a refusal exits 1, a check prints the report', () => {
  const s = setup();
  const cli = (...a) => spawnSync(process.execPath, [tool, ...a], { encoding: 'utf8' });
  assert.equal(cli().status, 2);
  const bad = cli('link', s.vault, 'totals-rounding', s.repo, 'src/totals.ts', '1-3', 'invoiceTotal');
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /memcheck: invoiceTotal is not defined inside/);
  assert.equal(cli('link', s.vault, 'totals-rounding', s.repo, 'src/totals.ts', '4-9', 'invoiceTotal').status, 0);
  const out = cli('check', s.vault);
  assert.equal(out.status, 0);
  assert.match(out.stdout, /checked   1 notes with code links/);
  assert.match(cli('status', s.vault).stdout, /firm 1/);
});
