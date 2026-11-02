// Legibility gate for a HyperFrames composition (or any page with one paused GSAP timeline on
// window.__timelines). Seeks the timeline every 0.04 s; an element marked data-read counts as
// visible only while its box is fully inside the frame, its effective opacity (the product of
// its ancestors') is at least 0.95 and no ancestor is blurred. Each run must hold at least
// max(1.5, letters / 15 + 1.5) seconds (characters / 4.5 for Chinese, Japanese, Korean). Exit 1
// on any failure. The formula: lemomo-ai/lemo-opuscar, MIT.
//   npm i -D playwright-core   (once, in the project; it uses the Chrome already installed)
//   node readcheck.mjs [--html index.html] [--timeline main] [--step 0.04] [--min 1.5] [--latin-cps 15] [--cjk-cps 4.5]
//   CHROME_PATH=... overrides the browser path.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const require = createRequire(resolve(process.cwd(), 'package.json'));
const { chromium } = require('playwright-core');
const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : []).filter(Boolean));
const step = Number(args.step || 0.04), min = Number(args.min || 1.5), latin = Number(args['latin-cps'] || 15), cjk = Number(args['cjk-cps'] || 4.5);
const html = resolve(args.html || 'index.html'), timeline = args.timeline || 'main';
const CANDIDATES = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
const CHROME = CANDIDATES.find((p) => existsSync(p));
if (!CHROME) { console.error('no Chrome found; set CHROME_PATH'); process.exit(2); }

const browser = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
page.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 2; });
await page.goto(pathToFileURL(html).href);
await page.waitForFunction((tlName) => window.__timelines && window.__timelines[tlName] && document.fonts.status === 'loaded', timeline, { timeout: 30000 });
const meta = await page.evaluate(() => {
  const r = document.querySelector('[data-composition-id]');
  return { duration: Number(r.dataset.duration), width: Number(r.dataset.width), height: Number(r.dataset.height) };
});
await page.setViewportSize({ width: meta.width, height: meta.height });

const seen = new Map();
for (let t = 0; t <= meta.duration + 1e-9; t += step) {
  const texts = await page.evaluate(([tt, tlName]) => {
    window.__timelines[tlName].seek(tt, false);
    const out = [];
    for (const el of document.querySelectorAll('[data-read]')) {
      let op = 1, blurred = false, n = el;
      while (n && n !== document.body) {
        const cs = getComputedStyle(n);
        op *= Number(cs.opacity);
        const m = /blur\(([\d.]+)px\)/.exec(cs.filter || '');
        if (m && Number(m[1]) > 0.5) blurred = true;
        n = n.parentElement;
      }
      const r = el.getBoundingClientRect();
      const text = el.textContent.trim().replace(/\s+/g, ' ');
      out.push({ key: el.dataset.read || text, text, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom, op, blurred });
    }
    return out;
  }, [t, timeline]);
  for (const x of texts) {
    const inside = x.x0 >= 0 && x.y0 >= 0 && x.x1 <= meta.width && x.y1 <= meta.height;
    if (!inside || x.op < 0.95 || x.blurred) continue;
    const s = seen.get(x.key) || { first: t, last: t, runs: [], text: x.text };
    if (t - s.last > step * 1.5) { s.runs.push([s.first, s.last]); s.first = t; }
    s.last = t; s.text = x.text; seen.set(x.key, s);
  }
}
let fails = 0; const rows = [];
for (const [, s] of seen) {
  s.runs.push([s.first, s.last]);
  const chars = [...s.text];
  const isCjk = chars.some((c) => /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(c));
  const need = Math.max(min, isCjk ? chars.length / cjk + 1.5 : s.text.replace(/\s/g, '').length / latin + 1.5);
  for (const [a, b] of s.runs) {
    const held = b - a + step, ok = held + 1e-6 >= need;
    if (!ok) fails += 1;
    rows.push(`${ok ? 'ok  ' : 'FAIL'} ${a.toFixed(2).padStart(6)}-${b.toFixed(2).padStart(6)} held ${held.toFixed(2)} need ${need.toFixed(2)}  ${s.text.slice(0, 60)}`);
  }
}
console.log(rows.join('\n'));
console.log(`\n${seen.size} texts, ${fails} failures (${step} s step)`);
await browser.close();
process.exit(fails ? 1 : process.exitCode || 0);
