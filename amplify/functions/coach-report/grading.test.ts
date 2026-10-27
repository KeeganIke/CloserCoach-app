import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildReport,
  dropRepeatedQuotes,
  CATEGORIES,
  performanceGrade,
  RUBRIC_VERSION,
  scoreCategories,
  validateModelOutput,
  verifyQuotes,
  type CategoryId,
  type Line,
  type Rating,
} from './grading'

const lines: Line[] = [
  { role: 'assistant', text: "Dave's Auto Repair, this is Dave." },
  { role: 'user', text: "Hi Dave, it's Sam with Local Lift. Do you have thirty seconds?" },
  { role: 'assistant', text: "I'm slammed, what's this about?" },
  { role: 'user', text: 'How are most new customers finding your shop right now?' },
  { role: 'assistant', text: 'Word of mouth mostly. Just send me an email.' },
  { role: 'user', text: "Happy to. What would you want to see in it so it's worth your time?" },
  { role: 'assistant', text: "Prices. I've got to go." },
]

type Ratings = Partial<Record<CategoryId, Rating>>

function modelOutput(ratings: Ratings = {}, outcome = 'no_meeting') {
  return {
    summary: 'A short, polite call that never got past the brush-off.',
    categories: CATEGORIES.map((c) => ({
      id: c.id,
      rating: ratings[c.id] ?? '3',
      rationale: `Rationale for ${c.id}.`,
      evidence: 'Do you have thirty seconds?',
    })),
    outcome: { status: outcome, quote: "I've got to go.", rationale: 'Dave ended the call.' },
    qualification: { status: 'insufficient_information', quote: '', rationale: 'The rep never learned enough.' },
    whatWorked: [{ point: 'You asked permission up front.', quote: 'Do you have thirty seconds?' }],
    whatFellFlat: [{ point: 'You never set a follow-up time.', quote: 'What would you want to see in it' }],
    focusNextCall: 'Attach a specific time to the email.',
    suggestedLine: "I'll send it now; can we put ten minutes on Thursday to go over it?",
    objections: [
      {
        objection: 'Just send me an email.',
        yourResponse: 'What would you want to see in it?',
        verdict: 'worked',
        why: 'You made the email real.',
        betterLine: 'This should be dropped.',
      },
    ],
  }
}

const allRatings = (rating: Rating): Ratings => Object.fromEntries(CATEGORIES.map((c) => [c.id, rating]))

function grade(raw: unknown, transcript = lines) {
  const result = buildReport(raw, transcript)
  assert.ok(result.ok, `expected a report, got ${!result.ok && result.error}`)
  return result.report
}

test('weighted scoring and rounding', () => {
  // opening 4 (10), personalization 3 (7.5), discovery 2 (10), listening 3 (11.25),
  // value 1 (3.75), objection_handling 4 (15), closing 0 (0) = 57.5 of 100
  const report = grade(
    modelOutput({ opening: '4', personalization: '3', discovery: '2', listening: '3', value: '1', objection_handling: '4', closing: '0' }),
  )
  assert.equal(report.overallScore, 58)
  assert.deepEqual(
    report.categories.map((c) => c.earnedPoints),
    [10, 7.5, 10, 11.25, 3.75, 15, 0],
  )
  // all 3s = 75 exactly
  assert.equal(grade(modelOutput()).overallScore, 75)
})

test('N/A is left out of both earned and possible points', () => {
  // everything 4 except closing N/A: 85 / 85
  const { categories, overallScore } = scoreCategories(
    CATEGORIES.map((c) => ({ id: c.id, rating: c.id === 'closing' ? 'na' : '4' })),
  )
  assert.equal(overallScore, 100)
  assert.equal(categories.find((c) => c.id === 'closing')!.earnedPoints, null)

  // discovery 0 and personalization N/A: (10 + 0 + 15*4) / 90 earned at 4 elsewhere = 70/90
  const mixed = scoreCategories(
    CATEGORIES.map((c) => ({
      id: c.id,
      rating: c.id === 'personalization' ? 'na' : c.id === 'discovery' ? '0' : '4',
    })),
  )
  assert.equal(mixed.overallScore, Math.round((70 / 90) * 100))
})

test('all N/A produces no score', () => {
  assert.equal(scoreCategories(CATEGORIES.map((c) => ({ id: c.id, rating: 'na' }))).overallScore, null)
  const result = buildReport(modelOutput(allRatings('na')), lines)
  assert.equal(result.ok, false)
  assert.equal(!result.ok && result.reason, 'too_short')
})

test('strong ratings with no meeting still score high', () => {
  const report = grade(modelOutput(allRatings('4'), 'no_meeting'))
  assert.equal(report.overallScore, 100)
  assert.equal(report.outcome.status, 'no_meeting')
})

test('weak ratings with a booked meeting still score low', () => {
  const report = grade(modelOutput(allRatings('1'), 'meeting_booked'))
  assert.equal(report.overallScore, 25)
  assert.equal(report.performanceGrade, 'Significant Improvement Needed')
  assert.equal(report.outcome.status, 'meeting_booked')
})

test('objection handling N/A on an objection-free call', () => {
  const report = grade({ ...modelOutput({ ...allRatings('4'), objection_handling: 'na' }), objections: [] })
  assert.equal(report.overallScore, 100)
  const oh = report.categories.find((c) => c.id === 'objection_handling')!
  assert.equal(oh.rating, 'na')
  assert.equal(oh.earnedPoints, null)
})

test('a declined outcome does not change good ratings', () => {
  const declined = grade(modelOutput(allRatings('4'), 'declined'))
  const booked = grade(modelOutput(allRatings('4'), 'meeting_booked'))
  assert.equal(declined.overallScore, booked.overallScore)
  assert.equal(declined.outcome.status, 'declined')
})

test('a "send me info" ending is accepted as follow_up_agreed or no_meeting', () => {
  for (const outcome of ['follow_up_agreed', 'no_meeting']) {
    const checked = validateModelOutput(modelOutput({}, outcome))
    assert.ok(checked.ok)
  }
  for (const status of ['qualified', 'not_qualified', 'insufficient_information']) {
    assert.ok(validateModelOutput({ ...modelOutput(), qualification: { status, quote: '', rationale: 'x' } }).ok)
  }
})

test('fewer than 3 rep turns is too short', () => {
  const short = lines.slice(0, 4) // two rep turns
  const result = buildReport(modelOutput(), short)
  assert.equal(result.ok, false)
  assert.equal(!result.ok && result.reason, 'too_short')
  // blank rep lines don't count
  const padded = [...short, { role: 'user' as const, text: '   ' }]
  assert.equal(buildReport(modelOutput(), padded).ok, false)
})

test('invalid model output is rejected', () => {
  const base = modelOutput()
  const cases: [string, unknown][] = [
    ['missing category', { ...base, categories: base.categories.slice(1) }],
    ['duplicate category', { ...base, categories: [...base.categories.slice(1), base.categories[1]] }],
    ['out-of-range rating', { ...base, categories: base.categories.map((c, i) => (i ? c : { ...c, rating: '5' })) }],
    ['numeric rating', { ...base, categories: base.categories.map((c, i) => (i ? c : { ...c, rating: 3 })) }],
    ['unknown category', { ...base, categories: base.categories.map((c, i) => (i ? c : { ...c, id: 'tone' })) }],
    ['unknown outcome', { ...base, outcome: { ...base.outcome, status: 'maybe_later' } }],
    ['unknown qualification', { ...base, qualification: { ...base.qualification, status: 'decision_maker' } }],
    ['missing summary', { ...base, summary: undefined }],
    ['missing focusNextCall', { ...base, focusNextCall: undefined }],
    ['missing whatWorked', { ...base, whatWorked: undefined }],
    ['missing rationale', { ...base, categories: base.categories.map((c, i) => (i ? c : { ...c, rationale: ' ' })) }],
    ['bad verdict', { ...base, objections: [{ ...base.objections[0], verdict: 'great' }] }],
    ['not an object', 'here is your report'],
  ]
  for (const [name, raw] of cases) {
    assert.equal(validateModelOutput(raw).ok, false, name)
    const result = buildReport(raw, lines)
    assert.equal(!result.ok && result.reason, 'invalid', name)
  }
})

test('quote verification removes a fabricated quote and keeps a real one', () => {
  const checked = validateModelOutput({
    ...modelOutput(),
    whatWorked: [
      { point: 'Real.', quote: 'do you have THIRTY seconds' },
      { point: 'Fake.', quote: 'I guarantee you will double your revenue' },
    ],
    whatFellFlat: [{ point: 'Shortened.', quote: "Happy to... what would you want to see" }],
  })
  assert.ok(checked.ok)
  const verified = verifyQuotes(checked.value, lines)
  assert.equal(verified.whatWorked[0].quote, 'do you have THIRTY seconds')
  assert.equal(verified.whatWorked[1].quote, '')
  assert.equal(verified.whatWorked[1].point, 'Fake.')
  assert.equal(verified.whatFellFlat[0].quote, 'Happy to... what would you want to see')

  // A fabricated category quote is removed without changing the rating.
  const raw = modelOutput(allRatings('4'))
  raw.categories[0].evidence = 'Let me tell you about our award-winning platform.'
  const report = grade(raw)
  assert.equal(report.categories[0].evidence, '')
  assert.equal(report.categories[0].rating, '4')
  assert.equal(report.overallScore, 100)
})

test('score band boundaries', () => {
  assert.equal(performanceGrade(100), 'Excellent')
  assert.equal(performanceGrade(90), 'Excellent')
  assert.equal(performanceGrade(89), 'Strong')
  assert.equal(performanceGrade(85), 'Strong')
  assert.equal(performanceGrade(84), 'Passing')
  assert.equal(performanceGrade(75), 'Passing')
  assert.equal(performanceGrade(74), 'Needs Improvement')
  assert.equal(performanceGrade(60), 'Needs Improvement')
  assert.equal(performanceGrade(59), 'Significant Improvement Needed')
  assert.equal(performanceGrade(0), 'Significant Improvement Needed')
})

test('reports carry the fields needed for future rescoring', () => {
  const report = grade(modelOutput({ closing: 'na' }))
  assert.equal(report.rubricVersion, RUBRIC_VERSION)
  assert.equal(report.rubricVersion, 1)
  assert.equal(typeof report.overallScore, 'number')
  assert.equal(typeof report.performanceGrade, 'string')
  assert.deepEqual(
    report.categories.map((c) => c.id),
    CATEGORIES.map((c) => c.id),
  )
  for (const c of report.categories) {
    const def = CATEGORIES.find((d) => d.id === c.id)!
    assert.equal(c.name, def.name)
    assert.equal(c.weight, def.weight)
    assert.equal(c.maxPoints, def.weight)
    assert.ok(['4', '3', '2', '1', '0', 'na'].includes(c.rating))
    assert.ok('earnedPoints' in c)
  }
})

test('weights come from code, not from the model', () => {
  const raw = modelOutput(allRatings('4'))
  ;(raw.categories[0] as Record<string, unknown>).weight = 90
  const report = grade(raw)
  assert.equal(report.categories[0].weight, 10)
  assert.equal(report.overallScore, 100)
})

test('extra items are trimmed and a "worked" objection has no better line', () => {
  const p = { point: 'x', quote: '' }
  const report = grade({ ...modelOutput(), whatWorked: [p, p, p], whatFellFlat: [p, p, p, p] })
  assert.equal(report.whatWorked.length, 2)
  assert.equal(report.whatFellFlat.length, 3)
  assert.equal(report.objections[0].betterLine, '')
})

test('objections the owner never said are dropped', () => {
  const raw = modelOutput()
  raw.objections.push({
    objection: 'We already have a guy who does our website.',
    yourResponse: 'Made up response.',
    verdict: 'fell_flat',
    why: 'x',
    betterLine: 'y',
  })
  const report = grade(raw)
  assert.equal(report.objections.length, 1)
  assert.equal(report.objections[0].objection, 'Just send me an email.')
  assert.equal(report.objections[0].yourResponse, 'What would you want to see in it?')
})

test('an objection response that is not in the transcript is blanked', () => {
  const raw = modelOutput()
  raw.objections[0].yourResponse = 'Sure, I will send it right over.'
  assert.equal(grade(raw).objections[0].yourResponse, '')
})

test('each quote is shown only once', () => {
  const checked = validateModelOutput({
    ...modelOutput(),
    whatWorked: [{ point: 'Permission.', quote: 'Do you have thirty seconds?' }],
    whatFellFlat: [{ point: 'Email.', quote: 'what would you want to see in it' }],
    outcome: { status: 'no_meeting', quote: "Prices. I've got to go.", rationale: 'x' },
  })
  assert.ok(checked.ok)
  const out = dropRepeatedQuotes(checked.value)
  // Strengths and missed opportunities keep their quotes.
  assert.equal(out.whatWorked[0].quote, 'Do you have thirty seconds?')
  assert.equal(out.whatFellFlat[0].quote, 'what would you want to see in it')
  // Every category used the strength's quote, so all are blanked.
  assert.ok(out.categories.every((c) => c.evidence === ''))
  // A new quote survives.
  assert.equal(out.outcome.quote, "Prices. I've got to go.")
  // The objection response is not blanked, but later repeats of it are.
  assert.equal(out.objections[0].yourResponse, 'What would you want to see in it?')
})

test('a category quote that repeats an objection response is blanked; distinct ones stay', () => {
  const raw = modelOutput()
  raw.whatWorked = []
  raw.whatFellFlat = []
  raw.categories[0].evidence = "Hi Dave, it's Sam with Local Lift."
  raw.categories[1].evidence = 'What would you want to see in it?'
  raw.categories[2].evidence = 'How are most new customers finding your shop right now?'
  raw.categories[3].evidence = 'How are most new customers finding your shop right now?'
  const report = grade(raw)
  assert.equal(report.categories[0].evidence, "Hi Dave, it's Sam with Local Lift.")
  assert.equal(report.categories[1].evidence, '')
  assert.equal(report.categories[2].evidence, 'How are most new customers finding your shop right now?')
  assert.equal(report.categories[3].evidence, '')
})
