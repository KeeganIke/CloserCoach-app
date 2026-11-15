// Builds one complete practice owner for a call from the lists in owners.ts:
// who they are, how they act, what's going on in their business, and the
// concerns that come from it. Pure code, no AI: the businesses come from the
// offer analysis (shared/offer.ts). The same scenario number always rebuilds the
// same owner for the same analysis, so a call can be replayed.

import {
  BUSINESS_CONCERNS,
  CONCERN_TYPES,
  CONFLICTS,
  FACT_NEEDS,
  FACTS,
  MOTIVATIONS,
  NEEDS_SITUATION,
  OWNERS,
  PERSONALITIES,
  PERSONALITY_CONCERNS,
  PERSONALITY_NEEDS,
  SITUATION_CONCERNS,
  SITUATION_NEEDS,
  TRAITS,
  type ConcernTypeId,
  type Fact,
  type Level,
  type PersonalityId,
  type Situation,
  type Trait,
} from './owners'

import type { Business, OfferContext } from '../shared/offer'
export type { Business, OfferContext }

export type Concern = {
  type: ConcernTypeId
  typeLabel: string
  angle: string
  angleLabel: string
  reason: string // why this owner has it: a business fact, their setup, or their nature
  worry: string // what's really underneath
  resolve: string // what would actually resolve it
  major: boolean // won't move after one answer; only business concerns are major
  source: 'business' | 'personality'
}

export type Scenario = {
  id: number
  owner: { name: string; gender: 'male' | 'female'; business: string; industry: string; detail: string; background: string }
  scene: string
  personality: { id: PersonalityId; label: string }
  traits: Record<Trait, Level>
  situation: Situation
  // has_setup: what they use and its real weakness. no_solution: how they get by, and the gap.
  setup: { text: string; weakness: string }
  facts: Fact[]
  problems: string[]
  motivation: string[]
  needs: string[]
  concerns: Concern[]
}

export type RecentCall = {
  owner: string
  business?: string // its kind ("plumbing company")
  businessName?: string // the business itself ("Summit Plumbing")
  personality: PersonalityId
  concernTypes: ConcernTypeId[]
}

// ---------- Seeded random numbers ----------

function seeded(seed: number) {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}
type Rand = () => number
const pick = <T,>(rand: Rand, list: readonly T[]) => list[Math.floor(rand() * list.length)]
const between = (rand: Rand, lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1))
function shuffled<T>(rand: Rand, list: readonly T[]) {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const conflicts = (a: string, b: string) => CONFLICTS.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
const fitsSituation = (f: Fact, situation: Situation) => !NEEDS_SITUATION[f.id] || NEEDS_SITUATION[f.id] === situation

// ---------- The builder ----------

export function buildScenario(id: number, offer: OfferContext): Scenario {
  const rand = seeded(id)

  const owner = pick(rand, OWNERS)
  const business = pick(rand, offer.businesses)
  const personality = pick(rand, PERSONALITIES)
  const traits = Object.fromEntries(
    TRAITS.map((t) => [t, between(rand, personality.ranges[t][0], personality.ranges[t][1]) as Level]),
  ) as Record<Trait, Level>
  const situation: Situation = rand() < 0.5 ? 'no_solution' : 'has_setup'
  // Facts this business can't support: fully booked needs a problem that isn't
  // about customers, and loyalty to a vendor needs a setup run by someone outside.
  const ruledOut = new Set([
    ...(business.problems.some((p) => p.area !== 'customers') ? [] : ['fully_booked']),
    ...(business.setups.some((x) => x.outside) ? [] : ['trusted_vendor']),
  ])

  // Facts: one performance and one budget fact always; timing and trust sometimes.
  const facts: Fact[] = []
  const add = (group: Fact['group'], chance: number) => {
    if (rand() >= chance) return
    const options = FACTS.filter(
      (f) => f.group === group && !ruledOut.has(f.id) && fitsSituation(f, situation) && !facts.some((g) => conflicts(f.id, g.id)),
    )
    if (options.length) facts.push(pick(rand, options))
  }
  add('performance', 1)
  add('budget', 1)
  add('timing', 0.6)
  add('trust', 0.6)
  const has = (id: string) => facts.some((f) => f.id === id)

  // Their setup (or how they get by). A trusted-vendor owner's setup is always
  // run by an outside company or person.
  const setups = has('trusted_vendor') ? business.setups.filter((x) => x.outside) : business.setups
  const setup =
    situation === 'has_setup'
      ? (({ text, weakness }) => ({ text, weakness }))(pick(rand, setups))
      : (({ text, gap }) => ({ text, weakness: gap }))(pick(rand, business.gaps))

  // Problems the product could solve; a fully booked owner never gets a "need more customers" one.
  const pool = business.problems.filter((p) => !(has('fully_booked') && p.area === 'customers'))
  const first = pick(rand, pool)
  const others = pool.filter((p) => p.area !== first.area)
  const problems = [first.text, ...(others.length && rand() < 0.6 ? [pick(rand, others).text] : [])]

  // What they want: from how the business is doing, never random.
  const main = has('expanding')
    ? 'fill_new'
    : ({ growing: 'keep_up', flat: 'grow', slowing: 'steady', fully_booked: 'save_time', uneven: 'fill_slow' } as Record<string, string>)[
        facts[0].id
      ]
  const secondary = ['money_tight', 'cutting_costs', 'pays_off'].some(has)
    ? 'pay_for_results'
    : situation === 'has_setup'
      ? 'fix_current'
      : null
  const motivation = [MOTIVATIONS[main], ...(secondary ? [MOTIVATIONS[secondary]] : [])]

  // Always at least two: their nature, their circumstances, then their situation.
  const needs = [PERSONALITY_NEEDS[personality.id], ...facts.map((f) => FACT_NEEDS[f.id]).filter(Boolean), SITUATION_NEEDS[situation]]
    .filter((n, i, all) => all.indexOf(n) === i)
    .slice(0, 3)

  const concerns = pickConcerns(rand, { personality: personality.id, traits, situation, setup, facts, context: business })
  // The analysis explains why this product raises a concern the owner already
  // has. It never adds a concern by itself.
  for (const c of concerns) {
    const why = business.reasons?.[c.type]
    if (why && !c.reason.includes(why)) c.reason = `${c.reason} ${why}`
  }

  return {
    id,
    owner: {
      name: owner.name,
      gender: owner.gender,
      business: business.name,
      industry: business.type,
      detail: business.detail,
      background: business.background,
    },
    scene: pick(rand, business.scenes),
    personality: { id: personality.id, label: personality.label },
    traits,
    situation,
    setup,
    facts,
    problems,
    motivation,
    needs,
    concerns,
  }
}

// How often the business gives a second concern (when it has one to give).
const SECOND_BUSINESS_CONCERN = 0.5

function makeConcern(rand: Rand, type: ConcernTypeId, angles: string[], reason: string, major: boolean, source: Concern['source']): Concern {
  const t = CONCERN_TYPES[type]
  const angleId = pick(rand, angles)
  const angle = t.angles.find((a) => a.id === angleId)!
  return { type, typeLabel: t.label, angle: angle.id, angleLabel: angle.label, reason, worry: angle.worry, resolve: angle.resolve, major, source }
}

// 1–3 concerns and up to two majors for ANY personality: how hard a call is comes
// from the business, not from how the owner talks. A friendly owner who got
// burned and is cutting costs is as hard as a skeptic. Only business concerns
// can be major; personality can add one minor concern. Skeptical or
// change-averse owners never have just one concern.
function pickConcerns(
  rand: Rand,
  o: {
    personality: PersonalityId
    traits: Record<Trait, Level>
    situation: Situation
    setup: { text: string; weakness: string }
    facts: Fact[]
    context?: Business
  },
): Concern[] {
  const cautious = o.traits.skepticism === 4 || o.traits.openness === 1
  const max = 3
  const min = cautious ? 2 : 1
  const maxMajors = 2

  // Business candidates: one per type, a major version beats a minor one.
  const byType = new Map<ConcernTypeId, { angles: string[]; reason: string; major: boolean }>()
  const offer = (type: ConcernTypeId, angles: string[], reason: string, major: boolean) => {
    const prev = byType.get(type)
    if (!prev || (major && !prev.major)) byType.set(type, { angles, reason, major })
  }
  const situationPick = SITUATION_CONCERNS[o.situation]
  offer(situationPick.type, situationPick.angles, `Right now ${o.setup.text}.`, false)
  const expanding = o.facts.some((f) => f.id === 'expanding')
  for (const f of o.facts) {
    // A fully booked owner who is expanding wants to fill the new space, so
    // "too busy for more" would contradict them; the expansion gives the timing concern.
    if (f.id === 'fully_booked' && expanding) continue
    const b = BUSINESS_CONCERNS[f.id]
    if (b) offer(b.type, b.angles, f.text, b.major)
  }
  // Concerns that exist only because of the product: an awkward fit for this
  // business, or something that has to work with tools they already use. Always
  // minor, and just one more candidate among the business concerns.
  if (o.context?.fitConcern) offer('fit', [o.context.fitConcern.angle], o.context.fitConcern.reason, false)
  if (o.context?.toolsConcern) offer('compatibility', [o.context.toolsConcern.angle], o.context.toolsConcern.reason, false)
  // Majors first, and loyalty to a long-time vendor ahead of other majors.
  const majors = shuffled(rand, [...byType].filter(([, c]) => c.major))
  majors.sort(([a], [b]) => Number(b === 'current') - Number(a === 'current'))
  const candidates = [...majors, ...shuffled(rand, [...byType].filter(([, c]) => !c.major))]

  const concerns: Concern[] = []
  const takeBusiness = () => {
    // Past the major limit, skip remaining majors rather than water them down:
    // someone burned before doesn't drop it after one answer.
    const atLimit = concerns.filter((c) => c.major).length >= maxMajors
    const index = candidates.findIndex(([, c]) => !(c.major && atLimit))
    if (index < 0) return false
    const [type, c] = candidates.splice(index, 1)[0]
    concerns.push(makeConcern(rand, type, c.angles, c.reason, c.major, 'business'))
    return true
  }
  takeBusiness()
  // Sometimes a second business concern, the same chance for every personality.
  if (candidates.length && concerns.length < max && rand() < SECOND_BUSINESS_CONCERN) takeBusiness()

  const nature = PERSONALITY_CONCERNS[o.personality]
  const p = { ...nature, ...nature.bySituation?.[o.situation] }
  const addPersonality = () => {
    const same = concerns.find((c) => c.type === p.type)
    if (same) {
      // Their business already raised this type: their nature sharpens it instead
      // (Old School's "what I have works" on top of having a setup).
      // A major concern keeps its own angle (loyalty, too full); only the reason grows.
      if (!same.reason.includes(p.reason)) {
        same.reason = `${same.reason} ${p.reason}`
        if (!same.major) {
          const angle = CONCERN_TYPES[p.type].angles.find((a) => a.id === p.angles[0])!
          Object.assign(same, { angle: angle.id, angleLabel: angle.label, worry: angle.worry, resolve: angle.resolve })
        }
      }
      return false
    }
    if (concerns.length >= max) return false
    concerns.push(makeConcern(rand, p.type, p.angles, p.reason, false, 'personality'))
    return true
  }
  if (rand() < p.chance) addPersonality()
  while (concerns.length < min) {
    if (!addPersonality() && !takeBusiness()) break
  }
  return concerns
}

// ---------- Checks ----------

// Everything that must hold for a scenario to be used. Returns what's wrong.
export function validateScenario(s: Scenario): string[] {
  const problems: string[] = []
  const personality = PERSONALITIES.find((p) => p.id === s.personality.id)
  if (!personality) return ['unknown personality']
  for (const t of TRAITS) {
    const [lo, hi] = personality.ranges[t]
    if (s.traits[t] < lo || s.traits[t] > hi) problems.push(`${t} out of range`)
  }
  const groups = s.facts.map((f) => f.group)
  if (!groups.includes('performance') || !groups.includes('budget')) problems.push('missing a required fact')
  if (new Set(groups).size !== groups.length) problems.push('two facts from one group')
  for (const a of s.facts) for (const b of s.facts) if (a.id < b.id && conflicts(a.id, b.id)) problems.push(`${a.id} conflicts with ${b.id}`)
  for (const f of s.facts) if (!fitsSituation(f, s.situation)) problems.push(`${f.id} doesn't fit ${s.situation}`)
  if (!s.setup.text || !s.setup.weakness) problems.push('no setup or gap to find')
  if (s.problems.length < 1 || s.problems.length > 2) problems.push('needs 1–2 problems')
  if (!s.motivation.length) problems.push('no motivation')
  if (s.needs.length < 2) problems.push('fewer than two needs')

  const cautious = s.traits.skepticism === 4 || s.traits.openness === 1
  const [min, max] = cautious ? [2, 3] : [1, 3]
  if (s.concerns.length < min || s.concerns.length > max) problems.push(`${s.concerns.length} concerns, expected ${min}–${max}`)
  if (!s.concerns.some((c) => c.source === 'business')) problems.push('no business concern')
  if (s.concerns.some((c) => c.major && c.source !== 'business')) problems.push('a personality concern is major')
  if (s.concerns.filter((c) => c.major).length > 2) problems.push('too many major concerns')
  if (new Set(s.concerns.map((c) => c.type)).size !== s.concerns.length) problems.push('repeated concern type')
  for (const c of s.concerns) if (!c.reason || !c.worry || !c.resolve) problems.push(`${c.type} missing its reasoning`)
  return problems
}

// ---------- Picking a scenario for a new call ----------

// Picks a fresh scenario number that passes every check and doesn't repeat recent
// calls: never the last owner; never the last kind of business when there's more
// than one kind, and otherwise (a rep who sells to one kind) never the same
// business; never a personality from the last 2 calls; and at most one concern
// type shared with the last 3. Recent calls are newest first.
export function pickScenario({
  recent = [],
  offer,
  random = Math.random,
}: { recent?: RecentCall[]; offer: OfferContext; random?: () => number }): Scenario {
  const recentTypes = new Set(recent.slice(0, 3).flatMap((r) => r.concernTypes))
  const kinds = new Set(offer.businesses.map((b) => b.type)).size
  let fallback: Scenario | null = null
  for (let attempt = 0; attempt < 60; attempt++) {
    const s = buildScenario(100000 + Math.floor(random() * 900000), offer)
    if (validateScenario(s).length) continue
    fallback ??= s
    if (recent[0] && s.owner.name === recent[0].owner) continue
    if (kinds > 1 && recent[0]?.business && s.owner.industry === recent[0].business) continue
    if (offer.businesses.length > 1 && recent[0]?.businessName && s.owner.business === recent[0].businessName) continue
    if (recent.slice(0, 2).some((r) => r.personality === s.personality.id)) continue
    if (s.concerns.filter((c) => recentTypes.has(c.type)).length > 1) continue
    return s
  }
  return fallback ?? buildScenario(100000, offer)
}
