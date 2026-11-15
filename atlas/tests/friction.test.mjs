// The friction report: counts from a transcript, never its content.
// node --test tests/friction.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(here, '..')
const require = createRequire(import.meta.url)
const friction = require(path.join(ROOT, 'hooks', 'atlas-friction.js'))
const tracker = require(path.join(ROOT, 'hooks', 'atlas-tracker.js'))
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-friction-'))

// A transcript the way Claude Code writes one: one JSON object per line.
let n = 0
const user = (text, promptId = `p${n++}`, extra = {}) => ({ type: 'user', promptId, message: { role: 'user', content: text }, ...extra })
const use = (id, name, input, usage) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }], usage } })
const result = (id, content, is_error = false) => ({ type: 'user', promptId: 'x', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content, is_error }] } })
const said = (text, usage) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }], usage } })
const write = (rows) => { const f = path.join(DIR, `t${n++}.jsonl`); fs.writeFileSync(f, rows.map((r) => JSON.stringify(r)).join('\n') + '\n{"torn'); return f }
const long = (k, c = 'x') => c.repeat(k)
const SECRET = 'the password is hunter2'

const session = () => [
  user(`please look at the config, ${SECRET}`),
  use('a', 'Read', { file_path: 'C:\\repo\\src\\config.js' }),
  result('a', long(9000) + SECRET),
  use('b', 'Bash', { command: 'npm test' }),
  result('b', long(3000, 'E'), true),
  use('c', 'Bash', { command: 'npm test' }),
  result('c', 'ok'),
  use('d', 'Read', { file_path: 'C:/repo/src/config.js' }),
  result('d', [{ type: 'text', text: long(9000, 'y') }, { type: 'image', source: { data: long(500000) } }]),
  { type: 'attachment', attachment: { type: 'hook_additional_context' }, rendered: [{ content: long(700) }] },
  { type: 'attachment', attachment: { type: 'skill_listing' }, rendered: [{ content: long(5000) }] },
  { type: 'user', isSidechain: true, message: { role: 'user', content: 'a subagent prompt, not counted' } },
  said('done', { input_tokens: 10, cache_creation_input_tokens: 2000, cache_read_input_tokens: 40000 }),
  user('thanks'), said('ok'), user('one'), said('ok'), user('two'), said('ok'), user('three'), said('ok'),
]

test('counts: prompts, calls, failures, sizes, and an image is an image', async () => {
  const text = await friction.report(write(session()))
  assert.match(text, /^session: 5 prompts, 4 tool calls, 1 failed \(25%\), 0 compactions, 42,010 tokens in the last request/)
  assert.match(text, /Read\s+2\s+0\s+18,023\s+9,023/)
  assert.match(text, /Bash\s+2\s+1\s+3,002\s+3,000/)
  assert.match(text, /1 image in tool results \(counted as images, not as characters\)/)
  assert.match(text, /config\.js read 2 times, 18,023 characters in all/)
  assert.match(text, /largest results\n {2}Read 9,023 \(prompt 1\) · Read 9,000 \(prompt 1\) · Bash 3,000 \(prompt 1\)/)
  assert.match(text, /injected along the way: 5,700 characters in 2 blocks\n {2}skill_listing 5,000 · hook_additional_context 700/)
})

test('nothing of the content is printed: no prompt, no result text, no folder', async () => {
  const text = await friction.report(write(session()))
  assert.ok(!text.includes('hunter2') && !text.includes('password') && !text.includes('please look'))
  assert.ok(!text.includes('repo') && !text.includes('npm test'))
})

test('what a pruning compaction would free is estimated on the conversation as it stands', async () => {
  const text = await friction.report(write(session()))
  assert.match(text, /a pruning compaction now would free \d\d% \([\d,]+ to [\d,]+ characters\) and keep every word/)
  const small = await friction.report(write([user('hi'), said('hello'), user('one'), said('two')]))
  assert.match(small, /would free 0%, under its 25% minimum: a summary would run/)
})

test('a compaction is counted, and messages written again after it are not counted twice', async () => {
  const rows = [
    user('first', 'p-a'), use('a', 'Read', { file_path: '/r/a.js' }), result('a', long(4000)), said('ok'),
    user('second', 'p-b'), said('ok'),
    { type: 'system', subtype: 'compact_boundary', compactMetadata: { preTokens: 50000, postTokens: 8000 } },
    // the kept messages, written again under one prompt id, the call with its old id
    user('first', 'p-c'), use('a', 'Read', { file_path: '/r/a.js' }), result('a', '[atlas prune: 4000 characters left out]'), said('ok'),
    user('second', 'p-c'), said('ok'),
    user('<command-name>/compact</command-name>', 'p-c'),
    user('third', 'p-d'), said('ok'),
  ]
  const text = await friction.report(write(rows))
  assert.match(text, /^session: 4 prompts, 1 tool call, 0 failed \(0%\), 1 compaction/)
  assert.match(text, /the compactions so far freed 42,000 tokens/)
})

test('no transcript, a missing one, an empty one: one line, never a throw', async () => {
  assert.match(await friction.report(undefined), /no transcript/)
  assert.match(await friction.report(path.join(DIR, 'nope.jsonl')), /is not there/)
  const empty = path.join(DIR, 'empty.jsonl'); fs.writeFileSync(empty, '')
  assert.match(await friction.report(empty), /^session: 0 prompts, 0 tool calls, 0 failed \(0%\), 0 compactions$/)
})

test('atlas friction is recognised, and only as the whole message', () => {
  const is = (p) => tracker.FRICTION_PATTERNS.some((re) => re.test(p))
  assert.ok(is('atlas friction') && is('/atlas:atlas friction') && is('/atlas-code:atlas friction?'))
  assert.ok(!is('atlas friction in this repo') && !is('what is atlas friction') && !is('/atlas-help friction'))
})

test('the prompt hook prints the report of the session it runs in', () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-friction-cfg-'))
  const out = execFileSync(process.execPath, [path.join(ROOT, 'hooks', 'atlas-tracker.js')], { input: JSON.stringify({ prompt: 'atlas friction', cwd: DIR, session_id: 's', transcript_path: write(session()) }), env: { ...process.env, CLAUDE_CONFIG_DIR: sandbox }, encoding: 'utf8' })
  const text = JSON.parse(out).hookSpecificOutput.additionalContext
  assert.match(text, /Print exactly the lines below/)
  assert.match(text, /session: 5 prompts, 4 tool calls/)
})
