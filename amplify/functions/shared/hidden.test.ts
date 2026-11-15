import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openHidden, sealHidden, type Hidden } from './hidden'
import { openRecent, sealRecent, toHidden } from '../session-token/handler'
import { SAMPLE_CONTEXT } from '../session-token/sampleBusinesses'
import { buildScenario } from '../session-token/scenario'

const sample: Hidden = {
  situation: 'has_provider',
  problems: ['Tuesday and Wednesday nights are half empty', 'the delivery apps take a big cut of every order'],
  providerWeakness: 'looks and feels outdated',
  concerns: ['wants to know how the rep got this number', 'hates getting locked into contracts or long commitments'],
  personality: ['terse', 'blunt'],
}

test('a sealed secret opens with the same key', () => {
  const sealed = sealHidden(sample, 'key-1')
  assert.deepEqual(openHidden(sealed, 'key-1'), sample)
  // The sealed text doesn't give the secret away.
  assert.ok(!sealed.includes('Tuesday'))
  assert.ok(!Buffer.from(sealed, 'base64url').toString().includes('Tuesday'))
})

test('a wrong key, tampering or junk opens to null', () => {
  const sealed = sealHidden(sample, 'key-1')
  assert.equal(openHidden(sealed, 'key-2'), null)
  const bytes = Buffer.from(sealed, 'base64url')
  bytes[bytes.length - 1] ^= 1
  assert.equal(openHidden(bytes.toString('base64url'), 'key-1'), null)
  for (const junk of [undefined, null, '', 'abc', 42, {}]) assert.equal(openHidden(junk, 'key-1'), null)
  assert.equal(openHidden(sealed, ''), null)
})

test('a sealed object with the wrong shape opens to null', () => {
  const bad = sealHidden({ ...sample, situation: 'happy' } as unknown as Hidden, 'key-1')
  assert.equal(openHidden(bad, 'key-1'), null)
})

test("a call's scenario seals into the reveal shape the grader reads today", () => {
  for (let id = 100000; id < 100200; id++) {
    const s = buildScenario(id, SAMPLE_CONTEXT)
    const h = toHidden(s)
    assert.deepEqual(openHidden(sealHidden(h, 'key-1'), 'key-1'), h)
    assert.equal(h.providerWeakness !== '', h.situation === 'has_provider')
    assert.equal(h.concerns.length, s.concerns.length)
  }
})

test('recent calls round-trip sealed, and junk or tampering is dropped', () => {
  const s = buildScenario(100001, SAMPLE_CONTEXT)
  const sealed = sealRecent(s, 'key-1')
  assert.ok(!Buffer.from(sealed, 'base64url').toString().includes(s.personality.id))
  const [r] = openRecent([sealed], 'key-1')
  assert.deepEqual(r, { owner: s.owner.name, business: s.owner.industry, businessName: s.owner.business, personality: s.personality.id, concernTypes: s.concerns.map((c) => c.type) })
  assert.deepEqual(openRecent([sealed, 'junk', 42, null], 'key-2'), [])
  assert.equal(openRecent([sealed, sealed, sealed, sealed, sealed], 'key-1').length, 3)
  assert.deepEqual(openRecent('nope', 'key-1'), [])
})
