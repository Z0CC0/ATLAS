#!/usr/bin/env node
/**
 * ATLAS — the notes of a report, checked before the writer reads them.
 *
 *   node report.mjs check <folder of notes>
 *
 * In report mode several researchers return notes in one fixed shape (search/report.md): a
 * title, then for each key question a takeaway, cited findings, inferences and gaps. The
 * writer builds on those notes without opening a page, so a note that lost its shape, or a
 * "finding" with no source, becomes a claim in the report that nobody can trace. This reads
 * each note and prints what is missing, by file and line, so the caller can send that one
 * note back to its researcher once.
 *
 * It reads and prints. It changes nothing, opens no page, and cannot tell whether a source
 * says what the note claims: only that every finding names one.
 *
 * The idea of checking what a subagent hands over before it is used after
 * Yeachan-Heo/oh-my-claudecode (MIT, `verify-deliverables`). The check and the code are ours.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SECTIONS = ['takeaway', 'cited findings', 'inferences', 'gaps'];
const URL = /https?:\/\/[^\s)>\]]+/;
const DATED = /\b(?:19|20)\d{2}\b|\bundated\b/i;

/** The problems of one note, as `{ line, text }`; empty when it is in shape. */
export function checkNote(text) {
  const problems = [];
  const lines = String(text).replace(/\r\n/g, '\n').split('\n');
  const say = (line, t) => problems.push({ line, text: t });
  if (!/^# \S/.test(lines.find((l) => l.trim()) || '')) say(1, 'no title: the note starts with "# <subtopic>"');

  // key questions, each with its sections and the bullets under them
  const questions = [];
  let q = null, section = null;
  lines.forEach((raw, i) => {
    const l = raw.trimEnd();
    if (/^## \S/.test(l)) { q = { line: i + 1, name: l.slice(3).trim(), sections: new Map() }; questions.push(q); section = null; return; }
    if (/^### \S/.test(l)) {
      section = l.slice(4).trim().toLowerCase();
      if (q) q.sections.set(section, { line: i + 1, bullets: [], words: 0 });
      return;
    }
    if (!q || !section || !q.sections.has(section)) return;
    const s = q.sections.get(section);
    if (/^\s*[-*] \S/.test(l)) s.bullets.push({ line: i + 1, text: l.replace(/^\s*[-*] /, '') });
    else if (l.trim() && s.bullets.length && /^\s{2,}\S/.test(raw)) s.bullets[s.bullets.length - 1].text += ' ' + l.trim();
    else if (l.trim()) s.words += l.trim().split(/\s+/).length;
  });

  if (!questions.length) say(1, 'no key question: each one is a "## <question>" with its four sections');
  for (const k of questions) {
    for (const name of SECTIONS) if (!k.sections.has(name)) say(k.line, `"${k.name}" has no "### ${name[0].toUpperCase() + name.slice(1)}"`);
    const take = k.sections.get('takeaway');
    if (take && !take.words && !take.bullets.length) say(take.line, `"${k.name}": the takeaway is empty`);
    const cited = k.sections.get('cited findings');
    const gaps = k.sections.get('gaps');
    if (cited) {
      for (const b of cited.bullets) {
        if (!URL.test(b.text)) say(b.line, 'a finding with no URL: it is an inference, or its source is missing');
        else if (!DATED.test(b.text.replace(URL, ''))) say(b.line, 'a finding with no date: the date of the page, or "undated"');
      }
      // nothing found is a legitimate answer only when the gaps say what was looked for
      if (!cited.bullets.length && !(gaps && (gaps.bullets.length || gaps.words))) say(cited.line, `"${k.name}": no finding and no gap named: what was looked for, and where?`);
    }
    const inf = k.sections.get('inferences');
    if (inf) for (const b of inf.bullets) if (URL.test(b.text) && !/inference/i.test(b.text)) say(b.line, 'an inference that carries a URL: a fact goes under Cited findings, or the bullet is marked as inference');
  }
  return problems.sort((a, b) => a.line - b.line);
}

/** Every note of a folder: `[{ file, problems, findings }]`. */
export function checkFolder(dir) {
  return readdirSync(dir).filter((n) => n.endsWith('.md')).sort().map((file) => {
    const text = readFileSync(join(dir, file), 'utf8');
    const findings = (text.match(/^\s*[-*] .*https?:\/\//gm) || []).length;
    return { file, problems: checkNote(text), findings };
  });
}

export function render(results) {
  if (!results.length) return 'report check: no notes in the folder';
  const bad = results.filter((r) => r.problems.length);
  const out = [`report check: ${results.length} note${results.length === 1 ? '' : 's'}, ${bad.length} to send back`];
  for (const r of results) {
    out.push(r.problems.length ? `${r.file}  ${r.problems.length} problem${r.problems.length === 1 ? '' : 's'}` : `${r.file}  in shape, ${r.findings} cited finding${r.findings === 1 ? '' : 's'}`);
    for (const p of r.problems.slice(0, 12)) out.push(`  line ${p.line}  ${p.text}`);
    if (r.problems.length > 12) out.push(`  (${r.problems.length - 12} more)`);
  }
  return out.join('\n');
}

// Nothing runs on import.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, dir] = process.argv.slice(2);
  if (cmd !== 'check' || !dir || !existsSync(dir) || !statSync(dir).isDirectory()) {
    console.error('usage: node report.mjs check <folder of notes>');
    process.exit(2);
  }
  process.stdout.write(render(checkFolder(dir)) + '\n');
}
