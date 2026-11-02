// ATLAS review-full — three review angles in parallel over one diff target, the findings
// merged by file:line, then every finding handed to a fresh agent that did not write it and
// is told to refute it from the source. Only what survives is printed, in the atlas-review
// line format. args: { target?: 'git diff' | 'git diff main...' | 'gh pr diff 12' | <file>,
// prefix?: plugin name before the colon (e.g. 'atlas'), angles?: extra angle sentences }.
export const meta = {
  name: 'atlas-review-full',
  description: 'ATLAS: review one diff from three angles in parallel, then try to refute every finding',
  phases: [{ title: 'Review', detail: 'one reviewer per angle, no shared context' }, { title: 'Refute', detail: 'a fresh agent per finding, source only' }],
}

const target = (args && args.target) || 'git diff'
const prefix = args && args.prefix ? String(args.prefix) + ':' : ''
const extra = Array.isArray(args && args.angles) ? args.angles.map(String) : []

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' }, line: { type: 'integer' },
          tier: { type: 'string', enum: ['breaks', 'fragile', 'unclear', 'ask'] },
          what: { type: 'string' }, fix: { type: 'string' },
          verdict: { type: 'string', enum: ['confirmed', 'needs_validation', 'rejected', 'none'] },
        },
        required: ['file', 'line', 'tier', 'what', 'fix'],
      },
    },
  },
  required: ['findings'],
}
const VERDICT = {
  type: 'object',
  properties: {
    refuted: { type: 'boolean' }, reason: { type: 'string' },
    verdict: { type: 'string', enum: ['confirmed', 'needs_validation', 'rejected', 'none'] },
  },
  required: ['refuted', 'reason'],
}

const ANGLES = [
  { key: 'correctness', ask: 'what breaks on what input: wrong result, crash, data lost, hang. A line names the input that triggers it, what happens, and why nothing already catches it; missing one of the three, drop the tier to unclear or ask.' },
  { key: 'security', ask: 'security: input meeting an interpreter, paths, SSRF, deserialisation, raw HTML; secrets in source, env prefixes, logs; authorisation missing where neighbours have it, IDOR, CSRF; weak crypto; dependencies. Each line carries a verdict: confirmed (path read entry to sink, effect shown locally), needs_validation (one fact outside the source decides; name it), rejected (do not report). Never contact anything deployed.' },
  { key: 'errors-tests', ask: 'silent failures: a swallowed catch, an ignored Result or error return, a missing await on a path that matters, a retry that hides a bug; and the tests this change needs but lacks, named by the case they would pin.' },
  ...extra.map((a, i) => ({ key: 'extra' + (i + 1), ask: a })),
]

const review = (a) => agent(
  `Review this target from ONE angle only: ${a.ask}\nTarget: \`${target}\` (run it with Bash to obtain the diff). For every changed file read the whole file, not the hunk, then the callers of what changed. Findings only: repo-relative file, line, tier (breaks, fragile, unclear, ask), what breaks and on what input, the fix. No style, no praise, no summary. Zero findings is a correct result.`,
  { label: 'review:' + a.key, phase: 'Review', schema: FINDINGS, agentType: prefix ? prefix + 'atlas-diff' : undefined },
)

phase('Review')
const rounds = (await parallel(ANGLES.map((a) => () => review(a)))).filter(Boolean)
// barrier on purpose: the same line reported by two angles is refuted once, not twice
const byKey = new Map()
for (const r of rounds) for (const f of r.findings || []) { const k = f.file + ':' + f.line; if (!byKey.has(k)) byKey.set(k, f) }
const found = [...byKey.values()]
log(`${found.length} candidate line(s) from ${rounds.length}/${ANGLES.length} angle(s)`)
if (!found.length) return { target, angles: ANGLES.map((a) => a.key), confirmed: [], dropped: 0, lines: ['nothing found'] }

phase('Refute')
const judged = await parallel(found.map((f) => () => agent(
  `You did not write this finding. Try to refute it from the repository source only: read \`${f.file}\` around line ${f.line}, the callers of what it names, and the tests. Finding: ${f.tier} — ${f.what}. Proposed fix: ${f.fix}. Refuted means: the input cannot occur, something upstream already catches it, the type or the framework default prevents it, or the effect is not what is claimed. Do not run anything against a deployed system. If the finding is a security one, also give its verdict: confirmed (path and effect hold), needs_validation (one fact outside the source decides; say which), rejected. Default to refuted=true when the evidence does not hold.`,
  { label: 'refute:' + f.file + ':' + f.line, phase: 'Refute', schema: VERDICT },
).then((v) => ({ f, v }))))

const kept = judged.filter(Boolean).filter((x) => x.v && !x.v.refuted && x.v.verdict !== 'rejected')
const dropped = found.length - kept.length
const lines = kept.map(({ f, v }) => `${f.file}:${f.line}  ${f.tier}  ${f.what}. ${f.fix}.${v.verdict && v.verdict !== 'none' ? '  [' + v.verdict + ']' : ''}`)
if (dropped) lines.push(`${dropped} dropped on second look`)
if (!kept.length) lines.unshift('nothing found')
return { target, angles: ANGLES.map((a) => a.key), confirmed: kept.map((x) => x.f), dropped, lines }
