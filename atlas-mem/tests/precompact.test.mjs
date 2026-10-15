// The PreCompact hook keeps the decision-shaped lines of the session in the vault's harvest
// folder; nothing is written when there is no vault, no transcript or nothing to keep.
// node --test tests/precompact.test.mjs (from mem/)
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const hook = require(path.join(here, '..', 'hooks', 'atlas-precompact.js'))

const fresh = () => fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-precompact-'))
const line = (type, text, extra = {}) => JSON.stringify({ type, timestamp: '2026-10-15T10:00:00Z', cwd: 'C:/p', message: { content: [{ type: 'text', text }], model: 'm' }, ...extra })

function session(dir, texts) {
  const file = path.join(dir, 'abc.jsonl')
  fs.writeFileSync(file, texts.map(([who, t]) => line(who, t)).join('\n') + '\n')
  return file
}

test('a session with a decision is kept in <vault>/.atlas/harvest/<session>.md', async () => {
  const dir = fresh()
  const vault = path.join(dir, 'vault'); fs.mkdirSync(vault)
  fs.writeFileSync(path.join(dir, '.atlas.json'), JSON.stringify({ vault }))
  const transcript = session(dir, [['user', 'build the exporter please'], ['user', 'from now on never write to the data folder directly, always through the store'], ['assistant', 'Decided: the exporter goes through store.cjs.']])
  const r = await hook.keep({ transcript_path: transcript, cwd: dir, trigger: 'auto' })
  assert.ok(r.file, r.why)
  const text = fs.readFileSync(r.file, 'utf8')
  assert.match(text, /never write to the data folder/)
  assert.match(text, /kept before compaction/)
  assert.equal(path.basename(r.file), 'abc.md')
})

test('no vault: nothing written, no error', async () => {
  const dir = fresh()
  const transcript = session(dir, [['user', 'from now on always run the tests']])
  const r = await hook.keep({ transcript_path: transcript, cwd: dir })
  assert.equal(r.file, null)
  assert.equal(r.why, 'no vault')
})

test('no transcript, or nothing decision-shaped: nothing written', async () => {
  const dir = fresh()
  const vault = path.join(dir, 'vault'); fs.mkdirSync(vault)
  fs.writeFileSync(path.join(dir, '.atlas.json'), JSON.stringify({ vault }))
  assert.equal((await hook.keep({ transcript_path: path.join(dir, 'missing.jsonl'), cwd: dir })).why, 'no transcript')
  const transcript = session(dir, [['user', 'hello'], ['assistant', 'Hi.']])
  const r = await hook.keep({ transcript_path: transcript, cwd: dir })
  assert.equal(r.file, null)
  assert.ok(!fs.existsSync(path.join(vault, '.atlas', 'harvest')))
})

test('a second compaction of the same session replaces the file', async () => {
  const dir = fresh()
  const vault = path.join(dir, 'vault'); fs.mkdirSync(vault)
  fs.writeFileSync(path.join(dir, '.atlas.json'), JSON.stringify({ vault }))
  const transcript = session(dir, [['user', 'start'], ['user', 'rule: never push without asking']])
  const a = await hook.keep({ transcript_path: transcript, cwd: dir })
  fs.appendFileSync(transcript, line('user', 'we decided: the tests run before every commit') + '\n')
  const b = await hook.keep({ transcript_path: transcript, cwd: dir })
  assert.equal(a.file, b.file)
  const text = fs.readFileSync(b.file, 'utf8')
  assert.match(text, /never push/)
  assert.match(text, /tests run before every commit/)
  assert.equal((text.match(/kept before compaction/g) || []).length, 1)
})

test('after compaction the kept lines come back as additional context, capped', async () => {
  const dir = fresh()
  const vault = path.join(dir, 'vault'); fs.mkdirSync(vault)
  fs.writeFileSync(path.join(dir, '.atlas.json'), JSON.stringify({ vault }))
  const transcript = session(dir, [['user', 'start'], ['user', 'rule: never push without asking'], ['assistant', 'Decided: ' + 'x'.repeat(9000)]])
  await hook.keep({ transcript_path: transcript, cwd: dir })
  const ctx = hook.restore({ session_id: 'abc', cwd: dir, source: 'compact' })
  assert.ok(ctx)
  assert.match(ctx, /never push without asking/)
  assert.ok(!/# session/.test(ctx), 'header stripped')
  assert.ok(!/kept before compaction/.test(ctx), 'trailer stripped')
  assert.ok(ctx.length <= hook.CAP + 200, `capped: ${ctx.length}`)
  assert.equal(hook.restore({ session_id: 'nope', cwd: dir, source: 'compact' }), null)
})
