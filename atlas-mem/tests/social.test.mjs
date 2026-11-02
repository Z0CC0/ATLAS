// Run with: node --test tests/social.test.mjs
// Offline: nothing here touches the network. The sources themselves are tried by hand.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { SOURCES, NEEDS_ACCOUNT, run, clip } = await import(pathToFileURL(path.join(here, '..', 'tools', 'social.mjs')).href);

test('each source turns its own answer into date, score, link and title', () => {
  assert.deepEqual(SOURCES.hackernews.read({ hits: [{ created_at: '2026-10-01T10:00:00Z', points: 12, objectID: '7', title: 'A post' }] }), ['2026-10-01  12 points  news.ycombinator.com/item?id=7  A post']);
  assert.deepEqual(SOURCES.lemmy.read({ posts: [{ post: { published: '2026-09-01T00:00:00Z', ap_id: 'https://l/post/1', name: 'B' }, counts: { score: 3 } }] }), ['2026-09-01  3 points  https://l/post/1  B']);
  assert.deepEqual(SOURCES.stackexchange.read({ items: [{ creation_date: 1700000000, score: 5, link: 'https://so/q/1', title: 'C' }] }), ['2023-11-14  5 points  https://so/q/1  C']);
  assert.deepEqual(SOURCES.github.read({ items: [{ created_at: '2026-01-02T00:00:00Z', comments: 4, html_url: 'https://gh/1', title: 'D' }] }), ['2026-01-02  4 comments  https://gh/1  D']);
});

test('an answer with no results, or with an unknown shape, gives no lines', () => {
  for (const s of Object.values(SOURCES)) assert.deepEqual(s.read({}), []);
});

test('markup in a comment is removed and a long title is cut', () => {
  assert.equal(clip('<p>one <b>two</b></p>'), 'one two');
  assert.equal(clip('x'.repeat(200)).length, 110);
});

test('nothing matched, could not look and not read stay three different things', async () => {
  const out = await run('words', async (url) => {
    if (url.includes('algolia')) return { hits: [] };
    throw new Error('HTTP 403');
  });
  assert.match(out, /## Hacker News\nnothing matched/);
  assert.match(out, /## Lemmy\ncould not look: HTTP 403/);
  assert.match(out, new RegExp(`Not read here, an account is needed: ${NEEDS_ACCOUNT[0]}`));
});

test('only the search words leave: every address is a fixed host and the encoded query', () => {
  for (const s of Object.values(SOURCES)) {
    const u = new URL(s.url('a&b=c'));
    assert.equal(u.protocol, 'https:');
    assert.match(u.href, /a%26b%3Dc/);
  }
});
