// ATLAS ship — before a commit or a merge: every check command the project has, run in
// parallel by one runner each, beside a security review of the diff; then one verdict from
// plain code: ship only when every check passed and no `breaks` line survived. args:
// { commands: ['npm test', 'npx tsc --noEmit', ...], target?: 'git diff' (default),
//   prefix?: plugin name before the colon (e.g. 'atlas') }.
export const meta = {
  name: 'atlas-ship',
  description: 'ATLAS: run every project check in parallel beside a security review of the diff, one verdict',
  phases: [{ title: 'Checks', detail: 'one runner per command, logs stay with it' }, { title: 'Verdict' }],
}

const commands = Array.isArray(args && args.commands) ? args.commands.map(String).filter(Boolean) : []
const target = (args && args.target) || 'git diff'
const prefix = args && args.prefix ? String(args.prefix) + ':' : ''
if (!commands.length) return { ship: false, reason: 'no check commands given: pass args.commands from package.json scripts, Makefile, pyproject or the CI file', checks: [], findings: [] }

const CHECK = {
  type: 'object',
  properties: { passed: { type: 'boolean' }, decisive: { type: 'string' }, ran: { type: 'boolean' } },
  required: ['passed', 'decisive', 'ran'],
}
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

phase('Checks')
const runCheck = (cmd) => agent(
  `Run exactly this command in the repository root, once: \`${cmd}\`. Return ran=false if it could not start (tool missing, wrong folder). passed means exit code 0 and no failure in the output. decisive is the one line of output that decides it, quoted exactly (a failing test name, the first error, or the final summary line). Repair nothing, work around nothing.`,
  { label: 'check:' + cmd, phase: 'Checks', schema: CHECK, effort: 'low', agentType: prefix ? prefix + 'atlas-runner' : undefined },
).then((r) => ({ command: cmd, ...(r || { ran: false, passed: false, decisive: 'runner returned nothing' }) }))

const security = () => agent(
  `Review \`${target}\` (run it with Bash to obtain the diff) from the security angle only: input meeting an interpreter, paths, SSRF, deserialisation, raw HTML; secrets in source, public env prefixes, logs; a state-changing handler without the authorisation its neighbours have, IDOR, CSRF; weak crypto; a dependency added or bumped. Read whole changed files and their callers. Each line carries a verdict: confirmed (path read entry to sink, effect shown locally), needs_validation (one fact outside the source decides; name it), rejected (do not report). Never contact anything deployed. Findings only; zero is a correct result.`,
  { label: 'review:security', phase: 'Checks', schema: FINDINGS, agentType: prefix ? prefix + 'atlas-diff' : undefined },
)

// barrier on purpose: the verdict needs every check and the review together
const results = await parallel([...commands.map((c) => () => runCheck(c)), security])
const checks = results.slice(0, commands.length).filter(Boolean)
const sec = results[commands.length]
const findings = (sec && sec.findings ? sec.findings : []).filter((f) => f.verdict !== 'rejected')

phase('Verdict')
const failed = checks.filter((c) => !c.passed)
const notRun = commands.length - checks.length
const blocking = findings.filter((f) => f.tier === 'breaks')
const ship = failed.length === 0 && notRun === 0 && blocking.length === 0
const lines = [
  ...checks.map((c) => `${c.passed ? 'PASS' : c.ran ? 'FAIL' : 'DID NOT RUN'}  ${c.command}  ${c.decisive}`),
  ...findings.map((f) => `${f.file}:${f.line}  ${f.tier}  ${f.what}. ${f.fix}.${f.verdict && f.verdict !== 'none' ? '  [' + f.verdict + ']' : ''}`),
]
if (notRun) lines.push(`${notRun} check(s) returned nothing`)
const reason = ship ? 'every check passed, no breaks line' : [failed.length ? failed.length + ' check(s) failed' : null, notRun ? notRun + ' check(s) did not report' : null, blocking.length ? blocking.length + ' breaks line(s)' : null].filter(Boolean).join('; ')
return { ship, reason, checks, findings, lines: [...lines, (ship ? 'ship' : 'do not ship') + ' — ' + reason] }
