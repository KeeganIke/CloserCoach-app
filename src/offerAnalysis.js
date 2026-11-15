// The offer analysis picks businesses that match who the rep sells to and
// tailors each one's setup, problems and concerns to what they sell. The server
// returns it sealed (unreadable here, so it can't spoil a call), and this
// browser keeps it until the offer changes.

import { normalizeOffer, offerText } from './offer.js'

const KEY = 'closer-coach-offer-analysis'
const PICKS_KEY = 'closer-coach-business-picks' // businesses picked before the offer was saved

// The saved analysis for this exact offer: { sealed, ready, missing } (ready and
// missing list kinds of business), or null if there isn't one yet.
export function loadAnalysis(offer) {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (!saved || saved.offer !== offerText(offer) || typeof saved.sealed !== 'string') return null
    return { sealed: saved.sealed, ready: saved.ready || [], missing: saved.missing || [] }
  } catch {
    return null
  }
}

const audienceOf = (offer) => normalizeOffer(offer).audience.toLowerCase()

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null')
  } catch {
    return null
  }
}

// An earlier result the server can build on: the analysis for this exact offer,
// else anything already picked for the same audience (the server reuses those
// businesses and only describes them). The server checks it all again itself.
function reusableFor(offer) {
  const exact = loadAnalysis(offer)
  if (exact) return exact.sealed
  const audience = audienceOf(offer)
  for (const saved of [readJson(KEY), readJson(PICKS_KEY)]) {
    if (saved?.audience === audience && typeof saved.sealed === 'string') return saved.sealed
  }
  return undefined
}

function storeAnalysis(offer, result) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ offer: offerText(offer), audience: audienceOf(offer), sealed: result.sealed, ready: result.ready, missing: result.missing }),
    )
  } catch {
    // Not remembering just means it runs again next time.
  }
}

export function clearAnalysis() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Nothing to clear.
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

let picking = null // { audience, promise } while businesses are being picked ahead

// Starts picking businesses as soon as the rep has filled in what they sell and
// who to, so saving only waits for the details. Quietly does nothing if it can't.
export function pickAhead({ reportUrl, accessCode, offer }) {
  const n = normalizeOffer(offer)
  const audience = n.audience.toLowerCase()
  if (!reportUrl || !accessCode || !n.product || !n.audience) return
  if (picking?.audience === audience || reusableFor(n)) return
  const promise = fetch(reportUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'pick-businesses', accessCode, offer: { product: n.product, audience: n.audience } }),
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (typeof data?.picks !== 'string') return
      try {
        localStorage.setItem(PICKS_KEY, JSON.stringify({ audience, sealed: data.picks }))
      } catch {
        // Then the save just picks them itself.
      }
    })
    .catch(() => {})
    .finally(() => {
      if (picking?.promise === promise) picking = null
    })
  picking = { audience, promise }
}

// One request. `previous` is an earlier sealed result: the server keeps its
// businesses if the audience is the same and its finished ones if the offer is.
async function requestAnalysis({ reportUrl, accessCode, offer, previous }) {
  const res = await fetch(reportUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'analyze-offer', accessCode, offer: normalizeOffer(offer), previous }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || typeof data.analysis !== 'string') {
    const err = new Error(data.error || "Couldn't get your businesses ready")
    err.detail = data.detail || `HTTP ${res.status}`
    err.status = res.status
    throw err
  }
  const list = (v) => (Array.isArray(v) ? v : [])
  return { sealed: data.analysis, ready: list(data.ready), missing: list(data.missing), detail: data.detail || '' }
}

// Gets every business ready, retrying on its own until all are done or it runs
// out of tries. Returns { sealed, ready, missing, detail }; throws only when no
// business could be made ready at all.
export async function analyzeOffer({ reportUrl, accessCode, offer, rounds = 3 }) {
  if (!reportUrl) throw new Error("The backend isn't deployed yet.")
  const started = performance.now()
  // Businesses still being picked ahead: wait for them rather than pick twice.
  if (picking?.audience === audienceOf(offer)) await picking.promise
  let best = loadAnalysis(offer)
  let previous = reusableFor(offer)
  let lastError = null
  for (let round = 0; round < rounds; round++) {
    if (round) await wait(2000 * round)
    try {
      const result = await requestAnalysis({ reportUrl, accessCode, offer, previous })
      best = result
      previous = result.sealed
      storeAnalysis(offer, result)
      if (!result.missing.length) return { ...result, ms: performance.now() - started }
      lastError = Object.assign(new Error('Some businesses failed'), { detail: result.detail })
    } catch (err) {
      lastError = err
      if (err.status === 401) break // wrong access code: retrying won't help
    }
  }
  if (best) return { ...best, detail: lastError?.detail || '' }
  throw lastError
}

// Sealed summaries of the last few calls (newest first), sent with each new call
// so the server doesn't repeat the owner, business, personality or concerns.
const RECENT_KEY = 'closer-coach-recent-calls'

export function loadRecent() {
  const list = readJson(RECENT_KEY)
  return Array.isArray(list) ? list.filter((x) => typeof x === 'string').slice(0, 3) : []
}

export function rememberCall(sealed) {
  if (typeof sealed !== 'string') return
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([sealed, ...loadRecent()].slice(0, 3)))
  } catch {
    // Then the next call just can't avoid repeats.
  }
}
