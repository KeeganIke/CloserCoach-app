import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CONCERN_TYPES } from '../session-token/owners'
import { SAMPLE_BUSINESSES } from '../session-token/sampleBusinesses'
import {
  SCHEMA,
  normalizeOffer,
  offerText,
  openOfferContext,
  reusable,
  sealAnalysis,
  sealPicks,
  normalizePickFields,
  toBusinessDetails,
  toIdentities,
  type BusinessDetails,
} from './offer'

const REASON_TYPES = Object.keys(CONCERN_TYPES).filter((t) => t !== 'fit' && t !== 'compatibility')
const OFFER = normalizeOffer({ product: 'Missed-call text-back', audience: 'Contractors', price: '$97/month', terms: '' })!

// A well-formed model answer for one business.
function details(overrides: Record<string, unknown> = {}) {
  return {
    fit: 'strong',
    setups: [
      { text: 'An answering service picks up.', weakness: 'They only take messages.', outside: true },
      { text: 'you call back yourself', weakness: 'it takes hours', outside: false },
    ],
    gaps: [{ text: 'you check voicemail at night', gap: 'most people never leave one' }],
    problems: [
      { area: 'customers', text: 'misses calls on jobs' },
      { area: 'time', text: 'spends evenings returning calls' },
    ],
    reasons: Object.fromEntries(REASON_TYPES.map((t) => [t, `You have a ${t} reason for this product`])),
    fitConcern: { angle: 'none', reason: '' },
    toolsConcern: { angle: 'none', reason: '' },
    ...overrides,
  }
}

test('the offer needs what you sell, who you sell to, and the price', () => {
  assert.equal(normalizeOffer({ product: 'x', audience: 'y' }), null)
  assert.equal(normalizeOffer({ product: 'x', price: '$1' }), null)
  assert.equal(normalizeOffer(null), null)
  const o = normalizeOffer({ product: '  Text-back\n for shops ', audience: 'Plumbers', price: '$97', terms: 'No contract', extra: 'x' })
  assert.deepEqual(o, { product: 'Text-back for shops', audience: 'Plumbers', price: '$97', terms: 'No contract' })
  assert.equal(offerText(o!), 'What I sell: Text-back for shops\nWho I sell to: Plumbers\nPrice: $97\nTerms: No contract')
  assert.ok(!offerText(OFFER).includes('Terms'))
})

test('good details are cleaned up for sentences', () => {
  const r = toBusinessDetails('plumbing company', details())
  assert.ok(r.ok)
  const d: BusinessDetails = r.value
  assert.equal(d.setups[0].text, 'an answering service picks up') // lowercase, no period
  assert.equal(d.setups[0].weakness, 'they only take messages')
  assert.equal(d.reasons?.price, 'You have a price reason for this product.') // sentences end with a period
  assert.equal(d.fitConcern, undefined)
  assert.equal(d.toolsConcern, undefined)
})

test('one bad item is dropped; nothing usable in a list fails the business', () => {
  const r = toBusinessDetails('x', details({ problems: [{ area: 'nonsense', text: 'a' }, { area: 'money', text: 'loses jobs' }] }))
  assert.ok(r.ok)
  assert.deepEqual(r.value.problems, [{ area: 'money', text: 'loses jobs' }])
  for (const bad of [{ setups: [] }, { gaps: [] }, { problems: [] }, { setups: [{ text: '', weakness: 'x', outside: true }] }])
    assert.equal(toBusinessDetails('x', details(bad)).ok, false, JSON.stringify(bad))
  for (const junk of [null, undefined, 'text']) assert.equal(toBusinessDetails('x', junk).ok, false)
})

test('a fit concern only comes with a partial fit, and only with a real angle', () => {
  const fitConcern = { angle: 'too_small', reason: 'This is built for bigger shops than yours' }
  const strong = toBusinessDetails('x', details({ fitConcern }))
  assert.ok(strong.ok && !strong.value.fitConcern)
  const partial = toBusinessDetails('x', details({ fit: 'partial', fitConcern }))
  assert.ok(partial.ok)
  assert.deepEqual(partial.value.fitConcern, { angle: 'too_small', reason: 'This is built for bigger shops than yours.' })
  const madeUp = toBusinessDetails('x', details({ fit: 'partial', fitConcern: { angle: 'made_up', reason: 'x' } }))
  assert.ok(madeUp.ok && !madeUp.value.fitConcern)
})

test('picked businesses: incomplete or repeated ones are dropped, and at least 3 are needed', () => {
  const b = (name: string, extra = {}) => ({ type: 'pizzeria', name, detail: 'a small pizzeria', background: 'Opened in 2015', scenes: ['Making dough.'], ...extra })
  const r = toIdentities({ businesses: [b('Slice House'), b('slice house'), b('Corner Pie'), b('No Scenes', { scenes: [] }), b('Tony Crust')] })
  assert.ok(r.ok)
  assert.deepEqual(r.value.map((x) => x.name), ['Slice House', 'Corner Pie', 'Tony Crust'])
  assert.equal(r.value[0].background, 'Opened in 2015.')
  assert.equal(r.value[0].scenes[0], 'making dough')
  assert.equal(toIdentities({ businesses: [b('A'), b('B')] }).ok, false)
  assert.equal(toIdentities(null).ok, false)
})

test('the details format asks for every reason type', () => {
  assert.deepEqual(SCHEMA.properties.reasons.required, REASON_TYPES)
})

test('a sealed analysis opens only for the same offer and key', () => {
  const sealed = sealAnalysis(OFFER, SAMPLE_BUSINESSES, SAMPLE_BUSINESSES, 'key-1')
  assert.deepEqual(openOfferContext(sealed, OFFER, 'key-1'), { businesses: SAMPLE_BUSINESSES })
  assert.equal(openOfferContext(sealed, { ...OFFER, price: '$99/month' }, 'key-1'), null)
  assert.equal(openOfferContext(sealed, OFFER, 'key-2'), null)
  assert.ok(!Buffer.from(sealed, 'base64url').toString().includes('Summit'))
  for (const junk of [undefined, null, '', 'abc', 42]) assert.equal(openOfferContext(junk, OFFER, 'key-1'), null)
})

test('a retry reuses the businesses for the same audience, and finished details only for the same offer', () => {
  const sealed = sealAnalysis(OFFER, SAMPLE_BUSINESSES, SAMPLE_BUSINESSES.slice(0, 4), 'key-1')
  const same = reusable(sealed, OFFER, 'key-1')
  assert.equal(same.picks?.length, 6)
  assert.equal(same.done.length, 4)
  const newPrice = reusable(sealed, { ...OFFER, price: '$120/month' }, 'key-1')
  assert.equal(newPrice.picks?.length, 6)
  assert.equal(newPrice.done.length, 0)
  const newAudience = reusable(sealed, { ...OFFER, audience: 'Restaurants' }, 'key-1')
  assert.equal(newAudience.picks, null)
  assert.equal(reusable(undefined, OFFER, 'key-1').picks, null)
})

test('businesses picked ahead are reused by the save, with nothing described yet', () => {
  assert.equal(normalizePickFields({ product: 'x' }), null)
  const fields = normalizePickFields({ product: 'Text-back', audience: ' contractors ', price: 'ignored' })!
  assert.deepEqual(fields, { product: 'Text-back', audience: 'contractors' })
  const sealed = sealPicks(fields, SAMPLE_BUSINESSES, 'key-1')
  const r = reusable(sealed, OFFER, 'key-1') // OFFER's audience is "Contractors"
  assert.equal(r.picks?.length, 6)
  assert.equal(r.done.length, 0)
  assert.equal(openOfferContext(sealed, OFFER, 'key-1'), null) // not usable for a call by itself
  assert.equal(reusable(sealed, { ...OFFER, audience: 'Dentists' }, 'key-1').picks, null)
})
