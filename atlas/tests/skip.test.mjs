// ATLAS_SKIP_HOOKS: a hook named there does nothing for that run, the others run as always.
// node --test tests/skip.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(here, '..')
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-skip-'))
const PROJECT = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-skip-proj-'))
const run = (file, input, skip, args = []) => execFileSync(process.execPath, [file, ...args], {
  input: JSON.stringify(input), encoding: 'utf8',
  env: { ...process.env, CLAUDE_CONFIG_DIR: SANDBOX, ATLAS_SKIP_HOOKS: skip },
})
const tracker = path.join(ROOT, 'hooks', 'atlas-tracker.js')
const activate = path.join(ROOT, 'hooks', 'atlas-activate.js')

test('every command hook carries the switch under its own name', () => {
  const names = []
  for (const dir of ['hooks', 'code/hooks', 'mem/hooks']) {
    const d = path.join(ROOT, dir)
    if (!fs.existsSync(d)) continue   // a built variant holds them all in hooks/
    for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.js'))) {
      const src = fs.readFileSync(path.join(d, f), 'utf8')
      if (!/require\.main === module/.test(src)) continue
      const m = /require\.main === module && !\/\(\?:\^\|\[,\\s\]\)\(\?:all\|([a-z]+)\)/.exec(src)
      assert.ok(m, `${dir}/${f} has no ATLAS_SKIP_HOOKS switch`)
      assert.equal(m[1], f.replace(/^atlas-/, '').replace(/\.js$/, ''), `${dir}/${f} answers to its own name`)
      names.push(m[1])
    }
  }
  assert.equal(new Set(names).size, names.length)
  assert.ok(names.includes('tracker') && names.includes('activate'))
})

test('a skipped hook prints nothing and writes nothing; unskipped it works', () => {
  const on = { prompt: 'atlas low', cwd: PROJECT, session_id: 's' }
  assert.equal(run(tracker, on, 'tracker'), '')
  assert.equal(run(tracker, on, 'recall, tracker'), '')
  assert.equal(run(tracker, on, 'ALL'), '')
  assert.equal(fs.existsSync(path.join(SANDBOX, 'atlas-state')), false)
  assert.match(run(tracker, on, 'recall,guard'), /low/)
  assert.match(run(tracker, on, ''), /low/)
  assert.ok(fs.readdirSync(path.join(SANDBOX, 'atlas-state')).some((n) => n.endsWith('.state')))
})

test('a name that only contains another is not that name', () => {
  assert.match(run(tracker, { prompt: 'atlas status', cwd: PROJECT, session_id: 's' }, 'trackers,xtracker'), /atlas low on/)
})

test('the session-start hook, skipped, injects no rules', () => {
  const input = { cwd: PROJECT, session_id: 's2', source: 'startup' }
  assert.ok(run(activate, input, '', ['--part', '1']).length > 500)
  assert.equal(run(activate, input, 'activate', ['--part', '1']), '')
})

test('the function hooks read the same variable', async () => {
  const prune = await import(pathToFileURL(path.join(ROOT, 'hooks', 'atlas-prune.mjs')).href)
  const status = await import(pathToFileURL(path.join(ROOT, 'hooks', 'atlas-status.mjs')).href)
  const $ = (skip) => ({
    env: { get: async (n) => ({ CLAUDE_CONFIG_DIR: '/cfg', ATLAS_SKIP_HOOKS: skip, ATLAS_PRUNE: '1' })[n] },
    fs: { read: async (p) => { if (p.endsWith('.state')) return 'low:off:off:off'; throw new Error('none') }, exists: async () => false },
    session: { cwd: async () => '/w' },
  })
  assert.equal(await prune.settings($('prune')), null)
  assert.equal(await prune.settings($('all')), null)
  assert.notEqual(await prune.settings($('statusline')), null)
  assert.equal(await status.line($('statusline, prune')), undefined)
  assert.equal(await status.line($('prune')), 'atlas low')
})
