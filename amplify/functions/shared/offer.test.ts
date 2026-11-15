import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONCERN_TYPES, OWNERS } from '../session-token/owners'
import { SCHEMA, openOfferContext, sealOfferContext, toOfferContext, type OwnerOfferContext } from './offer'

const REASON_TYPES = Object.keys(CONCERN_TYPES).filter((t) => t !== 'fit' && t !== 'compatibility')

// A well-formed model answer for every owner.
function answer(overrides: Record<string, unknown> = {}): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    OWNERS.map((o) => [
      o.name,
      {
      fit: 'strong',
      setups: [
        { text: 'An agency runs your ads.', weakness: 'You never see what you get for it.', outside: true },
        { text: 'you post on Facebook yourself', weakness: 'you stop whenever it gets busy', outside: false },
        { text: 'your cousin handles it', weakness: 'it never gets updated', outside: false },
      ],
      gaps: [
        { text: 'you rely on word of mouth', gap: 'new people in town never hear about you' },
        { text: 'you hand out flyers sometimes', gap: "you can't tell if they bring anyone in" },
      ],
      problems: [
        { area: 'customers', text: 'new people in town pick the shop that shows up first' },
        { area: 'time', text: 'spends evenings on marketing instead of being home' },
        { area: 'money', text: 'pays for ads with no idea what they bring in' },
      ],
      reasons: Object.fromEntries(REASON_TYPES.map((t) => [t, `You have a ${t} reason for this product`])),
      fitConcern: { angle: 'none', reason: '' },
      toolsConcern: { angle: 'none', reason: '' },
      ...overrides,
      },
    ]),
  )
}

test('a good answer becomes a context for every owner, cleaned up for sentences', () => {
  const r = toOfferContext(answer())
  assert.ok(r.ok)
  for (const o of OWNERS) {
    const c: OwnerOfferContext = r.value[o.name]
    assert.equal(c.setups[0].text, 'an agency runs your ads') // lowercase, no period
    assert.equal(c.setups[0].weakness, 'you never see what you get for it')
    assert.equal(c.reasons?.price, 'You have a price reason for this product.') // sentences end with a period
    assert.equal(c.fitConcern, undefined)
    assert.equal(c.toolsConcern, undefined)
  }
})

test('a missing owner, or empty lists, are rejected', () => {
  const a = answer()
  delete a.Dave
  assert.equal(toOfferContext(a).ok, false)
  for (const bad of [{ setups: [] }, { gaps: [] }, { problems: [] }, { setups: [{ text: '', weakness: 'x', outside: true }, { text: 'y', weakness: 'z', outside: true }] }])
    assert.equal(toOfferContext(answer(bad)).ok, false, JSON.stringify(bad))
  for (const junk of [null, undefined, {}, 'text']) assert.equal(toOfferContext(junk as never).ok, false)
})

test('every owner needs an outside setup and a problem that is not about customers', () => {
  const noOutside = answer({ setups: [{ text: 'a', weakness: 'b', outside: false }, { text: 'c', weakness: 'd', outside: false }] })
  assert.equal(toOfferContext(noOutside).ok, false)
  const onlyCustomers = answer({ problems: [{ area: 'customers', text: 'a' }, { area: 'customers', text: 'b' }] })
  assert.equal(toOfferContext(onlyCustomers).ok, false)
})

test('a fit concern only comes with a partial fit, and only with a real angle', () => {
  const fitConcern = { angle: 'too_small', reason: 'This is built for bigger shops than yours' }
  const strong = toOfferContext(answer({ fitConcern }))
  assert.ok(strong.ok && !strong.value.Dave.fitConcern)
  const partial = toOfferContext(answer({ fit: 'partial', fitConcern }))
  assert.ok(partial.ok)
  assert.deepEqual(partial.value.Dave.fitConcern, { angle: 'too_small', reason: 'This is built for bigger shops than yours.' })
  const madeUp = toOfferContext(answer({ fit: 'partial', fitConcern: { angle: 'made_up', reason: 'x' } }))
  assert.ok(madeUp.ok && !madeUp.value.Dave.fitConcern)
  const tools = toOfferContext(answer({ toolsConcern: { angle: 'tools', reason: 'It has to work with your booking app.' } }))
  assert.ok(tools.ok && tools.value.Dave.toolsConcern?.angle === 'tools')
})

test('the output format asks for every reason type', () => {
  assert.deepEqual(SCHEMA.properties.reasons.required, REASON_TYPES)
})

test('a sealed analysis opens only for the same offer and key', () => {
  const r = toOfferContext(answer())
  assert.ok(r.ok)
  const sealed = sealOfferContext('  I build websites. $77/month.  ', r.value, 'key-1')
  assert.deepEqual(openOfferContext(sealed, 'I build websites. $77/month.', 'key-1'), r.value)
  assert.equal(openOfferContext(sealed, 'I build websites. $99/month.', 'key-1'), null)
  assert.equal(openOfferContext(sealed, 'I build websites. $77/month.', 'key-2'), null)
  assert.ok(!Buffer.from(sealed, 'base64url').toString().includes('agency'))
  for (const junk of [undefined, null, '', 'abc', 42]) assert.equal(openOfferContext(junk, 'x', 'key-1'), null)
})
