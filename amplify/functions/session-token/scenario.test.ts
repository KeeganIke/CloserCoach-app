import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONCERN_TYPES, OWNERS, PERSONALITIES, TRAIT_SENTENCES, TRAITS } from './owners'
import { SAMPLE_BUSINESSES, SAMPLE_CONTEXT } from './sampleBusinesses'
import { buildScenario, pickScenario, validateScenario, type OfferContext, type RecentCall } from './scenario'

const IDS = Array.from({ length: 2000 }, (_, i) => 100000 + i * 449)
const all = IDS.map((id) => buildScenario(id, SAMPLE_CONTEXT))
const businessOf = (name: string) => SAMPLE_BUSINESSES.find((b) => b.name === name)!

test('every scenario passes every check', () => {
  for (const s of all) assert.deepEqual(validateScenario(s), [], `scenario ${s.id}`)
})

test('the same number always rebuilds the same owner', () => {
  for (const id of IDS.slice(0, 50)) assert.deepEqual(buildScenario(id, SAMPLE_CONTEXT), buildScenario(id, SAMPLE_CONTEXT))
})

test('every owner has 1–3 concerns, with at least one from their business', () => {
  for (const s of all) {
    assert.ok(s.concerns.length >= 1 && s.concerns.length <= 3)
    assert.ok(s.concerns.some((c) => c.source === 'business'))
  }
})

test('major concerns come only from the business, and any personality can have one', () => {
  for (const s of all) for (const c of s.concerns) if (c.major) assert.equal(c.source, 'business')
  for (const p of PERSONALITIES) {
    assert.ok(
      all.some((s) => s.personality.id === p.id && s.concerns.some((c) => c.major)),
      `${p.label} never got a major concern`,
    )
  }
})

test('skeptical or change-averse owners carry 2–3 concerns; others 1–3', () => {
  for (const s of all) {
    const cautious = s.traits.skepticism === 4 || s.traits.openness === 1
    assert.ok(s.concerns.length >= (cautious ? 2 : 1) && s.concerns.length <= 3, `scenario ${s.id}`)
  }
})

test('every personality can get a hard call: two majors or three concerns', () => {
  for (const p of PERSONALITIES) {
    const mine = all.filter((s) => s.personality.id === p.id)
    assert.ok(mine.some((s) => s.concerns.filter((c) => c.major).length === 2), `${p.label} never got two majors`)
    assert.ok(mine.some((s) => s.concerns.length === 3), `${p.label} never got three concerns`)
  }
})

test('analytical owners always want numbers', () => {
  for (const s of all.filter((x) => x.personality.id === 'analytical')) {
    assert.equal(s.traits.numbers, 4)
    assert.ok(s.needs.some((n) => /numbers/i.test(n)))
  }
})

test('a fully booked owner never gets a "need more customers" problem or motivation', () => {
  for (const s of all.filter((x) => x.facts.some((f) => f.id === 'fully_booked'))) {
    const business = businessOf(s.owner.business)
    for (const p of s.problems) assert.notEqual(business.problems.find((q) => q.text === p)?.area, 'customers')
    assert.ok(!s.motivation.some((m) => /steady customers/i.test(m)))
  }
})

test('every concern type, owner, personality and situation shows up', () => {
  const types = new Set(all.flatMap((s) => s.concerns.map((c) => c.type)))
  for (const t of Object.keys(CONCERN_TYPES)) assert.ok(types.has(t as never), `${t} never appeared`)
  for (const o of OWNERS) assert.ok(all.some((s) => s.owner.name === o.name))
  for (const b of SAMPLE_BUSINESSES) assert.ok(all.some((s) => s.owner.business === b.name))
  for (const p of PERSONALITIES) {
    const share = all.filter((s) => s.personality.id === p.id).length / all.length
    assert.ok(share > 0.1 && share < 0.25, `${p.label} share ${share}`)
  }
  const setups = all.filter((s) => s.situation === 'has_setup').length / all.length
  assert.ok(setups > 0.4 && setups < 0.6)
})

test('every trait level has a sentence', () => {
  for (const t of TRAITS) for (const l of [1, 2, 3, 4] as const) assert.ok(TRAIT_SENTENCES[t][l])
})

test('a new call avoids the last owner, the last two personalities, and repeat concerns', () => {
  let n = 0
  const random = () => ((n = (n * 9301 + 49297) % 233280) / 233280)
  const recent: RecentCall[] = []
  for (let i = 0; i < 200; i++) {
    const s = pickScenario({ recent, offer: SAMPLE_CONTEXT, random })
    if (recent[0]) assert.notEqual(s.owner.name, recent[0].owner)
    if (recent[0]) assert.notEqual(s.owner.industry, recent[0].business)
    for (const r of recent.slice(0, 2)) assert.notEqual(s.personality.id, r.personality)
    const recentTypes = new Set(recent.slice(0, 3).flatMap((r) => r.concernTypes))
    assert.ok(s.concerns.filter((c) => recentTypes.has(c.type)).length <= 1)
    recent.unshift({ owner: s.owner.name, business: s.owner.industry, businessName: s.owner.business, personality: s.personality.id, concernTypes: s.concerns.map((c) => c.type) })
  }
})

test('every part of the business comes from the analysis', () => {
  for (const s of all) {
    const b = businessOf(s.owner.business)
    assert.equal(s.owner.industry, b.type)
    assert.equal(s.owner.detail, b.detail)
    assert.ok(b.scenes.includes(s.scene))
    const from = s.situation === 'has_setup' ? b.setups.map((x) => x.text) : b.gaps.map((x) => x.text)
    assert.ok(from.includes(s.setup.text), `scenario ${s.id}`)
    for (const p of s.problems) assert.ok(b.problems.some((q) => q.text === p))
  }
})

test("a business the facts don't fit never gets them", () => {
  for (const s of all) {
    const b = businessOf(s.owner.business)
    if (!b.setups.some((x) => x.outside)) assert.ok(!s.facts.some((f) => f.id === 'trusted_vendor'), `scenario ${s.id}`)
    if (!b.problems.some((p) => p.area !== 'customers')) assert.ok(!s.facts.some((f) => f.id === 'fully_booked'), `scenario ${s.id}`)
  }
})

test('product concerns are minor and come only from businesses that have them', () => {
  for (const s of all) {
    const b = businessOf(s.owner.business)
    for (const c of s.concerns) {
      if (c.type === 'fit') assert.ok(!c.major && b.fit === 'partial' && b.fitConcern, `scenario ${s.id}`)
      if (c.type === 'compatibility') assert.ok(!c.major && b.toolsConcern, `scenario ${s.id}`)
    }
  }
})

test('product reasons explain a concern the owner already has', () => {
  for (const s of all) for (const c of s.concerns) {
    const why = businessOf(s.owner.business).reasons?.[c.type]
    if (why) assert.ok(c.reason.includes(why), `scenario ${s.id}`)
  }
})

test('a rep who sells to one kind of business gets a different business each call', () => {
  // Six dental practices: same kind, different businesses.
  const dentists: OfferContext = {
    businesses: SAMPLE_BUSINESSES.map((b, i) => ({ ...b, type: 'dental practice', name: `Practice ${i + 1}` })),
  }
  let n = 7
  const random = () => ((n = (n * 9301 + 49297) % 233280) / 233280)
  const recent: RecentCall[] = []
  for (let i = 0; i < 100; i++) {
    const s = pickScenario({ recent, offer: dentists, random })
    assert.equal(s.owner.industry, 'dental practice')
    if (recent[0]) assert.notEqual(s.owner.business, recent[0].businessName)
    recent.unshift({ owner: s.owner.name, business: s.owner.industry, businessName: s.owner.business, personality: s.personality.id, concernTypes: [] })
  }
  // With only one business, it simply repeats.
  const one: OfferContext = { businesses: SAMPLE_BUSINESSES.slice(0, 1) }
  const s = pickScenario({ recent, offer: one, random })
  assert.equal(s.owner.business, 'Summit Plumbing')
})

test('Old School always believes what they have works', () => {
  for (const s of all.filter((x) => x.personality.id === 'old_school')) {
    const c = s.concerns.find((x) => /always done (it this way|things)/.test(x.reason))
    assert.ok(c, `scenario ${s.id}`)
    assert.ok(c!.major || (c!.type === 'current' && c!.angle === 'happy_enough') || (c!.type === 'need' && ['fine', 'word_of_mouth'].includes(c!.angle)))
  }
  // With nothing in place, it's word of mouth, not "what you have works".
  for (const s of all.filter((x) => x.personality.id === 'old_school' && x.situation === 'no_solution')) {
    assert.ok(s.concerns.some((c) => /word of mouth/.test(c.reason)), `scenario ${s.id}`)
  }
})

test('a burned-before concern is always major, never watered down', () => {
  for (const s of all) for (const c of s.concerns) if (c.angle === 'burned') assert.ok(c.major, `scenario ${s.id}`)
})

test('an owner who trusts a long-time vendor has an outside setup and leads with loyalty', () => {
  for (const s of all.filter((x) => x.facts.some((f) => f.id === 'trusted_vendor'))) {
    assert.ok(businessOf(s.owner.business).setups.find((f) => f.text === s.setup.text)?.outside, `scenario ${s.id}`)
    assert.ok(s.concerns.some((c) => c.type === 'current'), `scenario ${s.id}`)
  }
})

test('every owner needs at least two things before saying yes', () => {
  for (const s of all) assert.ok(s.needs.length >= 2)
})

test('an expanding owner never says they are too busy for more customers', () => {
  for (const s of all.filter((x) => x.facts.some((f) => f.id === 'expanding'))) {
    assert.ok(!s.concerns.some((c) => c.angle === 'too_full'), `scenario ${s.id}`)
  }
})
