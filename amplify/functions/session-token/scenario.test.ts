import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONCERN_TYPES, FALLBACK_SETUPS, OWNERS, PERSONALITIES, TRAIT_SENTENCES, TRAITS } from './owners'
import { buildScenario, pickScenario, validateScenario, type OfferContext, type RecentCall } from './scenario'

const IDS = Array.from({ length: 2000 }, (_, i) => 100000 + i * 449)
const all = IDS.map((id) => buildScenario(id))

test('every scenario passes every check', () => {
  for (const s of all) assert.deepEqual(validateScenario(s), [], `scenario ${s.id}`)
})

test('the same number always rebuilds the same owner', () => {
  for (const id of IDS.slice(0, 50)) assert.deepEqual(buildScenario(id), buildScenario(id))
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

test('skeptical or change-averse owners carry 2–3 concerns; others 1–2', () => {
  for (const s of all) {
    const cautious = s.traits.skepticism === 4 || s.traits.openness === 1
    if (cautious) assert.ok(s.concerns.length >= 2, `scenario ${s.id}`)
    else assert.ok(s.concerns.length <= 2, `scenario ${s.id}`)
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
    const owner = OWNERS.find((o) => o.name === s.owner.name)!
    for (const p of s.problems) assert.notEqual(owner.problems.find((q) => q.text === p)?.area, 'customers')
    assert.ok(!s.motivation.some((m) => /steady customers/i.test(m)))
  }
})

test('every concern type, owner, personality and situation shows up', () => {
  const types = new Set(all.flatMap((s) => s.concerns.map((c) => c.type)))
  // Types tied only to the offer (compatibility, fit) arrive in step 2.
  for (const t of Object.keys(CONCERN_TYPES)) {
    if (t === 'compatibility' || t === 'fit') continue
    assert.ok(types.has(t as never), `${t} never appeared`)
  }
  for (const o of OWNERS) assert.ok(all.some((s) => s.owner.name === o.name))
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
    const s = pickScenario({ recent, random })
    if (recent[0]) assert.notEqual(s.owner.name, recent[0].owner)
    for (const r of recent.slice(0, 2)) assert.notEqual(s.personality.id, r.personality)
    const recentTypes = new Set(recent.slice(0, 3).flatMap((r) => r.concernTypes))
    assert.ok(s.concerns.filter((c) => recentTypes.has(c.type)).length <= 1)
    recent.unshift({ owner: s.owner.name, personality: s.personality.id, concernTypes: s.concerns.map((c) => c.type) })
  }
})

test('offer analysis supplies the setup and problems when it exists', () => {
  const offer: OfferContext = Object.fromEntries(
    OWNERS.map((o) => [
      o.name,
      {
        setups: [{ text: 'TEST setup', weakness: 'TEST weakness', outside: true }],
        gaps: [{ text: 'TEST gap text', gap: 'TEST gap' }],
        problems: [
          { area: 'time', text: 'TEST time problem' },
          { area: 'customers', text: 'TEST customers problem' },
        ],
      },
    ]),
  )
  for (const id of IDS.slice(0, 200)) {
    const s = buildScenario(id, offer)
    assert.ok(s.setup.text.startsWith('TEST'))
    assert.ok(s.problems.every((p) => p.startsWith('TEST')))
    assert.deepEqual(validateScenario(s), [])
  }
})

test('Old School always believes what they have works', () => {
  for (const s of all.filter((x) => x.personality.id === 'old_school')) {
    const c = s.concerns.find((x) => /always done it this way/.test(x.reason))
    assert.ok(c, `scenario ${s.id}`)
    assert.ok(c!.major || (c!.type === 'current' && c!.angle === 'happy_enough') || (c!.type === 'need' && ['fine', 'word_of_mouth'].includes(c!.angle)))
  }
})

test('a burned-before concern is always major, never watered down', () => {
  for (const s of all) for (const c of s.concerns) if (c.angle === 'burned') assert.ok(c.major, `scenario ${s.id}`)
})

test('an owner who trusts a long-time vendor has an outside setup and leads with loyalty', () => {
  for (const s of all.filter((x) => x.facts.some((f) => f.id === 'trusted_vendor'))) {
    assert.ok(FALLBACK_SETUPS.find((f) => f.text === s.setup.text)?.outside, `scenario ${s.id}`)
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
