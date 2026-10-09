// The five subagents of the code section: each has a name, a short description, a tool list,
// and points at a skill folder that exists; each skill that delegates names a subagent that
// exists. node --test tests/agents.test.mjs (from code/, or from a built atlas-code)
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const agentsDir = path.join(root, 'agents')
const skillsDir = path.join(root, 'skills')
// in the source tree the base skills (fix, review) live one level up; in a build they are beside
const baseSkills = fs.existsSync(path.join(skillsDir, 'atlas-fix')) ? skillsDir : path.join(root, '..', 'skills')

const PAIRS = { 'atlas-auditor': ['atlas-secure', 'secure'], 'atlas-fixer': ['atlas-fix', 'fix'], 'atlas-profiler': ['atlas-perf', 'perf'], 'atlas-documenter': ['atlas-docs', 'docs'], 'atlas-tester': ['atlas-test', 'test'] }

const frontmatter = (file) => {
  const t = fs.readFileSync(file, 'utf8')
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(t)
  assert.ok(m, `${file}: no frontmatter`)
  return { fm: m[1], body: t.slice(m[0].length) }
}

test('every subagent has a name, a description under 90 words, tools, and names its skill folder', () => {
  for (const [agent, [skill, folder]] of Object.entries(PAIRS)) {
    const file = path.join(agentsDir, `${agent}.md`)
    assert.ok(fs.existsSync(file), `${agent}.md missing`)
    const { fm, body } = frontmatter(file)
    assert.match(fm, new RegExp(`^name: ${agent}$`, 'm'))
    const desc = /description: >\n([\s\S]*?)\ntools:/.exec(fm)
    assert.ok(desc, `${agent}: description then tools`)
    const words = desc[1].split(/\s+/).filter(Boolean).length
    assert.ok(words <= 90, `${agent}: description is ${words} words; descriptions load in every session`)
    assert.match(fm, /^tools: \[/m)
    assert.ok(body.includes(`skills/${skill}/${folder}/`), `${agent}: must say where its rule files live`)
    const dir = fs.existsSync(path.join(skillsDir, skill, folder)) ? path.join(skillsDir, skill, folder) : path.join(baseSkills, skill, folder)
    const rule = skill === 'atlas-docs' ? 'map.md' : 'method.md'
    assert.ok(fs.existsSync(path.join(dir, rule)), `${skill}/${folder}/${rule} missing`)
  }
})

test('every delegating skill names a subagent that exists', () => {
  const skills = [['atlas-secure', skillsDir], ['atlas-perf', skillsDir], ['atlas-docs', skillsDir], ['atlas-test', skillsDir], ['atlas-fix', baseSkills], ['atlas-review', baseSkills]]
  for (const [skill, dir] of skills) {
    const text = fs.readFileSync(path.join(dir, skill, 'SKILL.md'), 'utf8')
    const named = [...text.matchAll(/`(atlas-[a-z]+)` subagent/g)].map((m) => m[1])
    assert.ok(named.length, `${skill}: delegates to nobody`)
    for (const n of named) {
      const exists = fs.existsSync(path.join(agentsDir, `${n}.md`)) || fs.existsSync(path.join(root, '..', 'agents', `${n}.md`))
      assert.ok(exists, `${skill} names ${n}, which does not exist`)
    }
  }
})
