#!/usr/bin/env node
/**
 * ATLAS bench — the pictures in the READMEs, drawn from the measured files.
 *
 * No figure is written in here: costs come from fixed-costs.<version>.json, savings and losses from
 * results.opus.json. A README cannot run a script, so these are static SVG, and every chart has its
 * table in the text beside it. Colours are the project's own: red for the thing the page is about,
 * greys for the rest, on black with a white hairline.
 *
 * Usage: node readme-graphics.mjs <output folder> <repo name>
 */

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const C = { bg: '#000000', red: '#ff1f1f', text: '#f5f5f7', dim: '#98989d', faint: '#6e6e73', line: '#ffffff' };
const FONT = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const n = (v) => Number(v).toLocaleString('en-US');

const file = readdirSync(HERE).filter((f) => /^fixed-costs\..*\.json$/.test(f)).sort().pop();
const fixed = JSON.parse(readFileSync(join(HERE, file), 'utf8'));
const results = JSON.parse(readFileSync(join(HERE, 'results.opus.json'), 'utf8'));
const billed = fixed.rows._billed;
const saving = (k) => (results.saving.en[k] + results.saving.it[k]) / 2;

const frame = (w, h, body, title) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="14" fill="${C.bg}" stroke="${C.line}"/>
${body}
</svg>
`;
const text = (x, y, s, size, fill, extra = '') => `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" fill="${fill}" ${extra}>${esc(s)}</text>`;

function banner(name, tagline) {
  return frame(860, 170, [
    text(40, 92, 'ATLAS', 62, C.red, 'font-weight="800" letter-spacing="2"'),
    name === 'ATLAS' ? '' : text(250, 92, name.replace('ATLAS-', ''), 62, C.text, 'font-weight="300"'),
    text(42, 134, tagline, 19, C.dim),
  ].join('\n'), `${name}: ${tagline}`);
}

function stats(items, title) {
  const w = 860, cell = w / items.length;
  const body = items.map(([big, small], i) => {
    const x = cell * i + cell / 2;
    return [
      text(x, 58, big, 34, i === 0 ? C.red : C.text, 'font-weight="700" text-anchor="middle"'),
      text(x, 84, small, 13, C.dim, 'text-anchor="middle"'),
      i ? `<line x1="${cell * i}" y1="20" x2="${cell * i}" y2="90" stroke="${C.faint}"/>` : '',
    ].join('\n');
  }).join('\n');
  return frame(w, 110, body, title);
}

/** Horizontal bars on one axis from zero. `rows`: [label, value, highlighted, shown value]. */
function bars(title, note, rows) {
  const w = 860, left = 210, right = 100, top = 62, step = 32;
  const h = top + rows.length * step + 36;
  const max = Math.max(...rows.map((r) => Math.abs(r[1])));
  const scale = (w - left - right) / max;
  const body = [text(28, 34, title, 17, C.text, 'font-weight="600"')];
  rows.forEach(([label, value, on, shown], i) => {
    const y = top + i * step;
    const len = Math.max(2, Math.abs(value) * scale);
    body.push(text(left - 12, y + 14, label, 14, on ? C.text : C.dim, 'text-anchor="end"'));
    body.push(`<rect x="${left}" y="${y}" width="${len.toFixed(1)}" height="19" rx="4" fill="${on ? C.red : C.faint}"/>`);
    body.push(text(left + len + 10, y + 14, shown ?? n(value), 14, on ? C.text : C.dim));
  });
  body.push(text(28, h - 14, note, 12, C.faint));
  return frame(w, h, body.join('\n'), title);
}

const BUILDS = ['atlas-min', 'atlas', 'atlas-video', 'atlas-mem', 'atlas-code', 'atlas-max'].filter((b) => billed[b]);
const pct = (v) => { const r = Math.round(v); return `${r > 0 ? '+' : ''}${r === 0 ? 0 : r}%`; };
const session = (first, rem, s, turns) => ((first + turns * rem - turns * 500 * s) / (turns * 500)) * 100;

/** Bars either side of zero, because a saving and an extra cost must not look alike. */
function diverging(title, note, rows) {
  const w = 860, left = 210, right = 70, top = 62, step = 32;
  const h = top + rows.length * step + 36;
  const lo = Math.min(0, ...rows.map((r) => r[1])), hi = Math.max(0, ...rows.map((r) => r[1]));
  const scale = (w - left - right - 60) / (hi - lo || 1);
  const zero = left + 30 + -lo * scale;
  const body = [text(28, 34, title, 17, C.text, 'font-weight="600"')];
  rows.forEach(([label, value, on, shown], i) => {
    const y = top + i * step;
    const len = Math.max(2, Math.abs(value) * scale);
    body.push(text(left - 12, y + 14, label, 14, on ? C.text : C.dim, 'text-anchor="end"'));
    body.push(`<rect x="${(value < 0 ? zero - len : zero).toFixed(1)}" y="${y}" width="${len.toFixed(1)}" height="19" rx="4" fill="${on ? C.red : C.faint}"/>`);
    const tx = value < 0 ? zero + 8 : zero - 8;
    body.push(text(tx, y + 14, shown, 14, on ? C.text : C.dim, value < 0 ? '' : 'text-anchor="end"'));
  });
  body.push(`<line x1="${zero.toFixed(1)}" y1="${top - 6}" x2="${zero.toFixed(1)}" y2="${top + rows.length * step - 6}" stroke="${C.line}"/>`);
  body.push(text(28, h - 14, note, 12, C.faint));
  return frame(w, h, body.join('\n'), title);
}

function firstTurn(highlight) {
  return bars('What each build adds to the first turn at low, in tokens', `Billed on ${billed.model} at ${fixed.version}: one turn with the build on, minus the same turn with no plugin.`,
    BUILDS.map((b) => [b, billed[b].low, highlight.includes(b)]));
}

function sessions(highlight, turns) {
  return diverging(`A ${turns}-turn session at low against no plugin`, 'Left of the line is cheaper than no plugin, right of it costs more. 500-token answers.',
    BUILDS.map((b) => {
      const v = session(billed[b].low, fixed.rows[b].rem_low, saving(b === 'atlas-min' ? 'atlasmin-low' : 'atlas-low') / 100, turns);
      return [b, v, highlight.includes(b), pct(v)];
    }));
}

function compression() {
  const rows = [['atlas high', 'atlas-high'], ['atlas-min high', 'atlasmin-high'], ['atlas-min low', 'atlasmin-low'], ['atlas low', 'atlas-low'], ...(results.saving.en['caveman4-ultra'] !== undefined ? [['caveman ' + results.cavemanNew + ' ultracave', 'caveman4-ultra'], ['caveman ' + results.cavemanNew, 'caveman4-full']] : []), ['caveman 2.7.0 ultra', 'caveman-ultra'], ['caveman 2.7.0 full', 'caveman-full'], ['caveman 2.7.0 lite', 'caveman-lite']];
  return bars('Output saved per answer against no plugin', `Mean of English and Italian, 48 questions, 2 rounds, ${results.date}, ${results.model}. Visible tokens, thinking excluded.`,
    rows.map(([label, k]) => [label, saving(k), label.startsWith('atlas'), `${saving(k).toFixed(0)}%`]));
}

/** How atlas media works with THE STUDIO: four steps, and the notes that go back to the commands. No figure in it. */
function howItWorks() {
  const w = 860, h = 312, top = 64, bw = 178, bh = 164, gap = 30;
  const xs = [0, 1, 2, 3].map((i) => 28 + i * (bw + gap));
  const hair = (o) => `stroke="${C.line}" stroke-opacity="${o}"`;
  const box = (x, y, bw2, bh2, r, o) => `<rect x="${x + 0.5}" y="${y + 0.5}" width="${bw2 - 1}" height="${bh2 - 1}" rx="${r}" fill="none" ${hair(o)}/>`;
  const head = (i, lines) => lines.map((l, k) => text(xs[i] + 16, top + 30 + k * 19, l, 15, C.text, 'font-weight="600"')).join('\n')
    + text(xs[i] + bw - 16, top + 30, String(i + 1), 13, C.faint, 'text-anchor="end"');
  const lines = (i, y, ls, fill = C.dim, size = 13) => ls.map((l, k) => text(xs[i] + 16, y + k * 18, l, size, fill)).join('\n');
  const arrow = (x1, x2, y) => `<line x1="${x1}" y1="${y}" x2="${x2 - 6}" y2="${y}" stroke="${C.dim}" stroke-width="1.5"/><path d="M${x2} ${y} l-7 -4.5 v9 z" fill="${C.dim}"/>`;
  const pill = (y, a, b) => box(xs[1] + 12, y, bw - 24, 40, 6, 0.22)
    + text(xs[1] + 24, y + 17, a, 13, C.text) + text(xs[1] + 24, y + 33, b, 11, C.faint);
  const body = [text(28, 38, 'How atlas media makes a video with THE STUDIO', 17, C.text, 'font-weight="600"')];
  xs.forEach((x) => body.push(box(x, top, bw, bh, 10, 0.28)));
  for (let i = 0; i < 3; i++) body.push(arrow(xs[i] + bw + 5, xs[i + 1] - 5, top + bh / 2));
  body.push(head(0, ['You ask']), lines(0, top + 58, ['in plain words, in', 'the chat:']),
    lines(0, top + 104, ['“a 30-second video', 'that explains this', 'project”'], C.text));
  body.push(head(1, ['Commands drive', 'the editor']), pill(top + 64, 'without a window', 'the default'), pill(top + 112, 'in the window', 'you watch every step'));
  body.push(head(2, ['You leave notes']), lines(2, top + 58, ['a marker with a', 'comment, on either', 'timeline, while it', 'works or after']));
  const got = ['the film', 'an effects project', 'a montage project'];
  body.push(head(3, ['You get']));
  got.forEach((g, k) => {
    const y = top + 50 + k * 28;
    body.push(text(xs[3] + 16, y + 18, g, 13, C.text));
    if (k) body.push(`<line x1="${xs[3] + 16}" y1="${y}" x2="${xs[3] + bw - 16}" y2="${y}" ${hair(0.16)}/>`);
  });
  body.push(lines(3, top + 146, ['both open in the window'], C.faint, 12));
  // The notes go back to the commands: the one red line in the picture.
  const from = xs[2] + bw / 2, to = xs[1] + bw / 2, y0 = top + bh + 4, y1 = top + bh + 30;
  body.push(`<path d="M${from} ${y0} V${y1} H${to} V${y0 + 8}" fill="none" stroke="${C.red}" stroke-width="1.5"/><path d="M${to} ${y0} l-4.5 7 h9 z" fill="${C.red}"/>`);
  body.push(text((from + to) / 2, y1 + 22, '“resolve the notes”: each one is done and closed, or left open with the reason', 13, C.text, 'text-anchor="middle"'));
  return frame(w, h, body.join('\n'), 'How atlas media works: you ask, commands drive THE STUDIO without a window or in it while you watch, you leave notes on the timeline, the notes are resolved, and you get the film and two project files');
}

const out = process.argv[2];
const repo = process.argv[3];
if (!out || !repo) { console.error('usage: node readme-graphics.mjs <output folder> <repo name>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const save = (name, svg) => writeFileSync(join(out, name), svg);
const m = (b) => billed[b];
const low = (b) => session(m(b).low, fixed.rows[b].rem_low, saving(b === 'atlas-min' ? 'atlasmin-low' : 'atlas-low') / 100, 295);

const PAGES = {
  ATLAS: {
    tagline: 'Four dials for how a coding assistant talks to you.',
    stats: [[`${saving('atlas-high').toFixed(0)}%`, 'less output at high, every fact kept'], [n(m('atlas').low), 'tokens on the first turn at low'], ['6', 'commands'], ['2', 'subagents']],
    charts: () => { save('compression.svg', compression()); save('first-turn.svg', firstTurn(['atlas', 'atlas-min'])); save('session-40.svg', sessions(['atlas', 'atlas-min'], 40)); save('session-295.svg', sessions(['atlas', 'atlas-min'], 295)); },
  },
  'ATLAS-code': {
    tagline: 'Plan, test, verify, review, ship: the coding cycle, read only when used.',
    stats: [['28', 'commands'], ['10', 'subagents'], [n(m('atlas-code').low), 'tokens on the first turn at low'], [pct(low('atlas-code')), 'over 295 turns at low']],
    charts: () => { save('first-turn.svg', firstTurn(['atlas-code'])); save('session-40.svg', sessions(['atlas-code'], 40)); },
  },
  'ATLAS-mem': {
    tagline: 'A memory that notices when it has become false.',
    stats: [['11', 'commands'], ['16', 'tree-sitter grammars'], [n(m('atlas-mem').low), 'tokens on the first turn at low'], [pct(low('atlas-mem')), 'over 295 turns at low']],
    charts: () => { save('first-turn.svg', firstTurn(['atlas-mem'])); },
  },
  'ATLAS-video': {
    tagline: 'Video made on your machine: written with a framework, or recorded with a camera that follows you.',
    stats: [['8', 'commands'], ['0', 'uploads'], [n(m('atlas-video').low), 'tokens on the first turn at low'], [pct(low('atlas-video')), 'over 295 turns at low']],
    charts: () => { save('first-turn.svg', firstTurn(['atlas-video'])); save('how-it-works.svg', howItWorks()); },
  },
  'ATLAS-max': {
    tagline: 'All of it, in one install.',
    stats: [['32', 'commands'], ['10', 'subagents'], [n(m('atlas-max').low), 'tokens on the first turn at low'], [pct(low('atlas-max')), 'over 295 turns at low']],
    charts: () => { save('first-turn.svg', firstTurn(['atlas-max'])); save('session-40.svg', sessions(['atlas-max'], 40)); },
  },
};
const page = PAGES[repo];
if (!page) { console.error(`unknown repo ${repo}`); process.exit(2); }
save('banner.svg', banner(repo, page.tagline));
save('stats.svg', stats(page.stats, `${repo} in numbers`));
page.charts();
console.log(`${repo}: ${readdirSync(out).length} files in ${out}`);
