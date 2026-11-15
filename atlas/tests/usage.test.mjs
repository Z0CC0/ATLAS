// The usage count: what is counted, what never is, and that nothing is written before the
// first session made the state folder. node --test tests/usage.test.mjs
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
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-usage-'))
process.env.CLAUDE_CONFIG_DIR = SANDBOX
const usage = require(path.join(ROOT, 'hooks', 'atlas-usage.js'))
const cfg = require(path.join(ROOT, 'hooks', 'atlas-config.js'))
const tracker = require(path.join(ROOT, 'hooks', 'atlas-tracker.js'))

const skill = (name, session = 's1') => ({ tool_name: 'Skill', tool_input: { skill: name }, session_id: session })
const agent = (type, session = 's1') => ({ tool_name: 'Agent', tool_input: { subagent_type: type, prompt: 'secret words' }, session_id: session })
const stored = () => JSON.parse(fs.readFileSync(usage.file(), 'utf8'))

test('nothing is written before the first session made the state folder', () => {
  assert.equal(usage.record(skill('atlas-recap')), false)
  assert.equal(usage.session({ source: 'startup' }), false)
  assert.equal(fs.existsSync(cfg.stateDir()), false)
})

test('a skill and a subagent are counted by name, with or without the build prefix', () => {
  cfg.markInstalled()
  assert.equal(usage.record(skill('atlas-recap'), 1000), true)
  assert.equal(usage.record(skill('atlas-code:atlas-recap'), 1000 + 200000), true)
  assert.equal(usage.record(agent('atlas-research'), 1), true)
  assert.equal(usage.record({ tool_name: 'Task', tool_input: { subagent_type: 'atlas-mem:atlas-research' }, session_id: 's2' }, 2), true)
  const u = stored()
  assert.equal(u.skills['atlas-recap'].n, 2)
  assert.equal(u.agents['atlas-research'].n, 2)
  assert.match(u.skills['atlas-recap'].last, /^\d{4}-\d\d-\d\d$/)
})

test('what is not ATLAS is never counted, and nothing but names is kept', () => {
  for (const n of ['deep-research', 'anthropic-skills:pdf', 'atlas', 'ATLAS-search; rm', '', undefined]) assert.equal(usage.record(skill(n)), false)
  assert.equal(usage.record(agent('general-purpose')), false)
  assert.equal(usage.record({ tool_name: 'Bash', tool_input: { command: 'atlas-recap' } }), false)
  const text = fs.readFileSync(usage.file(), 'utf8')
  assert.ok(!/secret words|deep-research|pdf|general-purpose/.test(text))
})

test('a skill typed as a command is counted once, even when the host loads it again', () => {
  const before = stored().skills['atlas-search']?.n || 0
  assert.equal(usage.typed('/atlas-search what is new in vite', 's9', 5000), true)
  assert.equal(usage.record(skill('atlas:atlas-search', 's9'), 6000), false)
  assert.equal(usage.typed('/atlas-code:atlas-search again', 's9', 5000 + 300000), true)
  assert.equal(stored().skills['atlas-search'].n, before + 2)
  for (const p of ['/atlas high', '/atlas:atlas status', 'atlas-search please', 'use /atlas-search', '/atlas-search:x']) assert.equal(usage.typed(p, 's9', 9e9), false)
})

test('a session is one more only on a fresh start', () => {
  const n = stored().sessions
  assert.equal(usage.session({ source: 'startup' }), true)
  assert.equal(usage.session({}), true)
  assert.equal(usage.session({ source: 'resume' }), false)
  assert.equal(usage.session({ source: 'compact' }), false)
  assert.equal(stored().sessions, n + 2)
})

test('the report names what was called and what never was', () => {
  const text = usage.report(ROOT)
  assert.match(text, /^ATLAS usage since \d{4}-\d\d-\d\d, 2 sessions/)
  assert.match(text, /atlas-recap\s+2\s+last/)
  assert.match(text, /subagents\n\s+atlas-research\s+2/)
  const never = text.split('never called\n')[1]
  assert.match(never, /atlas-organize/)
  assert.match(never, /atlas-browser \(subagent\)/)
  assert.ok(!/atlas-recap|atlas-research/.test(never))
  assert.ok(!/(^|[ ,])atlas(,|$)/m.test(never), 'the rules file is not a skill anyone calls')
})

test('a file that cannot be read back is left alone', () => {
  const good = fs.readFileSync(usage.file(), 'utf8')
  fs.writeFileSync(usage.file(), '{ broken')
  assert.equal(usage.record(skill('atlas-recap'), 9e12), false)
  assert.equal(usage.session({ source: 'startup' }), false)
  assert.equal(fs.readFileSync(usage.file(), 'utf8'), '{ broken')
  assert.match(usage.report(ROOT), /could not be read/)
  fs.writeFileSync(usage.file(), good)
})

test('atlas usage is recognised, and only as the whole message', () => {
  const is = (p) => tracker.USAGE_PATTERNS.some((re) => re.test(p))
  assert.ok(is('atlas usage') && is('/atlas:atlas usage') && is('/atlas-max:atlas usage?'))
  assert.ok(!is('atlas usage of tokens') && !is('what is atlas usage') && !is('/atlas-help usage'))
})

test('the hook itself: silent, exit 0, and it counts', () => {
  const run = (input) => execFileSync(process.execPath, [path.join(ROOT, 'hooks', 'atlas-usage.js')], { input, env: { ...process.env, CLAUDE_CONFIG_DIR: SANDBOX }, encoding: 'utf8' })
  const n = stored().skills['atlas-help']?.n || 0
  assert.equal(run(JSON.stringify(skill('atlas-help', 'hook'))), '')
  assert.equal(run('not json'), '')
  assert.equal(stored().skills['atlas-help'].n, n + 1)
})

test('the prompt hook prints the table for atlas usage and counts a typed skill', () => {
  const run = (prompt) => execFileSync(process.execPath, [path.join(ROOT, 'hooks', 'atlas-tracker.js')], { input: JSON.stringify({ prompt, cwd: SANDBOX, session_id: 'p1' }), env: { ...process.env, CLAUDE_CONFIG_DIR: SANDBOX }, encoding: 'utf8' })
  const out = JSON.parse(run('atlas usage')).hookSpecificOutput.additionalContext
  assert.match(out, /ATLAS usage since/)
  assert.match(out, /never called/)
  const n = stored().skills['atlas-organize']?.n || 0
  run('/atlas-organize the downloads folder')
  assert.equal(stored().skills['atlas-organize'].n, n + 1)
})
