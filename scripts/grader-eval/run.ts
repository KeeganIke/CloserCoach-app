// Runs the test calls through the real grader and checks each grade against what
// it should be. Uses the same code as the live report function, called directly.
//
//   OPENAI_API_KEY must be set in your terminal (never in a file).
//   npx tsx scripts/grader-eval/run.ts              all calls, 3 runs each
//   The made-up calls are in calls.ts; real practice calls (private, not in the
//   repo) are added from real-calls.ts when that file exists.
//   RUNS=1 ONLY=fit-bad,fit-good npx tsx scripts/grader-eval/run.ts
//
// Prints a pass/fail table and saves every full report to grader-eval-results/.

import { mkdirSync, writeFileSync } from 'node:fs'
import { CALLS, type Range, type TestCall } from './calls'

if (!process.env.OPENAI_API_KEY) {
  console.error('Set OPENAI_API_KEY in this terminal first.')
  process.exit(1)
}
const { handler } = await import('../../amplify/functions/coach-report/handler')

const RUNS = Number(process.env.RUNS || 3)
const NEED = Math.ceil((RUNS * 2) / 3) // passes needed: 2 of 3
const PARALLEL = 4
const only = process.env.ONLY?.split(',').map((s) => s.trim())
// Real practice calls are private (gitignored); include them when the file exists.
const REAL: TestCall[] = await import('./real-calls').then((m) => m.REAL_CALLS).catch(() => [])
const ALL = [...CALLS, ...REAL]
const calls = only ? ALL.filter((c) => only.includes(c.id)) : ALL

type Category = { id: string; rating: string; improvement: string; tryLine: string; rationale: string; whatHappened: string }
type Report = {
  overallScore: number
  outcome: { status: string }
  categories: Category[]
  whatWorked: { point: string }[]
  whatFellFlat: { point: string }[]
  summary: string
  focusNextCall: string
  objections: { objection: string; yourResponse: string; verdict: string; why: string; betterLine: string }[]
}

async function grade(call: TestCall): Promise<Report | { error: string }> {
  const res = await handler({
    requestContext: { http: { method: 'POST' } },
    body: JSON.stringify({ persona: call.persona, offer: call.offer, lines: call.lines }),
  })
  const body = JSON.parse(res.body)
  return res.statusCode === 200 ? body.report : { error: `${res.statusCode} ${body.error}` }
}

// ---------- Checks ----------

const ratingOf = (r: Report, id: string) => r.categories.find((c) => c.id === id)?.rating ?? 'missing'
const inRange = (rating: string, want: Range | 'na' | 'na_or_ok') => {
  if (want === 'na') return rating === 'na'
  if (want === 'na_or_ok') return rating === 'na' || Number(rating) >= 2
  return rating !== 'na' && Number(rating) >= want[0] && Number(rating) <= want[1]
}
const termsFlagged = (r: Report) => r.whatFellFlat.some((p) => /(isn't|aren't|is not|are not) in your offer/i.test(p.point))

// Every string the grader wrote, except quotes of the call.
function writtenText(value: unknown, key = ''): string[] {
  if (typeof value === 'string') return key === 'quote' || key === 'objection' ? [] : [value]
  if (Array.isArray(value)) return value.flatMap((v) => writtenText(v, key))
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => writtenText(v, k))
  return []
}
const STOP = new Set('a an the to and or of in on for at with you your it is that this what how they them their be can could would will i we our do did about if so as by from'.split(' '))
const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s']/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w)))
// "Next time" and "Say" saying the same thing: most of the words are shared.
function repeatsSay(c: Category) {
  if (!c.improvement || !c.tryLine) return false
  const a = words(c.improvement)
  const b = words(c.tryLine)
  const shared = [...a].filter((w) => b.has(w)).length
  return shared / Math.min(a.size, b.size) >= 0.6
}

type Check = { name: string; want: string; got: string[]; passes: number }

// Most a call's score may move between runs of the same transcript.
const MAX_SPREAD = 5

function checksFor(call: TestCall, reports: (Report | { error: string })[]): Check[] {
  if (call.expect.tooShort) {
    const got = reports.map((r) => ("error" in r ? (/too short/i.test(r.error) ? "too short" : r.error) : `scored ${r.overallScore}`))
    return [{ name: "too short", want: "too short", got, passes: got.filter((g) => g === "too short").length }]
  }
  const ok = reports.filter((r): r is Report => !('error' in r))
  const checks: Check[] = []
  const add = (name: string, want: string, values: string[], pass: (i: number) => boolean) =>
    checks.push({ name, want, got: values, passes: ok.filter((_, i) => pass(i)).length })

  for (const [id, want] of Object.entries(call.expect.ratings || {})) {
    const values = ok.map((r) => ratingOf(r, id))
    add(id, Array.isArray(want) ? `${want[0]}-${want[1]}` : want!, values, (i) => inRange(values[i], want!))
  }
  if (call.expect.score) {
    const [lo, hi] = call.expect.score
    const values = ok.map((r) => String(r.overallScore))
    add('score', `${lo}-${hi}`, values, (i) => ok[i].overallScore >= lo && ok[i].overallScore <= hi)
  }
  if (call.expect.outcome) {
    const values = ok.map((r) => r.outcome.status)
    add('outcome', call.expect.outcome.join('/'), values, (i) => call.expect.outcome!.includes(values[i]))
  }
  if (call.expect.termsFlagged !== undefined) {
    const values = ok.map((r) => (termsFlagged(r) ? 'flagged' : 'not flagged'))
    add('terms', call.expect.termsFlagged ? 'flagged' : 'not flagged', values, (i) => termsFlagged(ok[i]) === call.expect.termsFlagged)
  }
  if (call.expect.noZeros) {
    const values = ok.map((r) => r.categories.filter((c) => c.rating === '0').map((c) => c.id).join('+') || 'none')
    add('no zeros', 'none', values, (i) => values[i] === 'none')
  }
  // Consistency: the same transcript graded several times should land within
  // MAX_SPREAD points. One value for the whole call, so it passes or fails as a whole.
  if (ok.length > 1) {
    const scores = ok.map((r) => r.overallScore)
    const spread = Math.max(...scores) - Math.min(...scores)
    checks.push({ name: 'spread', want: `<= ${MAX_SPREAD}`, got: [`${spread} (${scores.join(', ')})`], passes: spread <= MAX_SPREAD ? ok.length : 0 })
  }
  // Wording checks on every report.
  const semis = ok.map((r) => writtenText(r).filter((s) => /[;—–]/.test(s)).length)
  add('no ; or dashes', '0', semis.map(String), (i) => semis[i] === 0)
  const repeats = ok.map((r) => r.categories.filter(repeatsSay).map((c) => c.id).join('+') || 'none')
  add('next time != say', 'none', repeats, (i) => repeats[i] === 'none')
  if (ok.length < reports.length) add('graded', `${RUNS}`, [`${ok.length}`], () => false)
  return checks
}

// ---------- Run ----------

const jobs = calls.flatMap((call) => Array.from({ length: RUNS }, (_, run) => ({ call, run })))
const results = new Map<string, (Report | { error: string })[]>(calls.map((c) => [c.id, []]))
let next = 0
let done = 0
const started = Date.now()
await Promise.all(
  Array.from({ length: PARALLEL }, async () => {
    while (next < jobs.length) {
      const { call, run } = jobs[next++]
      const report = await grade(call).catch((e) => ({ error: String(e) }))
      results.get(call.id)![run] = report
      process.stdout.write(`\r${++done}/${jobs.length} graded`)
    }
  }),
)
console.log(` in ${Math.round((Date.now() - started) / 1000)}s\n`)

let failed = 0
const lines: string[] = []
for (const call of calls) {
  const checks = checksFor(call, results.get(call.id)!)
  const bad = checks.filter((c) => c.passes < NEED)
  if (bad.length) failed++
  const mark = bad.length ? '✗' : '✓'
  const row = checks.map((c) => `${c.passes >= NEED ? '' : '!'}${c.name} ${c.got.join(',')} (want ${c.want})`)
  lines.push(`${mark} ${call.id.padEnd(20)} ${row.join(' | ')}`)
}
console.log(lines.join('\n'))
console.log(`\n${calls.length - failed}/${calls.length} calls pass (${NEED} of ${RUNS} runs needed for each check)`)

// Full reports, for reading the wording.
mkdirSync('grader-eval-results', { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
writeFileSync(`grader-eval-results/${stamp}.json`, JSON.stringify(Object.fromEntries(results), null, 2))
const md = calls.map((call) => {
  const r = results.get(call.id)![0]
  if (!r || 'error' in r) return `## ${call.id}\n\nError: ${r && 'error' in r ? r.error : 'none'}`
  const cats = r.categories
    .map((c) => `- **${c.id} ${c.rating}**: ${c.rationale}${c.whatHappened ? `\n  - What happened: ${c.whatHappened}\n  - Next time: ${c.improvement}\n  - Say: ${c.tryLine}` : ''}`)
    .join('\n')
  const obj = r.objections.map((o) => `- "${o.objection}" (${o.verdict}): ${o.yourResponse} ${o.why}${o.betterLine ? ` Better: "${o.betterLine}"` : ''}`).join('\n')
  return `## ${call.id}: ${call.title}\n\n**${r.overallScore}**, ${r.outcome.status}. ${r.summary}\n\nFocus: ${r.focusNextCall}\n\nWorked: ${r.whatWorked.map((p) => p.point).join(' / ')}\n\nFell flat: ${r.whatFellFlat.map((p) => p.point).join(' / ')}\n\n${cats}\n\nObjections:\n${obj || '- none'}`
})
writeFileSync(`grader-eval-results/${stamp}.md`, `# Grader eval ${stamp}\n\n${lines.join('\n')}\n\n${md.join('\n\n')}\n`)
console.log(`Saved grader-eval-results/${stamp}.md`)
