import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openHidden, sealHidden, type Hidden } from './hidden'
import { PERSONAS, pickHidden } from '../session-token/handler'

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

test('each call gets two problems from different areas, three distinct concerns and four traits', () => {
  for (const persona of PERSONAS) {
    for (let i = 0; i < 200; i++) {
      const { hidden } = pickHidden(persona)
      const areas = hidden.problems.map((text) => persona.problems.find((p) => p.text === text)!.area)
      assert.equal(hidden.problems.length, 2)
      assert.notEqual(areas[0], areas[1])
      assert.equal(new Set(hidden.concerns).size, 3)
      assert.equal(hidden.concerns.filter((c) => persona.concerns.includes(c)).length, 1)
      assert.equal(hidden.personality.length, 4)
      assert.equal(hidden.providerWeakness !== '', hidden.situation === 'has_provider')
    }
  }
})

test('both situations come up, roughly 65/35', () => {
  let provider = 0
  for (let i = 0; i < 4000; i++) if (pickHidden(PERSONAS[0]).hidden.situation === 'has_provider') provider++
  assert.ok(provider > 1200 && provider < 1600, `has_provider came up ${provider} of 4000`)
})
