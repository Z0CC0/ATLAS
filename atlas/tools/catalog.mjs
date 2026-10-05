#!/usr/bin/env node
/**
 * ATLAS — one search across the public catalogues of agent extensions.
 *
 * The catalogues are large (one is 1.6 MB of JSON) and none of them may enter a
 * conversation. This reads them here and prints at most a handful of lines per
 * source, so `atlas-catalog` spends one command instead of a dozen fetches.
 *
 *   node catalog.mjs skills  "changelog commits"
 *   node catalog.mjs mcp     postgres
 *   node catalog.mjs plugins "code review"
 *   node catalog.mjs extras  "status line"
 *   node catalog.mjs all     postgres
 *
 * It only reads. It installs nothing, writes nothing, and sends nothing but the
 * search words. No dependencies: Node 18 or later, for `fetch`.
 *
 * Every source is independent: one that is down, slow or changed prints a single
 * `skipped` line and the others still answer. An empty result is printed as such,
 * never as an error, so "nothing there" and "could not look" stay apart.
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIMIT = 8;
const TIMEOUT_MS = 20000;

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const clip = (s, n = 130) => (clean(s).length > n ? clean(s).slice(0, n - 1) + '…' : clean(s));
const num = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(n));

async function get(url, as = 'json') {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'atlas-catalog', accept: 'application/json, text/plain, */*' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return as === 'json' ? await res.json() : await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** Every word of the query must appear somewhere in the text. */
function matcher(query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return (text) => {
    const t = String(text).toLowerCase();
    return words.every((w) => t.includes(w));
  };
}

/** A minimal CSV reader: quoted fields, doubled quotes, newlines inside quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const SOURCES = {
  // skills.sh answers this without a key, but the endpoint is not in its documentation:
  // when it stops answering, `npx skills find` is the documented way in.
  skills: [
    {
      name: 'skills.sh',
      note: 'install count is popularity, not safety; read the SKILL.md before naming one',
      async search(q) {
        const j = await get(`https://skills.sh/api/search?q=${encodeURIComponent(q)}&limit=${LIMIT}`);
        return (j.skills || []).map((s) => `${s.source}@${s.name} | ${num(s.installs || 0)} installs | skills.sh/${s.id}`);
      },
    },
  ],
  mcp: [
    {
      name: 'MCP Registry (official)',
      note: 'matches the server NAME only; try the product name, then a broader word',
      async search(q) {
        const word = q.trim().split(/\s+/)[0];
        const j = await get(`https://registry.modelcontextprotocol.io/v0.1/servers?search=${encodeURIComponent(word)}&version=latest&limit=${LIMIT}`);
        return (j.servers || []).map((x) => {
          const s = x.server || x;
          return `${s.name} | ${clip(s.description)} | ${s.websiteUrl || (s.repository && s.repository.url) || ''}`;
        });
      },
    },
    {
      // Keyless access works but contradicts Smithery's own documentation, so a refusal
      // here is expected one day and is not worth a retry.
      name: 'Smithery',
      note: 'searches by meaning; keyless access is undocumented and may stop',
      async search(q) {
        const j = await get(`https://registry.smithery.ai/servers?q=${encodeURIComponent(q)}&pageSize=${LIMIT}`);
        return (j.servers || []).map((s) => `${s.qualifiedName} | ${clip(s.description)} | ${num(s.useCount || 0)} uses${s.verified ? ' | verified' : ''} | smithery.ai/server/${s.qualifiedName}`);
      },
    },
  ],
  plugins: [
    ['claude-plugins-official', 'https://raw.githubusercontent.com/anthropics/claude-plugins-official/main/.claude-plugin/marketplace.json', 'in Claude Code by default: /plugin install <name>@claude-plugins-official'],
    ['claude-community', 'https://raw.githubusercontent.com/anthropics/claude-plugins-community/main/.claude-plugin/marketplace.json', 'add once with /plugin marketplace add anthropics/claude-plugins-community, then /plugin install <name>@claude-community'],
  ].map(([name, url, note]) => ({
    name,
    note,
    async search(q) {
      const j = await get(url);
      const hit = matcher(q);
      const all = (j.plugins || []).filter((p) => hit(`${p.name} ${p.description || ''} ${p.category || ''}`));
      const lines = all.slice(0, LIMIT).map((p) => `${p.name} | ${clip(p.description)} | ${p.homepage || ''}`);
      if (all.length > LIMIT) lines.push(`(${all.length - LIMIT} more match; narrow the words)`);
      return lines;
    },
  })),
  extras: [
    {
      name: 'awesome-claude-code',
      note: 'hooks, status lines, tooling, workflows; a curated list, checked by its maintainer',
      async search(q) {
        const rows = parseCsv(await get('https://raw.githubusercontent.com/hesreallyhim/awesome-claude-code/main/THE_RESOURCES_TABLE_NEW.csv', 'text'));
        const head = rows.shift() || [];
        const col = (n) => head.indexOf(n);
        const [iName, iCat, iLink, iActive, iDesc, iStale] = ['Display Name', 'Category', 'Link', 'Active', 'Description', 'Stale'].map(col);
        const hit = matcher(q);
        return rows
          .filter((r) => hit(`${r[iName]} ${r[iCat]} ${r[iDesc]}`))
          .slice(0, LIMIT)
          .map((r) => {
            const flags = [r[iActive] === 'FALSE' ? 'inactive' : '', r[iStale] === 'TRUE' ? 'stale' : ''].filter(Boolean).join(', ');
            return `${r[iName]} | ${r[iCat]} | ${clip(r[iDesc])} | ${r[iLink]}${flags ? ' | ' + flags : ''}`;
          });
      },
    },
  ],
};

async function run(kind, query) {
  const kinds = kind === 'all' ? Object.keys(SOURCES) : [kind];
  const jobs = kinds.flatMap((k) => SOURCES[k].map((source) => ({ k, source })));
  const done = await Promise.all(jobs.map(async ({ k, source }) => {
    try {
      return { k, source, lines: await source.search(query) };
    } catch (err) {
      return { k, source, error: err.name === 'AbortError' ? `no answer in ${TIMEOUT_MS / 1000} s` : clean(err.message) };
    }
  }));
  const out = [];
  for (const { k, source, lines, error } of done) {
    out.push(`## ${k} — ${source.name}`);
    if (error) out.push(`skipped: ${error}`);
    else if (!lines.length) out.push('nothing matched');
    else out.push(...lines, `note: ${source.note}`);
    out.push('');
  }
  return out.join('\n');
}

// Nothing runs on import: a test that loads this file must not start a search.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [kind, ...rest] = process.argv.slice(2);
  const query = rest.join(' ').trim();
  if (!kind || !query || !(kind === 'all' || kind in SOURCES)) {
    console.error(`usage: node catalog.mjs <${Object.keys(SOURCES).join('|')}|all> <words>`);
    process.exit(2);
  }
  process.stdout.write(await run(kind, query));
}

export { parseCsv, matcher, clip, num, run, SOURCES };
