// Run with: node --test tests/frontmatter.test.mjs
// Every SKILL.md the plugin ships must have a description that YAML reads as non-empty.
// A folded scalar (`description: >`) ends at the first line that is NOT indented: a first
// line written flush left makes the whole description empty, and Claude Code then never
// routes to the skill. That can go unnoticed for a long time.
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function skills(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (['node_modules', '.git', 'dist', 'retired', 'ritirati'].includes(e.name)) continue; skills(p, out) }
    else if (e.name === 'SKILL.md') out.push(p)
  }
  return out
}

/** The description as YAML would read it, or null when the frontmatter has none. */
export function description(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return null
  const lines = m[1].split(/\r?\n/)
  const i = lines.findIndex((l) => /^description:/.test(l))
  if (i < 0) return null
  const head = lines[i].replace(/^description:\s*/, '')
  if (!/^[>|]-?\s*$/.test(head)) return head.trim()
  const body = []
  for (let j = i + 1; j < lines.length; j++) {
    if (lines[j].trim() === '') { body.push(''); continue }
    if (/^\s/.test(lines[j])) body.push(lines[j].trim())
    else break
  }
  return body.join(' ').trim()
}

test('the parser sees an indented folded description and loses a flush-left one', () => {
  assert.equal(description('---\nname: x\ndescription: >\n  Does a thing.\n  Use for "x".\n---\n'), 'Does a thing. Use for "x".')
  assert.equal(description('---\nname: x\ndescription: >\nDoes a thing.\n  Use for "x".\n---\n'), '')
  assert.equal(description('---\nname: x\ndescription: Inline one.\n---\n'), 'Inline one.')
})

test('every shipped SKILL.md has a non-empty description', () => {
  const files = skills(root)
  // every skill folder is read, in the source tree (skills/ and the overlays) and in a build alike
  const folders = ['skills', 'dev/skills', 'code/skills', 'mem/skills', 'video/skills']
    .map((d) => path.join(root, d)).filter((d) => fs.existsSync(d))
    .reduce((n, d) => n + fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).length, 0)
  assert.ok(folders > 0 && files.length >= folders, `found ${files.length} SKILL.md for ${folders} skill folders`)
  const empty = files.filter((f) => !description(fs.readFileSync(f, 'utf8'))).map((f) => path.relative(root, f))
  assert.deepEqual(empty, [], `empty descriptions: ${empty.join(', ')}`)
})
