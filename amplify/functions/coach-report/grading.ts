// The grading rubric and the code that turns the model's ratings into a report.
// The model only rates each category; the score, points and grade are computed
// here so the numbers always add up. No network calls, so it can be unit tested.

export const RUBRIC_VERSION = 4

// Ids are stable; display names and weights can change (bump RUBRIC_VERSION).
// The model rates every category except delivery, which code scores from filler words.
export const CATEGORIES = [
  { id: 'opening', name: 'Opening and Attention', weight: 15 },
  { id: 'discovery', name: 'Pain Discovery', weight: 20 },
  { id: 'solution_fit', name: 'Solution Fit', weight: 15 },
  { id: 'listening', name: 'Listening and Adaptability', weight: 10 },
  { id: 'objection_handling', name: 'Objection Handling', weight: 20 },
  { id: 'closing', name: 'Closing and Next Step', weight: 15 },
  { id: 'delivery', name: 'Delivery', weight: 5 },
] as const

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id)
export const AI_CATEGORIES = CATEGORIES.filter((c) => c.id !== 'delivery')
export const AI_CATEGORY_IDS = AI_CATEGORIES.map((c) => c.id)
export const RATINGS = ['4', '3', '2', '1', '0', 'na'] as const

// Share of a category's points each rating earns. Not a straight line: "Fair" is
// worth 60%, so a practicing rep who is fair across the board lands at 60, not 50.
// Kept in whole percents so sums stay exact.
export const RATING_PERCENT: Record<Exclude<Rating, 'na'>, number> = { 4: 100, 3: 80, 2: 60, 1: 30, 0: 0 }

// Initial coaching benchmarks, highest first. A score gets the first band it reaches.
export const SCORE_BANDS = [
  { min: 90, label: 'Elite' },
  { min: 80, label: 'Strong' },
  { min: 70, label: 'Developing' },
  { min: 60, label: 'Needs Improvement' },
  { min: 0, label: 'Poor' },
] as const

// Delivery: filler words per 100 rep words. A rate below each limit earns that rating.
const FILLER_LIMITS = [
  { below: 2, rating: '4' },
  { below: 4, rating: '3' },
  { below: 6, rating: '2' },
  { below: 8, rating: '1' },
] as const
const MIN_DELIVERY_WORDS = 20
// "um", "uh" and their stretched spellings, plus "like" and "you know" set off as fillers
// ("is there any, like, major issues", "could, you know, make it").
const FILLER_PATTERNS = [/\b(?:u+m+|u+h+|e+r+m+)\b/gi, /\blike,/gi, /,\s*you know\s*,/gi]

export const OUTCOMES = ['meeting_booked', 'follow_up_agreed', 'no_meeting', 'declined', 'insufficient_information'] as const
export const VERDICTS = ['worked', 'mixed', 'fell_flat'] as const

export const MIN_REP_TURNS = 3
const MAX_STRENGTHS = 2
const MAX_WEAKNESSES = 3
const MAX_OBJECTIONS = 3

export type CategoryId = (typeof CATEGORIES)[number]['id']
export type AiCategoryId = Exclude<CategoryId, 'delivery'>
export type Rating = (typeof RATINGS)[number]
export type Line = { role: 'user' | 'assistant'; text: string }
type Outcome = { status: string }
type Point = { point: string; quote: string } // quote is optional (empty) and rarely used
// objection is the owner's exact words; yourResponse is a plain summary of how the
// rep handled it (paraphrase is fine, since a rambling answer has no single quote).
type Objection = { objection: string; yourResponse: string; verdict: string; why: string; betterLine: string }
// The "How to improve" advice, empty at full marks or N/A: whatHappened tells the
// moment in plain words, improvement is the one-line "next time", tryLine what to say.
type RatedCategory<Id> = { id: Id; rating: Rating; rationale: string; whatHappened: string; improvement: string; tryLine: string }

// What the model returns (after validation).
export type ModelOutput = {
  summary: string
  categories: RatedCategory<AiCategoryId>[]
  outcome: Outcome
  whatWorked: Point[]
  whatFellFlat: Point[]
  focusNextCall: string
  hiddenCoaching: string // about what the owner was hiding; empty when it wasn't known
  objections: Objection[]
}

export type ScoredCategory = {
  id: CategoryId
  name: string
  weight: number
  maxPoints: number
  rating: Rating
  earnedPoints: number | null // null for N/A
  rationale: string
  whatHappened: string
  improvement: string
  tryLine: string
}

export type Report = Omit<ModelOutput, 'categories'> & {
  rubricVersion: number
  overallScore: number
  performanceGrade: string
  categories: ScoredCategory[]
}

export function countRepTurns(lines: Line[]) {
  return lines.filter((l) => l?.role === 'user' && typeof l.text === 'string' && l.text.trim()).length
}

// Scores the delivery category from the rep's own lines.
export function scoreDelivery(lines: Line[]) {
  const text = lines
    .filter((l) => l?.role === 'user' && typeof l.text === 'string')
    .map((l) => l.text)
    .join(' ')
  const words = text.split(/\s+/).filter((w) => /[a-z0-9]/i.test(w)).length
  const found = FILLER_PATTERNS.flatMap((re) => text.match(re) || []).map((f) => f.replace(/[,\s]+/g, ' ').trim().toLowerCase())
  const fillers = found.length
  if (words < MIN_DELIVERY_WORDS) {
    return { rating: 'na' as Rating, rationale: 'Too few words to judge filler use.', improvement: '', fillers, words }
  }
  const rate = (fillers / words) * 100
  const rating: Rating = FILLER_LIMITS.find((l) => rate < l.below)?.rating ?? '0'
  const rationale = fillers
    ? `${fillers} filler word${fillers === 1 ? '' : 's'} (${[...new Set(found)].map((f) => `"${f}"`).join(', ')}) in ${words} words, about ${Math.round(rate * 10) / 10} per 100.`
    : `No filler words in ${words} words.`
  const improvement =
    rating === '4'
      ? ''
      : `Cut back on ${[...new Set(found)].map((f) => `"${f}"`).join(' and ')}: when you need a second to think, pause instead, since the owner waits for you to finish.`
  return { rating, rationale, improvement, fillers, words }
}

export function performanceGrade(score: number) {
  return SCORE_BANDS.find((b) => score >= b.min)!.label
}

// Weighted score from the ratings. N/A categories count toward neither the
// earned points nor the possible points. Returns null when everything is N/A.
// Sums are kept in whole weight-percents so 57.5 rounds to 58, not 57.4999… to 57.
export function scoreCategories(ratings: { id: CategoryId; rating: Rating }[]) {
  let earned = 0
  let possible = 0
  const categories = CATEGORIES.map((c) => {
    const rating = ratings.find((r) => r.id === c.id)?.rating ?? 'na'
    const earnedPoints = rating === 'na' ? null : (c.weight * RATING_PERCENT[rating]) / 100
    if (rating !== 'na') {
      earned += c.weight * RATING_PERCENT[rating]
      possible += c.weight * 100
    }
    return { id: c.id, name: c.name, weight: c.weight, maxPoints: c.weight, rating, earnedPoints }
  })
  const overallScore = possible ? Math.round((earned * 100) / possible) : null
  return { categories, overallScore }
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string'
const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => list.includes(v as T)

function checkOutcome(v: unknown) {
  if (!isObj(v) || !oneOf(OUTCOMES, v.status)) throw new Error('invalid outcome')
  return { status: v.status }
}

function checkPoints(v: unknown, field: string, max: number) {
  if (!Array.isArray(v) || !v.every((p) => isObj(p) && isStr(p.point) && isStr(p.quote))) {
    throw new Error(`invalid ${field}`)
  }
  return v.slice(0, max).map((p) => ({ point: p.point as string, quote: p.quote as string }))
}

// Checks the model's JSON. Returns the cleaned output or an error message; never
// trusts weights or scores from the model.
export function validateModelOutput(raw: unknown): { ok: true; value: ModelOutput } | { ok: false; error: string } {
  try {
    if (!isObj(raw)) throw new Error('not an object')
    for (const field of ['summary', 'focusNextCall', 'hiddenCoaching']) {
      if (!isStr(raw[field])) throw new Error(`missing ${field}`)
    }

    if (!Array.isArray(raw.categories)) throw new Error('missing categories')
    if (raw.categories.length !== AI_CATEGORIES.length) throw new Error('wrong number of categories')
    const seen = new Set<string>()
    const categories = raw.categories.map((c) => {
      if (!isObj(c) || !oneOf(AI_CATEGORY_IDS, c.id)) throw new Error('unknown category')
      if (seen.has(c.id)) throw new Error(`duplicate category ${c.id}`)
      seen.add(c.id)
      if (!oneOf(RATINGS, c.rating)) throw new Error(`invalid rating for ${c.id}`)
      if (![c.rationale, c.whatHappened, c.improvement, c.tryLine].every(isStr)) throw new Error(`missing fields for ${c.id}`)
      if (c.rating !== 'na' && !(c.rationale as string).trim()) throw new Error(`missing rationale for ${c.id}`)
      // No advice at full marks or N/A, or for objection handling, whose objection
      // cards already carry a better line for each objection.
      const advise = c.rating !== '4' && c.rating !== 'na' && c.id !== 'objection_handling'
      return {
        id: c.id,
        rating: c.rating,
        rationale: c.rationale as string,
        whatHappened: advise ? (c.whatHappened as string) : '',
        improvement: advise ? (c.improvement as string) : '',
        tryLine: advise ? (c.tryLine as string) : '',
      }
    })

    if (!Array.isArray(raw.objections)) throw new Error('missing objections')
    const objections = raw.objections.slice(0, MAX_OBJECTIONS).map((o) => {
      if (!isObj(o) || !oneOf(VERDICTS, o.verdict)) throw new Error('invalid objection')
      for (const field of ['objection', 'yourResponse', 'why', 'betterLine']) {
        if (!isStr(o[field])) throw new Error(`invalid objection ${field}`)
      }
      return {
        objection: o.objection as string,
        yourResponse: o.yourResponse as string,
        verdict: o.verdict,
        why: o.why as string,
        betterLine: o.verdict === 'worked' ? '' : (o.betterLine as string),
      }
    })

    return {
      ok: true,
      value: {
        summary: raw.summary as string,
        categories,
        outcome: checkOutcome(raw.outcome),
        whatWorked: checkPoints(raw.whatWorked, 'whatWorked', MAX_STRENGTHS),
        whatFellFlat: checkPoints(raw.whatFellFlat, 'whatFellFlat', MAX_WEAKNESSES),
        focusNextCall: raw.focusNextCall as string,
        hiddenCoaching: raw.hiddenCoaching as string,
        objections,
      },
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// Lowercase, drop punctuation, collapse whitespace.
export function normalizeText(s: string) {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// A quote counts when it appears within one transcript line. Shortened quotes
// ("I'm calling ... your website") count when each piece appears in order.
export function quoteInTranscript(quote: string, lines: Line[]) {
  const pieces = quote.split(/\.{3}|…/).map(normalizeText).filter(Boolean)
  if (!pieces.length) return false
  return lines.some((l) => {
    const text = normalizeText(l.text || '')
    let from = 0
    for (const piece of pieces) {
      const at = text.indexOf(piece, from)
      if (at < 0) return false
      from = at + piece.length
    }
    return true
  })
}

// Blanks out any strength or weakness quote that isn't in the transcript and drops
// objections the owner never actually said. Ratings stay as they are.
export function verifyQuotes(output: ModelOutput, lines: Line[]): ModelOutput {
  const keep = (q: string) => (quoteInTranscript(q, lines) ? q : '')
  const keepPoints = (points: Point[]) => points.map((p) => ({ ...p, quote: keep(p.quote) }))
  return {
    ...output,
    whatWorked: keepPoints(output.whatWorked),
    whatFellFlat: keepPoints(output.whatFellFlat),
    objections: output.objections.filter((o) => quoteInTranscript(o.objection, lines)),
  }
}

// Shows each quote once: a strength or weakness quote that repeats an earlier one
// is blanked.
export function dropRepeatedQuotes(output: ModelOutput): ModelOutput {
  const seen: string[] = []
  const once = (q: string) => {
    const n = normalizeText(q)
    if (!n || seen.some((s) => s.includes(n) || n.includes(s))) return ''
    seen.push(n)
    return q
  }
  return {
    ...output,
    whatWorked: output.whatWorked.map((p) => ({ ...p, quote: once(p.quote) })),
    whatFellFlat: output.whatFellFlat.map((p) => ({ ...p, quote: once(p.quote) })),
  }
}

// Words in a suggested line that state terms of the deal (fees, guarantees, refunds,
// "free", a monthly price). If the rep's offer and the rep's own words never mention
// them, the grader made them up ("no upfront fee"). Other dollar amounts, like what
// a job is worth, are fine.
const TERM_PATTERNS = [/\bfees?\b/gi, /\bguarantee[ds]?\b/gi, /\brefunds?\b/gi, /\bmoney back\b/gi, /\bfree\b/gi, /\$\s?\d[\d,.]*\s*(?:a|per|\/)\s*mo(?:nth)?\b/gi]

export function inventsTerms(line: string, offer: string, lines: Line[]) {
  const known = normalizeText([offer, ...lines.filter((l) => l.role === 'user').map((l) => l.text)].join(' ')).replace(/\s/g, '')
  // A price counts as known if the same number appears ("$77 a month" vs "$77/month").
  const key = (term: string) => (term.includes('$') ? term.replace(/[^\d]/g, '') : normalizeText(term).replace(/\s/g, ''))
  return TERM_PATTERNS.some((re) => (line.match(re) || []).some((term) => !known.includes(key(term))))
}

// Removes suggested lines that make up terms of the deal.
export function dropInventedTerms(output: ModelOutput, offer: string, lines: Line[]): ModelOutput {
  const clean = (line: string) => (line && inventsTerms(line, offer, lines) ? '' : line)
  return {
    ...output,
    categories: output.categories.map((c) => ({ ...c, tryLine: clean(c.tryLine) })),
    objections: output.objections.map((o) => ({ ...o, betterLine: clean(o.betterLine) })),
  }
}

export type GradeResult = { ok: true; report: Report } | { ok: false; reason: 'invalid' | 'too_short'; error: string }

// Turns the model's raw JSON into the final report.
export function buildReport(raw: unknown, lines: Line[], offer = ''): GradeResult {
  if (countRepTurns(lines) < MIN_REP_TURNS) return { ok: false, reason: 'too_short', error: 'too few rep turns' }

  const checked = validateModelOutput(raw)
  if (!checked.ok) return { ok: false, reason: 'invalid', error: checked.error }

  const output = dropInventedTerms(dropRepeatedQuotes(verifyQuotes(checked.value, lines)), offer, lines)
  // Delivery alone can't make a score: if the model could judge nothing, the call was too short.
  if (output.categories.every((c) => c.rating === 'na')) {
    return { ok: false, reason: 'too_short', error: 'every category was N/A' }
  }
  const delivery = scoreDelivery(lines)
  const rated = [
    ...output.categories,
    { id: 'delivery' as const, rating: delivery.rating, rationale: delivery.rationale, whatHappened: '', improvement: delivery.improvement, tryLine: '' },
  ]
  const { categories, overallScore } = scoreCategories(rated)
  if (overallScore === null) return { ok: false, reason: 'too_short', error: 'every category was N/A' }

  return {
    ok: true,
    report: {
      rubricVersion: RUBRIC_VERSION,
      overallScore,
      performanceGrade: performanceGrade(overallScore),
      ...output,
      categories: categories.map((c) => {
        const r = rated.find((x) => x.id === c.id)!
        return { ...c, rationale: r.rationale, whatHappened: r.whatHappened, improvement: r.improvement, tryLine: r.tryLine }
      }),
    },
  }
}
