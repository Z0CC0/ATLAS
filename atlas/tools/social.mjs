#!/usr/bin/env node
/**
 * ATLAS — one search across the public discussion sites that answer without an account.
 *
 *   node social.mjs "claude code hooks"
 *
 * It reads only what these sites offer to anyone, with no login, no key and no cookie, and sends
 * nothing but the search words. It does not try to get round a block: a site that refuses is
 * printed as refused. The networks that need an account are listed at the end, so whoever reads
 * the output knows what was not looked at; `atlas-research` then tries them through the search
 * engine, which sees only what they let it index.
 *
 * Every source is independent: one that is down prints a single line and the others still answer.
 * "Nothing matched" and "could not look" stay apart. No dependencies: Node 18 or later.
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIMIT = 6;
const TIMEOUT_MS = 15000;
const clean = (s) => String(s ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const clip = (s, n = 110) => (clean(s).length > n ? clean(s).slice(0, n - 1) + '…' : clean(s));
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : 'no date');

async function get(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'atlas-research', accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const line = (date, points, link, title) => `${day(date)}  ${points}  ${link}  ${clip(title)}`;

// Each source: where to ask, and how to turn its answer into lines. `read` is pure, so it can be tested offline.
const SOURCES = {
  hackernews: {
    name: 'Hacker News',
    url: (q) => `https://hn.algolia.com/api/v1/search?hitsPerPage=${LIMIT}&query=${encodeURIComponent(q)}`,
    read: (d) => (d.hits || []).map((h) => line(h.created_at, `${h.points ?? 0} points`, `news.ycombinator.com/item?id=${h.story_id ?? h.objectID}`, h.title || h.story_title || h.comment_text)),
  },
  lemmy: {
    name: 'Lemmy',
    url: (q) => `https://lemmy.world/api/v3/search?type_=Posts&sort=TopAll&limit=${LIMIT}&q=${encodeURIComponent(q)}`,
    read: (d) => (d.posts || []).map((p) => line(p.post?.published, `${p.counts?.score ?? 0} points`, p.post?.ap_id, p.post?.name)),
  },
  stackexchange: {
    name: 'Stack Overflow',
    url: (q) => `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&site=stackoverflow&pagesize=${LIMIT}&q=${encodeURIComponent(q)}`,
    read: (d) => (d.items || []).map((i) => line(i.creation_date * 1000, `${i.score ?? 0} points`, i.link, i.title)),
  },
  github: {
    name: 'GitHub issues and discussions',
    url: (q) => `https://api.github.com/search/issues?per_page=${LIMIT}&q=${encodeURIComponent(q)}`,
    read: (d) => (d.items || []).map((i) => line(i.created_at, `${i.comments ?? 0} comments`, i.html_url, i.title)),
  },
};

// Tried on 2026-11-02 with no account: these refused, sent to a login, or returned nothing.
const NEEDS_ACCOUNT = ['Reddit', 'X', 'Bluesky', 'LinkedIn', 'Instagram', 'TikTok', 'Facebook', 'Threads', 'Mastodon'];

async function run(query, fetcher = get) {
  const done = await Promise.all(Object.entries(SOURCES).map(async ([k, s]) => {
    try {
      return { k, s, lines: s.read(await fetcher(s.url(query))) };
    } catch (err) {
      return { k, s, error: err.name === 'AbortError' ? `no answer in ${TIMEOUT_MS / 1000} s` : clean(err.message) };
    }
  }));
  const out = [];
  for (const { s, lines, error } of done) {
    out.push(`## ${s.name}`);
    if (error) out.push(`could not look: ${error}`);
    else if (!lines.length) out.push('nothing matched');
    else out.push(...lines);
    out.push('');
  }
  out.push(`## Not read here, an account is needed: ${NEEDS_ACCOUNT.join(', ')}`);
  return out.join('\n') + '\n';
}

// Nothing runs on import: a test that loads this file must not start a search.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const query = process.argv.slice(2).join(' ').trim();
  if (!query) {
    console.error('usage: node social.mjs <words>');
    process.exit(2);
  }
  process.stdout.write(await run(query));
}

export { SOURCES, NEEDS_ACCOUNT, run, clean, clip };
