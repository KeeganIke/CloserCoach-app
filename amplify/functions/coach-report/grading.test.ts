import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AI_CATEGORIES,
  capObjectionHandling,
  termsOutsideOffer,
  answerStats,
  buildReport,
  inventsTerms,
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
      whatHappened: `What happened in ${c.id}.`,
      improvement: `Improve ${c.id}.`,
      tryLine: `Try line for ${c.id}.`,
    })),
    outcome: { status: outcome, rationale: 'Dave ended the call.' },
    whatWorked: [{ point: 'You asked permission up front.', quote: 'Do you have thirty seconds?' }],
    whatFellFlat: [{ point: 'You never set a follow-up time.', quote: '' }],
    focusNextCall: 'Attach a specific time to the email.',
    hiddenCoaching: '',
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
  assert.equal(AI_CATEGORIES.length, 7)
})

test('weighted scoring and rounding', () => {
  // Points per rating: 4 = 100%, 3 = 80%, 2 = 60%, 1 = 30%, 0 = 0%.
  // opening 4 (10), discovery 3 (16), solution_fit 1 (4.5), listening 3 (8),
  // objection_handling 2 (12), closing 0 (0), clarity 4 (7), delivery 4 (3) = 60.5, rounds up to 61
  const { categories, overallScore } = scoreCategories(
    ratingsFor({
      opening: '4',
      discovery: '3',
      solution_fit: '1',
      listening: '3',
      objection_handling: '2',
      closing: '0',
      clarity: '4',
      delivery: '4',
    }),
  )
  assert.equal(overallScore, 61)
  assert.deepEqual(
    categories.map((c) => c.earnedPoints),
    [10, 16, 4.5, 8, 12, 0, 7, 3],
  )
  // All model ratings 3 plus clean filler words: 97 * 80% + 3 = 80.6 of 100.
  assert.equal(grade(modelOutput()).overallScore, 81)
})

test('N/A is left out of both earned and possible points', () => {
  const { categories, overallScore } = scoreCategories(
    ratingsFor({ opening: '4', discovery: '4', solution_fit: '4', listening: '4', objection_handling: '4', delivery: '4' }),
  )
  assert.equal(overallScore, 100)
  assert.equal(categories.find((c) => c.id === 'closing')!.earnedPoints, null)

  // discovery 0, closing and clarity N/A, everything else 4: 58 of 78.
  const mixed = scoreCategories(
    ratingsFor({ opening: '4', discovery: '0', solution_fit: '4', listening: '4', objection_handling: '4', delivery: '4' }),
  )
  assert.equal(mixed.overallScore, Math.round((58 / 78) * 100))
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
  // 97 * 30% + 3 = 32.1
  const report = grade(modelOutput(allRatings('1'), 'meeting_booked'))
  assert.equal(report.overallScore, 32)
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
  // Outcomes no longer carry a quote.
  assert.ok(validateModelOutput({ ...modelOutput(), outcome: { status: 'no_meeting', rationale: 'x' } }).ok)
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
    ['missing whatFellFlat', { ...base, whatFellFlat: undefined }],
    ['outcome without status', { ...base, outcome: {} }],
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

  // A fabricated weakness quote is removed; the point and the score stay.
  const raw = modelOutput(allRatings('4'))
  raw.whatFellFlat = [{ point: 'Overpromised.', quote: 'Let me tell you about our award-winning platform.' }]
  const report = grade(raw)
  assert.equal(report.whatFellFlat[0].quote, '')
  assert.equal(report.whatFellFlat[0].point, 'Overpromised.')
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

test('an objection response can be a paraphrase of how the rep handled it', () => {
  const raw = modelOutput()
  raw.objections[0].yourResponse = 'You agreed to send it, then asked what would make it worth opening.'
  assert.equal(grade(raw).objections[0].yourResponse, 'You agreed to send it, then asked what would make it worth opening.')
})

test('each quote is shown only once', () => {
  const checked = validateModelOutput({
    ...modelOutput(),
    whatWorked: [{ point: 'Permission.', quote: 'Do you have thirty seconds?' }],
    whatFellFlat: [
      { point: 'Repeats a strength.', quote: 'Do you have thirty seconds?' },
      { point: 'New.', quote: 'How are most new customers finding your shop right now?' },
      { point: 'Repeats the one above.', quote: 'how are most new customers finding your shop' },
    ],
  })
  assert.ok(checked.ok)
  const out = dropRepeatedQuotes(checked.value)
  assert.equal(out.whatWorked[0].quote, 'Do you have thirty seconds?')
  assert.deepEqual(
    out.whatFellFlat.map((p) => p.quote),
    ['', 'How are most new customers finding your shop right now?', ''],
  )
})

test('suggested lines that make up deal terms are dropped; terms from the offer stay', () => {
  const offer = '$77/month, fully built for you, no upfront fee, no contracts.'
  // In the offer box: fine, even though the rep never said it.
  assert.equal(inventsTerms('It is $77 a month with no upfront fee.', offer, lines), false)
  // Not in the offer and never said: made up.
  assert.equal(inventsTerms('And if you are not happy you get a full refund.', offer, lines), true)
  assert.equal(inventsTerms('I will build you a free mockup first.', offer, lines), true)
  assert.equal(inventsTerms('It is only $49 a month.', offer, lines), true)
  // The offer box is the source of truth: a term the rep said but the box doesn't have isn't backed.
  const repSaid: Line[] = [...lines, { role: 'user', text: 'I can do a free mockup for you.' }]
  assert.equal(inventsTerms('I will build you a free mockup first.', offer, repSaid), true)
  // With no offer box, what the rep said on the call counts.
  assert.equal(inventsTerms('I will build you a free mockup first.', '', repSaid), false)
  // Dollar amounts that aren't a price are fine.
  assert.equal(inventsTerms('If one extra job is worth $8,000, it pays for itself.', offer, lines), false)

  const raw = modelOutput({ discovery: '2' })
  raw.categories[1].tryLine = 'Plus you get a money-back guarantee.'
  raw.objections[0].verdict = 'mixed'
  raw.objections[0].betterLine = 'It is $77 a month with no upfront fee.'
  const report = buildReport(raw, lines, offer)
  assert.ok(report.ok)
  assert.equal(report.report.categories.find((c) => c.id === 'discovery')!.tryLine, '')
  assert.equal(report.report.objections[0].betterLine, 'It is $77 a month with no upfront fee.')
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
  assert.equal(report.overallScore, 97)
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
  assert.equal(report.rubricVersion, 5)
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

test('"How to improve" advice only appears below full marks', () => {
  const report = grade(modelOutput({ opening: '4', discovery: '2', closing: 'na' }))
  const byId = (id: string) => report.categories.find((c) => c.id === id)!
  assert.equal(byId('opening').whatHappened, '')
  assert.equal(byId('opening').improvement, '')
  assert.equal(byId('opening').tryLine, '')
  assert.equal(byId('closing').improvement, '')
  assert.equal(byId('discovery').whatHappened, 'What happened in discovery.')
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
  const noAdvice = { ...base, categories: base.categories.map(({ whatHappened, improvement, tryLine, ...c }) => c) }
  assert.equal(validateModelOutput(noAdvice).ok, false)
})

test('hiddenCoaching is required', () => {
  const { hiddenCoaching, ...rest } = modelOutput()
  assert.equal(validateModelOutput(rest).ok, false)
  assert.ok(validateModelOutput({ ...modelOutput(), hiddenCoaching: 'You found the slow nights.' }).ok)
})

test('fair across the board lands at 60, good at 80', () => {
  const all = (rating: Rating) => scoreCategories(CATEGORIES.map((c) => ({ id: c.id, rating }))).overallScore
  assert.equal(all('2'), 60)
  assert.equal(all('3'), 80)
  assert.equal(all('4'), 100)
  assert.equal(all('1'), 30)
  assert.equal(all('0'), 0)
})

test('objection handling never gets its own "How to improve"', () => {
  const report = grade(modelOutput({ objection_handling: '2' }))
  const oh = report.categories.find((c) => c.id === 'objection_handling')!
  assert.equal(oh.whatHappened, '')
  assert.equal(oh.improvement, '')
  assert.equal(oh.tryLine, '')
})

test('answer lengths count only the rep', () => {
  assert.deepEqual(answerStats(lines), { answers: 3, average: 12, longest: 15 })
  assert.deepEqual(answerStats([{ role: 'assistant', text: 'Hello there.' }]), { answers: 0, average: 0, longest: 0 })
})

test('clear and concise is rated by the model; filler words by code', () => {
  assert.ok(AI_CATEGORIES.some((c) => c.id === 'clarity'))
  assert.ok(!AI_CATEGORIES.some((c) => (c.id as string) === 'delivery'))
  const report = grade(modelOutput({ clarity: '2' }))
  const clarity = report.categories.find((c) => c.id === 'clarity')!
  assert.equal(clarity.maxPoints, 7)
  assert.equal(clarity.earnedPoints, 4.2)
  assert.equal(clarity.improvement, 'Improve clarity.')
  assert.equal(report.categories.find((c) => c.id === 'delivery')!.maxPoints, 3)
})

test('objection handling is capped by its own objection verdicts', () => {
  const withVerdicts = (rating: Rating, verdicts: string[]) => {
    const checked = validateModelOutput({
      ...modelOutput({ objection_handling: rating }),
      objections: verdicts.map((verdict) => ({ objection: 'Just send me an email.', yourResponse: 'x', verdict, why: 'x', betterLine: 'y' })),
    })
    assert.ok(checked.ok)
    return capObjectionHandling(checked.value).categories.find((c) => c.id === 'objection_handling')!.rating
  }
  assert.equal(withVerdicts('4', ['worked', 'worked']), '4')
  assert.equal(withVerdicts('4', ['worked', 'mixed']), '3')
  assert.equal(withVerdicts('3', ['mixed', 'fell_flat']), '2') // the 89-point Mike call
  assert.equal(withVerdicts('3', ['fell_flat', 'fell_flat']), '1')
  assert.equal(withVerdicts('1', ['mixed']), '1') // never raised
  assert.equal(withVerdicts('na', ['mixed']), 'na')
  assert.equal(withVerdicts('3', []), '3') // no cards, no cap

  // End to end: Mixed + Fell flat can't score Good.
  const raw = modelOutput({ objection_handling: '3' })
  raw.objections = [
    { objection: 'Just send me an email.', yourResponse: 'x', verdict: 'mixed', why: 'x', betterLine: 'y' },
    { objection: "Prices. I've got to go.", yourResponse: 'x', verdict: 'fell_flat', why: 'x', betterLine: 'y' },
  ]
  assert.equal(grade(raw).categories.find((c) => c.id === 'objection_handling')!.earnedPoints, 12)
})

test('deal terms the rep promised outside the offer box are found', () => {
  const offer = 'I build and run websites for $77/mo with no upfront fee and no contracts.'
  const repLines: Line[] = [
    { role: 'user', text: "It's $77 a month, no upfront fee." },
    { role: 'user', text: "If you're not satisfied, you get your money back. That's our guarantee." },
  ]
  assert.deepEqual(termsOutsideOffer(offer, repLines), ['guarantee', 'money back'])
  assert.deepEqual(termsOutsideOffer(offer, repLines.slice(0, 1)), [])
  assert.deepEqual(termsOutsideOffer('', repLines), []) // no box, nothing to compare against
})
