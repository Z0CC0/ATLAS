// The status line: the dials that are on, read from the same state file the command hooks
// write, drawn after they ran, and nothing when everything is off.
// node --test tests/status.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(here, '..')
const require = createRequire(import.meta.url)
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-status-'))
process.env.CLAUDE_CONFIG_DIR = SANDBOX
const cfg = require(path.join(ROOT, 'hooks', 'atlas-config.js'))
const status = await import(pathToFileURL(path.join(ROOT, 'hooks', 'atlas-status.mjs')).href)
const modules = await import(pathToFileURL(path.join(ROOT, 'hooks', 'atlas-modules.mjs')).href)

test('the line names only what is on', () => {
  assert.equal(status.text('low:off:off:off'), 'atlas low')
  assert.equal(status.text('high:ask:on:on\n'), 'atlas high · ask · check · silent')
  assert.equal(status.text('off:ask:on:off', true), 'atlas ask · check · prune')
  assert.equal(status.text('off:off:off:off'), undefined)
  assert.equal(status.text(''), undefined)
  assert.equal(status.text('garbage'), undefined)
  assert.equal(status.text('', true), 'atlas prune')
})

test('the project is found the way the command hooks find it', async () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-status-repo-'))
  fs.mkdirSync(path.join(repo, '.git'))
  const deep = path.join(repo, 'src', 'lib')
  fs.mkdirSync(deep, { recursive: true })
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-status-bare-'))
  const pinned = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-status-pin-'))
  fs.writeFileSync(path.join(pinned, '.atlas.json'), '{}')
  fs.mkdirSync(path.join(pinned, 'a'))
  const exists = async (p) => fs.existsSync(p)
  for (const dir of [deep, repo, bare, path.join(pinned, 'a'), deep + path.sep, deep.replace(/\\/g, '/')]) {
    const mine = status.slug(await status.rootOf(dir, exists))
    assert.equal(mine, cfg.projectSlug(cfg.projectRoot(dir)), dir)
  }
})

test('ancestors end at the root, on both kinds of path', () => {
  assert.deepEqual(status.ancestors('C:\\a\\b'), ['C:\\a\\b', 'C:\\a', 'C:\\'])
  assert.deepEqual(status.ancestors('/a/b'), ['/a/b', '/a', '/'])
  assert.deepEqual(status.ancestors(''), [])
})

function engine({ atlas, state, cwd = '/work/shop' } = {}) {
  const drawn = []
  const $ = {
    env: { get: async (n) => (n === 'CLAUDE_CONFIG_DIR' ? '/cfg' : undefined) },
    session: { cwd: async () => cwd },
    fs: {
      exists: async (p) => p === '/work/.git',
      read: async (p) => {
        if (p === '/cfg/atlas.json' && atlas !== undefined) return atlas
        if (p === '/cfg/atlas-state/-work.state' && state !== undefined) return state()
        throw new Error('missing ' + p)
      },
    },
    ui: { status: (t) => drawn.push(t), log: () => {} },
  }
  const hooks = {}
  modules.register((event, fn) => { (hooks[event] ||= []).push(fn) })
  const fire = async (event, e = {}) => { for (const fn of hooks[event] || []) await fn($, e, async (x) => ({ passed: x })) }
  return { fire, drawn, hooks }
}

test('one module registers the compaction hook and the three that draw', () => {
  const { hooks } = engine()
  assert.deepEqual(Object.keys(hooks).sort(), ['prompt.submit', 'session.compact', 'session.start', 'turn.complete'])
})

test('drawn at the start, after a prompt and after a turn, from the project state', async () => {
  let raw = 'low:off:off:off'
  const { fire, drawn } = engine({ state: () => raw })
  await fire('session.start')
  raw = 'high:off:on:off'
  await fire('prompt.submit')
  raw = 'off:off:off:off'
  await fire('turn.complete')
  assert.deepEqual(drawn, ['atlas low', 'atlas high · check', undefined])
})

test('every hook passes on what the rest of the chain answered', async () => {
  const { hooks } = engine({ state: () => 'low:off:off:off' })
  const $ = { env: { get: async () => '/cfg' }, session: { cwd: async () => '/x' }, fs: { exists: async () => false, read: async () => { throw new Error('no') } }, ui: { status: () => {} } }
  for (const ev of ['session.start', 'prompt.submit', 'turn.complete']) assert.deepEqual(await hooks[ev][0]($, { a: 1 }, async (e) => ({ got: e })), { got: { a: 1 } })
})

test('no state file, a broken config, a failing engine: nothing drawn or the line removed, never a throw', async () => {
  const none = engine()
  await none.fire('session.start')
  assert.deepEqual(none.drawn, [undefined])
  const broken = engine({ atlas: '{ nope', state: () => 'low:ask:off:off' })
  await broken.fire('turn.complete')
  assert.deepEqual(broken.drawn, ['atlas low · ask'])
  const { hooks } = engine()
  const bad = { env: { get: async () => { throw new Error('boom') } }, ui: { status: () => { throw new Error('boom') } } }
  assert.deepEqual(await hooks['turn.complete'][0](bad, {}, async () => 'kept'), 'kept')
})

test('statusline false removes it, prune on is shown', async () => {
  const off = engine({ atlas: '{"statusline": false}', state: () => 'high:ask:on:on' })
  await off.fire('session.start')
  assert.deepEqual(off.drawn, [undefined])
  const pr = engine({ atlas: '{"prune": true}', state: () => 'low:off:off:off' })
  await pr.fire('session.start')
  assert.deepEqual(pr.drawn, ['atlas low · prune'])
})
