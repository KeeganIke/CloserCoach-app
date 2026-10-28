import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AI_CATEGORIES,
  buildReport,
  CATEGORIES,
  dropRepeatedQuotes,
  performanceGrade,
  RUBRIC_VERSION,
  scoreCategories,
  scoreDelivery,
  validateModelOutput,
  verifyQuotes,
  type AiCategoryId,
  type CategoryId,
  type Line,
  type Rating,
} from './grading'

// 37 rep words, no filler words, so delivery scores "4" (5 of 5 points).
const lines: Line[] = [
  { role: 'assistant', text: "Dave's Auto Repair, this is Dave." },
  { role: 'user', text: "Hi Dave, it's Sam with Local Lift. Do you have thirty seconds?" },
  { role: 'assistant', text: "I'm slammed, what's this about?" },
  { role: 'user', text: 'How are most new customers finding your shop right now?' },
  { role: 'assistant', text: 'Word of mouth mostly. Just send me an email.' },
  { role: 'user', text: "Happy to. What would you want to see in it so it's worth your time?" },
  { role: 'assistant', text: "Prices. I've got to go." },
]

type Ratings = Partial<Record<AiCategoryId, Rating>>

function modelOutput(ratings: Ratings = {}, outcome = 'no_meeting') {
  return {
    summary: 'A short, polite call that never got past the brush-off.',
    categories: AI_CATEGORIES.map((c) => ({
      id: c.id,
      rating: ratings[c.id] ?? '3',
      rationale: `Rationale for ${c.id}.`,
      evidence: 'Do you have thirty seconds?',
      improvement: `Improve ${c.id}.`,
      tryLine: `Try line for ${c.id}.`,
    })),
    outcome: { status: outcome, quote: "I've got to go.", rationale: 'Dave ended the call.' },
    qualification: { status: 'insufficient_information', quote: '', rationale: 'The rep never learned enough.' },
    whatWorked: [{ point: 'You asked permission up front.', quote: 'Do you have thirty seconds?' }],
    focusNextCall: 'Attach a specific time to the email.',
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

const allRatings = (rating: Rating): Ratings => Object.fromEntries(AI_CATEGORIES.map((c) => [c.id, rating]))
const ratingsFor = (r: Partial<Record<CategoryId, Rating>>) => CATEGORIES.map((c) => ({ id: c.id, rating: r[c.id] ?? 'na' }))

function grade(raw: unknown, transcript = lines) {
  const result = buildReport(raw, transcript)
  assert.ok(result.ok, `expected a report, got ${!result.ok && result.error}`)
  return result.report
}

test('the rubric adds up to 100 points', () => {
  assert.equal(
    CATEGORIES.reduce((sum, c) => sum + c.weight, 0),
    100,
  )
  assert.equal(AI_CATEGORIES.length, 6)
})

test('weighted scoring and rounding', () => {
  // opening 4 (15), discovery 3 (15), solution_fit 2 (7.5), listening 3 (7.5),
  // objection_handling 1 (5), closing 0 (0), delivery 2 (2.5) = 52.5, rounds up to 53
  const { categories, overallScore } = scoreCategories(
    ratingsFor({ opening: '4', discovery: '3', solution_fit: '2', listening: '3', objection_handling: '1', closing: '0', delivery: '2' }),
  )
  assert.equal(overallScore, 53)
  assert.deepEqual(
    categories.map((c) => c.earnedPoints),
    [15, 15, 7.5, 7.5, 5, 0, 2.5],
  )
  // All model ratings 3 plus a clean delivery 4: 95 * 3/4 + 5 = 76.25 of 100.
  assert.equal(grade(modelOutput()).overallScore, 76)
})

test('N/A is left out of both earned and possible points', () => {
  const { categories, overallScore } = scoreCategories(
    ratingsFor({ opening: '4', discovery: '4', solution_fit: '4', listening: '4', objection_handling: '4', delivery: '4' }),
  )
  assert.equal(overallScore, 100)
  assert.equal(categories.find((c) => c.id === 'closing')!.earnedPoints, null)

  // discovery 0 and closing N/A, everything else 4: 65 of 85.
  const mixed = scoreCategories(
    ratingsFor({ opening: '4', discovery: '0', solution_fit: '4', listening: '4', objection_handling: '4', delivery: '4' }),
  )
  assert.equal(mixed.overallScore, Math.round((65 / 85) * 100))
})

test('all N/A produces no score, and delivery alone cannot make one', () => {
  assert.equal(scoreCategories(ratingsFor({})).overallScore, null)
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
  // 95 * 1/4 + 5 = 28.75
  const report = grade(modelOutput(allRatings('1'), 'meeting_booked'))
  assert.equal(report.overallScore, 29)
  assert.equal(report.performanceGrade, 'Poor')
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
    assert.ok(validateModelOutput(modelOutput({}, outcome)).ok)
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
    ['model rates delivery', { ...base, categories: base.categories.map((c, i) => (i ? c : { ...c, id: 'delivery' })) }],
    ['seven categories', { ...base, categories: [...base.categories, { ...base.categories[0], id: 'delivery' }] }],
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
  })
  assert.ok(checked.ok)
  const verified = verifyQuotes(checked.value, lines)
  assert.equal(verified.whatWorked[0].quote, 'do you have THIRTY seconds')
  assert.equal(verified.whatWorked[1].quote, '')
  assert.equal(verified.whatWorked[1].point, 'Fake.')

  // A shortened quote counts when each piece is in one line, in order.
  const shortened = { ...checked.value, whatWorked: [{ point: 'Shortened.', quote: 'Happy to... what would you want to see' }] }
  assert.equal(verifyQuotes(shortened, lines).whatWorked[0].quote, 'Happy to... what would you want to see')

  // A fabricated category quote is removed without changing the rating.
  const raw = modelOutput(allRatings('4'))
  raw.whatWorked = []
  raw.categories[0].evidence = 'Let me tell you about our award-winning platform.'
  const report = grade(raw)
  assert.equal(report.categories[0].evidence, '')
  assert.equal(report.categories[0].rating, '4')
  assert.equal(report.overallScore, 100)
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
    outcome: { status: 'no_meeting', quote: "Prices. I've got to go.", rationale: 'x' },
  })
  assert.ok(checked.ok)
  const out = dropRepeatedQuotes(checked.value)
  assert.equal(out.whatWorked[0].quote, 'Do you have thirty seconds?')
  assert.ok(out.categories.every((c) => c.evidence === ''))
  assert.equal(out.outcome.quote, "Prices. I've got to go.")
  assert.equal(out.objections[0].yourResponse, 'What would you want to see in it?')
})

test('a category quote that repeats an objection response is blanked; distinct ones stay', () => {
  const raw = modelOutput()
  raw.whatWorked = []
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

test('delivery counts filler words in rep lines only', () => {
  const rep = (text: string): Line => ({ role: 'user', text })
  const owner = (text: string): Line => ({ role: 'assistant', text })

  // No fillers.
  const clean = scoreDelivery(lines)
  assert.equal(clean.rating, '4')
  assert.equal(clean.fillers, 0)
  assert.equal(clean.words, 37)

  // From real calls: "Yeah, um, do you have", "any, like, major issues", "could, you know, make it".
  const counted = scoreDelivery([
    rep('Yeah, um, do you have any issues with your current website? Is there anything you would change?'),
    rep("Is there any, like, major issues you've been having with it?"),
    rep("Okay, is there anything in that email that you'd like to see that could, you know, make it worth your time?"),
    owner('Um, uh, like, I am busy, you know, really busy.'),
  ])
  assert.equal(counted.fillers, 3) // um, like, you know; the owner's and "you'd like to see" don't count
  assert.equal(counted.words, 49)
  assert.equal(counted.rating, '1') // about 6.1 per 100 words

  // Stretched spellings count; ordinary uses of "like" don't.
  assert.equal(scoreDelivery([rep('Ummm, uhh, I like your shop and would like to help, erm, a lot more than you think.')]).fillers, 3)

  // Heavy filler use bottoms out at 0.
  assert.equal(scoreDelivery([rep('Um uh um uh so um I uh build um websites uh for um local uh shops um and uh more um things.')]).rating, '0')

  // Too few words to judge.
  assert.equal(scoreDelivery([rep('Hi Dave.'), rep('Um, okay.'), rep('Thanks.')]).rating, 'na')
})

test('delivery thresholds', () => {
  const words = (n: number, fillers: number) =>
    scoreDelivery([{ role: 'user', text: [...Array(fillers).fill('um'), ...Array(n - fillers).fill('word')].join(' ') }]).rating
  assert.equal(words(100, 1), '4')
  assert.equal(words(100, 2), '3')
  assert.equal(words(100, 4), '2')
  assert.equal(words(100, 6), '1')
  assert.equal(words(100, 8), '0')
})

test('delivery is scored by code and included in the report', () => {
  const fillerLines: Line[] = [
    lines[0],
    { role: 'user', text: "Um, hi Dave, uh, it's Sam with, um, Local Lift. Do you, uh, have thirty seconds?" },
    lines[2],
    { role: 'user', text: 'Um, how are, uh, most new customers finding your shop right now?' },
    lines[4],
    { role: 'user', text: "Uh, happy to. Um, what would you want to see in it so it's worth your time?" },
    lines[6],
  ]
  const report = grade(modelOutput(allRatings('4')), fillerLines)
  const delivery = report.categories.find((c) => c.id === 'delivery')!
  assert.equal(delivery.rating, '0')
  assert.equal(delivery.earnedPoints, 0)
  assert.match(delivery.rationale, /^8 filler words/)
  assert.equal(report.overallScore, 95)
})

test('score band boundaries', () => {
  assert.equal(performanceGrade(100), 'Elite')
  assert.equal(performanceGrade(90), 'Elite')
  assert.equal(performanceGrade(89), 'Strong')
  assert.equal(performanceGrade(80), 'Strong')
  assert.equal(performanceGrade(79), 'Developing')
  assert.equal(performanceGrade(70), 'Developing')
  assert.equal(performanceGrade(69), 'Needs Improvement')
  assert.equal(performanceGrade(60), 'Needs Improvement')
  assert.equal(performanceGrade(59), 'Poor')
  assert.equal(performanceGrade(0), 'Poor')
})

test('reports carry the fields needed for future rescoring', () => {
  const report = grade(modelOutput({ closing: 'na' }))
  assert.equal(report.rubricVersion, RUBRIC_VERSION)
  assert.equal(report.rubricVersion, 2)
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
  assert.equal(report.categories[0].weight, 15)
  assert.equal(report.overallScore, 100)
})

test('extra items are trimmed and a "worked" objection has no better line', () => {
  const p = { point: 'x', quote: '' }
  const report = grade({ ...modelOutput(), whatWorked: [p, p, p] })
  assert.equal(report.whatWorked.length, 2)
  assert.equal(report.objections[0].betterLine, '')
})

test('"How to improve" advice only appears below full marks', () => {
  const report = grade(modelOutput({ opening: '4', discovery: '2', closing: 'na' }))
  const byId = (id: string) => report.categories.find((c) => c.id === id)!
  assert.equal(byId('opening').improvement, '')
  assert.equal(byId('opening').tryLine, '')
  assert.equal(byId('closing').improvement, '')
  assert.equal(byId('discovery').improvement, 'Improve discovery.')
  assert.equal(byId('discovery').tryLine, 'Try line for discovery.')
  // Clean delivery needs no advice.
  assert.equal(byId('delivery').improvement, '')
})

test('delivery advice names the fillers used', () => {
  const report = grade(modelOutput(), [
    lines[0],
    { role: 'user', text: "Um, hi Dave, it's Sam with, you know, Local Lift. Do you, uh, have thirty seconds?" },
    lines[2],
    { role: 'user', text: 'Um, how are most new customers finding your shop right now?' },
    lines[4],
    { role: 'user', text: "Happy to. What would you want to see in it so it's worth your time?" },
    lines[6],
  ])
  const delivery = report.categories.find((c) => c.id === 'delivery')!
  assert.notEqual(delivery.rating, '4')
  assert.match(delivery.improvement, /"um" and "uh" and "you know"/)
})

test('categories missing the advice fields are rejected', () => {
  const base = modelOutput()
  const noAdvice = { ...base, categories: base.categories.map(({ improvement, tryLine, ...c }) => c) }
  assert.equal(validateModelOutput(noAdvice).ok, false)
})
