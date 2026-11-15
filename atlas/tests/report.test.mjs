// The notes of a report, checked before the writer reads them.
// node --test tests/report.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const tool = path.join(here, '..', 'tools', 'report.mjs')
const { checkNote, checkFolder, render } = await import(pathToFileURL(tool).href)

const GOOD = `# Pricing of X

## How is X priced per seat?
### Takeaway
Two tiers, the second one metered.
### Cited findings
- Team is 12 dollars a seat a month — https://x.dev/pricing, 2026-10-02
- The free tier ends at five seats — https://x.dev/docs/limits, undated
### Inferences
- A ten-person team pays 120 dollars a month — inference from the two findings
### Gaps
- No price for self-hosting on the pricing page or in the docs

## Does it bill unused seats?
### Takeaway
Nothing found either way.
### Cited findings
### Inferences
### Gaps
- Searched the pricing page, the terms and two comparison articles: not stated
`
const texts = (note) => checkNote(note).map((p) => p.text)

test('a note in the shape of report.md has nothing to fix', () => {
  assert.deepEqual(checkNote(GOOD), [])
  assert.deepEqual(checkNote(GOOD.replace(/\n/g, '\r\n')), [])
})

test('a finding with no URL, and one with no date', () => {
  const p = checkNote(GOOD.replace(' — https://x.dev/pricing, 2026-10-02', ', says the pricing page').replace(', undated', ''))
  assert.deepEqual(p.map((x) => x.line), [7, 8])
  assert.match(p[0].text, /no URL: it is an inference/)
  assert.match(p[1].text, /no date/)
})

test('a year inside the address is not the date of the page', () => {
  const note = GOOD.replace('https://x.dev/docs/limits, undated', 'https://x.dev/2026/limits')
  assert.deepEqual(texts(note), ['a finding with no date: the date of the page, or "undated"'])
})

test('a section missing, a takeaway empty, no question at all, no title', () => {
  // without its heading the inference sits among the findings, and is caught there too
  assert.deepEqual(texts(GOOD.replace('### Inferences\n- A ten', '- A ten')), ['"How is X priced per seat?" has no "### Inferences"', 'a finding with no URL: it is an inference, or its source is missing'])
  assert.match(texts(GOOD.replace('Two tiers, the second one metered.\n', ''))[0], /the takeaway is empty/)
  assert.deepEqual(texts('# Title\n\nSome prose and nothing else.'), ['no key question: each one is a "## <question>" with its four sections'])
  assert.match(texts(GOOD.replace('# Pricing of X\n', 'Pricing of X\n'))[0], /no title/)
})

test('nothing found is an answer only when the gaps say what was looked for', () => {
  const silent = GOOD.replace('- Searched the pricing page, the terms and two comparison articles: not stated\n', '')
  assert.match(texts(silent)[0], /no finding and no gap named/)
})

test('a fact hidden among the inferences is said', () => {
  const note = GOOD.replace('- A ten-person team pays 120 dollars a month — inference from the two findings', '- Enterprise starts at 40 seats — https://x.dev/enterprise')
  assert.match(texts(note)[0], /an inference that carries a URL/)
})

test('a bullet that wraps keeps its URL', () => {
  const note = GOOD.replace('- Team is 12 dollars a seat a month — https://x.dev/pricing, 2026-10-02', '- Team is 12 dollars a seat a month, billed yearly\n  — https://x.dev/pricing, 2026-10-02')
  assert.deepEqual(checkNote(note), [])
})

test('a folder: each note by name, and the count to send back', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-report-'))
  fs.writeFileSync(path.join(dir, 'a-pricing.md'), GOOD)
  fs.writeFileSync(path.join(dir, 'b-users.md'), '# Users\n\n## Who uses it?\n### Takeaway\nMany.\n### Cited findings\n- Lots of teams\n### Inferences\n### Gaps\n')
  fs.writeFileSync(path.join(dir, 'ignore.txt'), 'x')
  const text = render(checkFolder(dir))
  assert.equal(text, 'report check: 2 notes, 1 to send back\na-pricing.md  in shape, 2 cited findings\nb-users.md  1 problem\n  line 7  a finding with no URL: it is an inference, or its source is missing')
  const r = spawnSync(process.execPath, [tool, 'check', dir], { encoding: 'utf8' })
  assert.equal(r.status, 0); assert.equal(r.stdout.trim(), text)
  assert.equal(spawnSync(process.execPath, [tool, 'check', path.join(dir, 'nope')], { encoding: 'utf8' }).status, 2)
  assert.equal(render([]), 'report check: no notes in the folder')
})
