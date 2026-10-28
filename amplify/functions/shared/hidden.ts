// What the owner was secretly dealing with on a call. session-token seals it so the
// browser can carry it to coach-report without the rep being able to read it
// mid-call (it would otherwise show up in the browser's network tab).

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'

export type Hidden = {
  situation: 'unaware_need' | 'has_provider'
  problems: string[]
  providerWeakness: string // empty unless situation is has_provider
  concerns: string[]
  personality: string[]
}

// Both functions already hold the OpenAI key as a secret, so the sealing key is
// derived from it rather than adding another secret to manage.
function key(secret: string) {
  return createHash('sha256').update(`closer-coach-hidden:${secret}`).digest()
}

export function sealHidden(hidden: Hidden, secret: string) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(hidden), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64url')
}

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string')

// Returns null for anything missing, tampered with or malformed.
export function openHidden(sealed: unknown, secret: string): Hidden | null {
  if (typeof sealed !== 'string' || !sealed || !secret) return null
  try {
    const buf = Buffer.from(sealed, 'base64url')
    const decipher = createDecipheriv('aes-256-gcm', key(secret), buf.subarray(0, 12))
    decipher.setAuthTag(buf.subarray(12, 28))
    const text = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString('utf8')
    const h = JSON.parse(text)
    const ok =
      (h?.situation === 'unaware_need' || h?.situation === 'has_provider') &&
      isStrings(h.problems) &&
      typeof h.providerWeakness === 'string' &&
      isStrings(h.concerns) &&
      isStrings(h.personality)
    return ok ? h : null
  } catch {
    return null
  }
}
