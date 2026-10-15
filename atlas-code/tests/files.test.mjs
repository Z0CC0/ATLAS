// Every coding skill is a short SKILL.md that routes to files in its own folder. A file the
// SKILL.md names must exist, and a file in the folder must be named by the SKILL.md (or by
// another file of the same skill), or nobody will ever read it. Found by hand on 2026-10-15
// while adding three stacks; now checked. node --test tests/files.test.mjs (from code/)
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const skillsDir = path.join(here, '..', 'skills')
// the base and memory skills follow the same rule; in a built plugin they sit beside these
const ROOTS = [skillsDir, path.join(here, '..', '..', 'skills'), path.join(here, '..', '..', 'mem', 'skills'), path.join(here, '..', '..', 'write', 'skills')].filter((r) => fs.existsSync(r))

for (const [root, skill] of ROOTS.flatMap((r) => fs.readdirSync(r).map((s) => [r, s]))) {
  const dir = path.join(root, skill)
  const skillFile = path.join(dir, 'SKILL.md')
  if (!fs.existsSync(skillFile)) continue
  const sub = fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory())
  if (!sub.length) continue
  test(`${skill}: the files it names exist and the files it ships are named`, () => {
    const texts = new Map([['SKILL.md', fs.readFileSync(skillFile, 'utf8')]])
    const files = new Set()
    for (const s of sub) for (const f of fs.readdirSync(path.join(dir, s))) if (f.endsWith('.md')) { files.add(f); texts.set(`${s}/${f}`, fs.readFileSync(path.join(dir, s, f), 'utf8')) }
    const named = new Set()
    for (const t of texts.values()) for (const m of t.matchAll(/`(?:([\w-]+)\/)?([\w-]+\.md)`/g)) {
      // `docs/onboarding.md` with a folder this skill does not have is a path in the
      // user's project, not a rule file; `0007-....md` is an example of a file to write
      if (m[1] && !sub.includes(m[1])) continue
      if (/^\d/.test(m[2])) continue
      named.add(m[2])
    }
    // a file another skill ships may be named here (atlas-secure points at review's security.md)
    const everywhere = new Set()
    for (const root of [skillsDir, path.join(here, '..', '..', 'skills'), path.join(here, '..', '..', 'mem', 'skills')]) {
      if (!fs.existsSync(root)) continue
      for (const s of fs.readdirSync(root)) for (const d of fs.readdirSync(path.join(root, s))) { const p = path.join(root, s, d); if (fs.statSync(p).isDirectory()) for (const f of fs.readdirSync(p)) everywhere.add(f) }
    }
    // paths in the user's project that happen to share the folder name: atlas-docs writes `docs/onboarding.md`
    const OUTPUT = { 'atlas-docs': ['onboarding.md'], 'atlas-brief': ['engine.md', 'migrations.md', 'workflows.md'] } // examples of files to write
    for (const n of named) if (!/^[A-Z][A-Z_.-]+\.md$/.test(n) && !(OUTPUT[skill] || []).includes(n)) assert.ok(files.has(n) || everywhere.has(n), `${skill} names ${n}, which no skill ships`)
    for (const f of files) assert.ok(named.has(f) || f === 'method.md', `${skill}/${f} exists but nothing names it`)
  })
}
