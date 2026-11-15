// The install check: two builds in one session are seen and said once, and `atlas doctor`
// reads the machine without changing it. node --test tests/doctor.test.mjs
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
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-doctor-'))
process.env.CLAUDE_CONFIG_DIR = SANDBOX
const doctor = require(path.join(ROOT, 'hooks', 'atlas-doctor.js'))
const cfg = require(path.join(ROOT, 'hooks', 'atlas-config.js'))
const tracker = require(path.join(ROOT, 'hooks', 'atlas-tracker.js'))

const id = () => `test-${process.pid}-${Math.random().toString(36).slice(2)}`
// A second build on disk: a folder with a manifest of its own.
function other(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-other-'))
  fs.mkdirSync(path.join(dir, '.claude-plugin'))
  fs.writeFileSync(path.join(dir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name, version: '9.9.9' }))
  return dir
}
const PROJECT = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-doctor-proj-'))

test('one build in a session: marked, nothing to say', () => {
  const s = id()
  const list = doctor.mark(s)
  assert.equal(list.length, 1)
  assert.equal(doctor.mark(s).length, 1, 'marking twice is one build')
  assert.equal(doctor.twice(doctor.loaded(s)), '')
  fs.unlinkSync(doctor.marker(s))
})

test('two builds in a session: the last to arrive says so, the first stays quiet', () => {
  const s = id(), b = other('atlas-code')
  doctor.mark(s)
  const list = doctor.mark(s, b)
  assert.equal(list.length, 2)
  assert.equal(doctor.twice(list), '', 'this build came first')
  const said = doctor.twice(list, b)
  assert.match(said, /2 ATLAS builds are loaded/)
  assert.match(said, /atlas-code 9\.9\.9/)
  assert.match(said, /keep one build/)
  fs.unlinkSync(doctor.marker(s))
})

test('no session id, no marker', () => {
  assert.deepEqual(doctor.mark(undefined), [])
  assert.deepEqual(doctor.loaded(''), [])
})

test('markers of sessions long over are swept, the others stay', () => {
  const old = doctor.marker(id()), fresh = doctor.marker(id())
  fs.writeFileSync(old, 'x\n'); fs.writeFileSync(fresh, 'x\n')
  const past = new Date(Date.now() - 3 * 24 * 3600 * 1000)
  fs.utimesSync(old, past, past)
  doctor.sweep()
  assert.equal(fs.existsSync(old), false)
  assert.equal(fs.existsSync(fresh), true)
  fs.unlinkSync(fresh)
})

test('a clean install: every line ok, nothing to fix', () => {
  const s = id()
  doctor.mark(s)
  const text = doctor.report({ session_id: s, cwd: PROJECT }, ROOT, {})
  assert.match(text, /^ok {4}one build loaded: atlas[\w-]* \d/)
  assert.match(text, /runs from .*hook files last changed \d{4}-\d\d-\d\d, node \d+/)
  assert.match(text, /no ~\/\.claude\/atlas\.json/)
  assert.match(text, /no project has a dial on/)
  assert.match(text, /nothing to fix$/)
  assert.ok(!/WARN/.test(text))
  fs.unlinkSync(doctor.marker(s))
})

test('what it warns about', () => {
  const s = id(), b = other('atlas-max')
  doctor.mark(s); doctor.mark(s, b)
  fs.writeFileSync(path.join(SANDBOX, 'atlas.json'), '{"prune": true}')
  fs.writeFileSync(path.join(PROJECT, '.atlas.json'), '{ not json')
  fs.writeFileSync(path.join(SANDBOX, 'settings.json'), JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'node /old/atlas-activate.js' }] }] } }))
  cfg.markInstalled()
  fs.writeFileSync(path.join(cfg.stateDir(), 'C--work-shop.state'), 'high:ask:off:off')
  fs.writeFileSync(path.join(cfg.stateDir(), 'C--work-idle.state'), 'off:off:off:off')
  fs.writeFileSync(path.join(cfg.stateDir(), 'usage.json'), '{ broken')
  const text = doctor.report({ session_id: s, cwd: PROJECT }, ROOT, {})
  assert.match(text, /WARN {2}2 builds loaded together.*atlas-max 9\.9\.9/)
  assert.match(text, /WARN {2}prune is on but CLAUDE_CODE_ENABLE_FUNCTION_HOOKS is not 1/)
  assert.match(text, /WARN {2}.*\.atlas\.json cannot be parsed/)
  assert.match(text, /WARN {2}ATLAS hooks are also registered by hand in .*settings\.json/)
  assert.match(text, /WARN {2}.*usage\.json cannot be read/)
  assert.match(text, /dials are on in 1 project.*C--work-shop/)
  assert.ok(!/C--work-idle/.test(text))
  assert.match(text, /5 things to fix$/)
  const on = doctor.report({ session_id: s, cwd: PROJECT }, ROOT, { CLAUDE_CODE_ENABLE_FUNCTION_HOOKS: '1' })
  assert.match(on, /ok {4}prune is on and function hooks are enabled/)
  fs.writeFileSync(path.join(SANDBOX, 'atlas.json'), '{ broken')
  assert.match(doctor.report({ session_id: s, cwd: PROJECT }, ROOT, {}), /WARN {2}.*atlas\.json cannot be parsed: a switch typed now is refused/)
  fs.unlinkSync(doctor.marker(s))
})

test('the report changes nothing on disk', () => {
  const snap = () => fs.readdirSync(SANDBOX, { recursive: true }).map((n) => { const f = path.join(SANDBOX, n); return fs.statSync(f).isFile() ? n + ':' + fs.readFileSync(f, 'utf8') : n }).sort().join('|')
  const before = snap()
  doctor.report({ session_id: id(), cwd: PROJECT }, ROOT, {})
  assert.equal(snap(), before)
})

test('atlas doctor is recognised, and only as the whole message', () => {
  const is = (p) => tracker.DOCTOR_PATTERNS.some((re) => re.test(p))
  assert.ok(is('atlas doctor') && is('/atlas:atlas doctor') && is('/atlas-max:atlas doctor'))
  assert.ok(!is('atlas doctor please look') && !is('is atlas doctor safe') && !is('/atlas-help doctor'))
})

test('session start: part 1 marks, the last part of the later build warns when its dials are on', () => {
  const s = id(), b = other('atlas-solo')
  const env = { ...process.env, CLAUDE_CONFIG_DIR: SANDBOX }
  const run = (part) => execFileSync(process.execPath, [path.join(ROOT, 'hooks', 'atlas-activate.js'), '--part', String(part)], { input: JSON.stringify({ session_id: s, cwd: PROJECT, source: 'startup' }), env, encoding: 'utf8' })
  cfg.setProject(PROJECT)
  cfg.writeState({ level: 'low', rigour: 'off', check: 'off', silent: 'off' })
  // another build arrives first, then this one: this one is the last and speaks
  doctor.mark(s, b)
  run(1)
  assert.equal(doctor.loaded(s).length, 2)
  assert.ok(!/builds are loaded/.test(run(1) + run(2)))
  assert.match(run(3), /2 ATLAS builds are loaded in this session: atlas-solo 9\.9\.9 and atlas[\w-]* \d/)
  // dials off: nothing is injected twice, so nothing is said
  cfg.writeState({ level: 'off', rigour: 'off', check: 'off', silent: 'off' })
  assert.equal(run(3), '')
  fs.unlinkSync(doctor.marker(s))
  // alone, with dials on: the last part says nothing about builds
  const alone = id()
  cfg.writeState({ level: 'low', rigour: 'off', check: 'off', silent: 'off' })
  execFileSync(process.execPath, [path.join(ROOT, 'hooks', 'atlas-activate.js'), '--part', '1'], { input: JSON.stringify({ session_id: alone, cwd: PROJECT }), env, encoding: 'utf8' })
  assert.ok(!/builds are loaded/.test(execFileSync(process.execPath, [path.join(ROOT, 'hooks', 'atlas-activate.js'), '--part', '3'], { input: JSON.stringify({ session_id: alone, cwd: PROJECT }), env, encoding: 'utf8' })))
  fs.unlinkSync(doctor.marker(alone))
})

test('the prompt hook prints the check', () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'hooks', 'atlas-tracker.js')], { input: JSON.stringify({ prompt: 'atlas doctor', cwd: PROJECT, session_id: id() }), env: { ...process.env, CLAUDE_CONFIG_DIR: SANDBOX }, encoding: 'utf8' })
  const text = JSON.parse(out).hookSpecificOutput.additionalContext
  assert.match(text, /Print exactly the lines below/)
  assert.match(text, /(nothing|things?) to fix$/)
})
