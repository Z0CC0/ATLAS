// The pruning a compaction can do without a summary: what goes, what never goes, and the
// hook that falls back to Claude Code's own compaction. node --test tests/prune.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const lib = await import(pathToFileURL(path.join(here, '..', 'hooks', 'prune.mjs')).href)
const hook = await import(pathToFileURL(path.join(here, '..', 'hooks', 'atlas-prune.mjs')).href)
const { prune, collect, decide, clip, chars } = lib

// A transcript in the engine's own shape: an assistant message carries the call with its
// outcome, the user message after it carries the result.
let seq = 0
const user = (text) => ({ role: 'user', text, toolUses: [], handle: `h${seq++}` })
const say = (text) => ({ role: 'assistant', text, toolUses: [], handle: `h${seq++}` })
function call(tool, input, text, isError = false) {
  const id = `t${seq++}`
  const use = { tool_use_id: id, tool, input, text }
  if (isError) use.isError = true
  return [
    { role: 'assistant', text: '', toolUses: [use], handle: `h${seq++}` },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: id, text, isError }], handle: `h${seq++}` },
  ]
}
const long = (n, c = 'x') => c.repeat(n)
const tailPad = () => [say('one'), user('two'), say('three'), user('four'), say('five'), user('six')]
const resultOf = (messages, id) => messages.flatMap((m) => m.toolResults || []).find((r) => r.tool_use_id === id)
const idOf = (pair) => pair[0].toolUses[0].tool_use_id

test('a file read again whole: the first reading goes, the call stays', () => {
  const a = call('Read', { file_path: 'C:\\p\\a.js' }, long(5000))
  const b = call('Read', { file_path: 'C:/p/a.js' }, long(5000, 'y'))
  const m = [user('start'), ...a, say('thinking aloud'), ...b, ...tailPad()]
  const r = prune(m, { min: 0 })
  assert.match(resultOf(r.messages, idOf(a)).text, /^\[atlas prune: 5000 characters/)
  assert.equal(resultOf(r.messages, idOf(b)).text, long(5000, 'y'))
  assert.equal(r.messages.find((x) => x.toolUses.some((t) => t.tool_use_id === idOf(a))).toolUses[0].input.file_path, 'C:\\p\\a.js')
  assert.equal(r.stats.by.superseded, 1)
})

test('a later partial read does not make a whole reading stale', () => {
  const a = call('Read', { file_path: '/p/a.js' }, long(5000))
  const b = call('Read', { file_path: '/p/a.js', offset: 10, limit: 20 }, long(900, 'y'))
  const r = prune([user('start'), ...a, ...b, ...tailPad()], { min: 0 })
  assert.equal(resultOf(r.messages, idOf(a)).text, long(5000))
})

test('a file changed after it was read: the reading is stale', () => {
  const a = call('Read', { file_path: '/p/a.js' }, long(4000))
  const e = call('Edit', { file_path: '/p/a.js', old_string: 'a', new_string: 'b' }, 'ok')
  const r = prune([user('start'), ...a, ...e, ...tailPad()], { min: 0 })
  assert.match(resultOf(r.messages, idOf(a)).text, /changed after this/)
  assert.equal(resultOf(r.messages, idOf(e)).text, 'ok')
})

test('a failed call that later succeeded disappears with its result', () => {
  const bad = call('Bash', { command: 'npm test' }, long(3000, 'E'), true)
  const good = call('Bash', { command: 'npm test' }, 'ok 12 tests')
  const badEdit = call('Edit', { file_path: '/p/a.js', old_string: 'zz', new_string: 'b' }, 'old_string not found', true)
  const goodEdit = call('Edit', { file_path: '/p/a.js', old_string: 'a', new_string: 'b' }, 'ok')
  const m = [user('start'), ...bad, ...badEdit, ...good, ...goodEdit, ...tailPad()]
  const r = prune(m, { min: 0 })
  assert.equal(resultOf(r.messages, idOf(bad)), undefined)
  assert.equal(resultOf(r.messages, idOf(badEdit)), undefined)
  assert.ok(!r.messages.some((x) => x.toolUses.some((t) => t.tool_use_id === idOf(bad))))
  assert.equal(r.stats.by.retry, 2)
  assert.equal(r.stats.messagesAfter, m.length - 4)
})

test('a failure never retried stays whole', () => {
  const bad = call('Bash', { command: 'npm run build' }, long(3000, 'E'), true)
  const r = prune([user('start'), ...bad, ...tailPad()], { min: 0 })
  assert.equal(resultOf(r.messages, idOf(bad)).text, long(3000, 'E'))
})

test('a search whose hits were opened keeps its head; one nobody followed stays whole', () => {
  const served = call('Grep', { pattern: 'foo' }, 'src\\lib\\a.js:3: foo\n' + long(2000))
  const lone = call('Grep', { pattern: 'bar' }, 'src/other/z.js:1: bar\n' + long(2000))
  const read = call('Read', { file_path: 'C:/repo/src/lib/a.js', offset: 1, limit: 5 }, 'five lines')
  const r = prune([user('start'), ...served, ...lone, ...read, ...tailPad()], { min: 0, head: 100 })
  const t = resultOf(r.messages, idOf(served)).text
  assert.ok(t.startsWith('src\\lib\\a.js:3: foo'))
  assert.match(t, /opened afterwards/)
  assert.ok(t.length < 400)
  assert.equal(resultOf(r.messages, idOf(lone)).text.length, 'src/other/z.js:1: bar\n'.length + 2000)
})

test('the same call made again: the earlier result goes', () => {
  const a = call('Bash', { command: 'git status' }, long(1500))
  const b = call('Bash', { command: 'git status' }, 'clean')
  const r = prune([user('start'), ...a, ...b, ...tailPad()], { min: 0 })
  assert.match(resultOf(r.messages, idOf(a)).text, /made again later/)
  assert.equal(r.stats.by.repeat, 1)
})

test('never touched: the words, the first message, the newest messages, what cannot be had again', () => {
  const first = call('Read', { file_path: '/p/a.js' }, long(5000))
  const agent = call('Agent', { prompt: 'look into it' }, long(9000))
  const answer = call('AskUserQuestion', { questions: [] }, long(2000))
  const skill = call('Skill', { skill: 'x' }, long(7000))
  const again = call('Read', { file_path: '/p/a.js' }, long(5000, 'y'))
  const recentA = call('Read', { file_path: '/p/b.js' }, long(5000))
  const recentB = call('Read', { file_path: '/p/b.js' }, long(5000, 'y'))
  // the first message of the transcript is the first call's assistant row
  const m = [...first, user('a long user message ' + long(3000)), ...agent, ...answer, ...skill, ...again, say(long(4000)), ...recentA, ...recentB]
  const r = prune(m, { min: 0.9, recent: 4 })
  assert.equal(resultOf(r.messages, idOf(agent)).text.length, 9000)
  assert.equal(resultOf(r.messages, idOf(answer)).text.length, 2000)
  assert.equal(resultOf(r.messages, idOf(skill)).text.length, 7000)
  assert.equal(resultOf(r.messages, idOf(recentA)).text.length, 5000)
  assert.equal(r.messages[0], m[0])
  for (const x of m.filter((y) => y.text)) assert.ok(r.messages.some((y) => y.text === x.text))
})

test('an untouched message is the same object, a touched one loses its handle', () => {
  const a = call('Read', { file_path: '/p/a.js' }, long(5000))
  const b = call('Read', { file_path: '/p/a.js' }, long(5000, 'y'))
  const m = [user('start'), ...a, ...b, ...tailPad()]
  const r = prune(m, { min: 0 })
  assert.equal(r.messages[0], m[0])
  assert.equal(r.messages[3], m[3])
  assert.equal(r.messages[1].handle, undefined)
  assert.equal(r.messages[2].handle, undefined)
})

test('the long rule runs only when the others did not free enough, reads before the shell', () => {
  const read = call('Read', { file_path: '/p/big.js' }, long(20000))
  const shell = call('Bash', { command: 'cat log' }, 'HEAD' + long(20000) + 'TAIL')
  const web = call('WebFetch', { url: 'https://x.dev' }, long(900))
  const m = [user('start'), ...read, ...shell, ...web, ...tailPad()]
  const none = prune(m, { min: 0 })
  assert.deepEqual(none.stats.by, {})
  const some = prune(m, { min: 0.3 })
  assert.match(resultOf(some.messages, idOf(read)).text, /can be run again/)
  assert.equal(resultOf(some.messages, idOf(shell)).text.length, 20008)
  const more = prune(m, { min: 0.8, head: 300 })
  const s = resultOf(more.messages, idOf(shell)).text
  assert.ok(s.startsWith('HEAD') && s.endsWith('TAIL'))
  assert.ok(more.ratio >= 0.8)
})

test('a short result is never worth a note', () => {
  assert.equal(clip('short', 0, 'repeat'), 'short')
  assert.equal(clip(long(400), 300, 'long'), long(400))
})

test('a call still in flight is pinned', () => {
  const flying = { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'f1', tool: 'Bash', input: { command: 'sleep' } }] }
  const calls = collect([user('start'), flying, ...tailPad()], 2)
  assert.equal(calls[0].pinned, true)
  assert.equal(decide(calls).size, 0)
})

test('characters count each result once', () => {
  const a = call('Read', { file_path: '/a' }, long(1000))
  assert.equal(chars(a), 1000 + JSON.stringify({ file_path: '/a' }).length)
})

// --- the hook -----------------------------------------------------------------------------

function engine(file, env = {}) {
  const logs = []
  const $ = {
    env: { get: async (n) => (n === 'CLAUDE_CONFIG_DIR' ? '/cfg' : env[n]) },
    fs: { read: async (p) => { if (p !== '/cfg/atlas.json' || file === undefined) throw new Error('missing'); return file } },
    ui: { log: (t) => logs.push(t) },
  }
  const hookFn = hook.compact
  const run = (e) => hookFn($, e, async () => ({ messages: [{ role: 'user', text: 'SUMMARY', toolUses: [] }] }))
  return { run, logs }
}
const big = () => {
  const a = call('Read', { file_path: '/p/a.js' }, long(50000))
  const b = call('Read', { file_path: '/p/a.js' }, long(2000, 'y'))
  return [user('start'), ...a, ...b, ...tailPad()]
}

test('hook: off by default, and off when the file is missing or broken', async () => {
  for (const file of [undefined, '{}', '{"prune": false}', 'not json', '{"prune": "yes"}']) {
    const { run, logs } = engine(file)
    const out = await run({ trigger: 'auto', messages: big() })
    assert.equal(out.messages[0].text, 'SUMMARY')
    assert.equal(logs.length, 0)
  }
})

test('hook: on, it answers with the pruned transcript and says what it did', async () => {
  const { run, logs } = engine('{"prune": true}')
  const m = big()
  const out = await run({ trigger: 'auto', messages: m })
  assert.equal(out.messages.length, m.length)
  assert.equal(out.messages[0], m[0])
  assert.match(logs[0], /^atlas prune: no summary, 9\d% freed/)
})

test('hook: too little to free, a subagent, or typed instructions: the summary runs', async () => {
  const { run, logs } = engine('{"prune": true}')
  const small = [user('start'), say(long(9000)), ...tailPad()]
  assert.equal((await run({ trigger: 'auto', messages: small })).messages[0].text, 'SUMMARY')
  assert.match(logs[0], /summary instead, under the 25% minimum/)
  assert.equal((await run({ trigger: 'auto', agentId: 'a1', messages: big() })).messages[0].text, 'SUMMARY')
  assert.equal((await run({ trigger: 'manual', instructions: 'keep the plan', messages: big() })).messages[0].text, 'SUMMARY')
  assert.equal(logs.length, 1)
})

test('hook: the numbers in the file are honoured, a bad one falls back to the default', async () => {
  // a minimum above 95% is held at 95%: here 86% can be freed, so the summary runs
  const strict = engine('{"prune": true, "pruneMin": 0.99}')
  const most = [user('start'), say(long(8000)), ...call('Read', { file_path: '/p/a.js' }, long(50000)), ...call('Read', { file_path: '/p/a.js' }, 'short now'), ...tailPad()]
  assert.equal((await strict.run({ trigger: 'auto', messages: most })).messages[0].text, 'SUMMARY')
  assert.match(strict.logs[0], /95% minimum/)
  const odd = engine('{"prune": true, "pruneMin": "lots", "pruneRecent": -3}')
  assert.notEqual((await odd.run({ trigger: 'auto', messages: big() })).messages[0].text, 'SUMMARY')
})

test('hook: ATLAS_PRUNE switches one run without the file, either way', async () => {
  const on = engine(undefined, { ATLAS_PRUNE: '1' })
  assert.notEqual((await on.run({ trigger: 'auto', messages: big() })).messages[0].text, 'SUMMARY')
  const off = engine('{"prune": true}', { ATLAS_PRUNE: '0' })
  assert.equal((await off.run({ trigger: 'auto', messages: big() })).messages[0].text, 'SUMMARY')
})
