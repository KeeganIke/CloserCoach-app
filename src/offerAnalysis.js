// The offer analysis tailors each owner's setup, problems and concerns to what
// the rep sells. The server returns it sealed (unreadable here, so it can't spoil
// a call), and this browser keeps it until the offer text changes.

const KEY = 'closer-coach-offer-analysis'

// The saved analysis for this exact offer: { sealed, missing } (missing lists
// owners still on the general lists), or null if there isn't one yet.
export function loadAnalysis(offer) {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (!saved || saved.offer !== offer.trim() || typeof saved.sealed !== 'string') return null
    return { sealed: saved.sealed, missing: Array.isArray(saved.missing) ? saved.missing : [] }
  } catch {
    return null
  }
}

function storeAnalysis(offer, sealed, missing) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ offer: offer.trim(), sealed, missing }))
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

// One request. `previous` is an earlier sealed result for the same offer, so the
// server only reruns the owners that failed.
async function requestAnalysis({ reportUrl, accessCode, offer, previous }) {
  const res = await fetch(reportUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'analyze-offer', accessCode, offer, previous }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || typeof data.analysis !== 'string') {
    const err = new Error(data.error || "Couldn't get your owners ready")
    err.detail = data.detail || `HTTP ${res.status}`
    err.status = res.status
    throw err
  }
  return { sealed: data.analysis, missing: Array.isArray(data.missing) ? data.missing : [], detail: data.detail || '' }
}

// Tailors every owner to the offer, retrying on its own until all five are done
// or it runs out of tries. Returns { sealed, missing, detail }; throws only when
// no owner could be tailored at all.
export async function analyzeOffer({ reportUrl, accessCode, offer, rounds = 3 }) {
  if (!reportUrl) throw new Error("The backend isn't deployed yet.")
  let best = loadAnalysis(offer)
  let lastError = null
  for (let round = 0; round < rounds; round++) {
    if (round) await wait(2000 * round)
    try {
      const result = await requestAnalysis({ reportUrl, accessCode, offer, previous: best?.sealed })
      best = result
      storeAnalysis(offer, result.sealed, result.missing)
      if (!result.missing.length) return result
      lastError = Object.assign(new Error('Some owners failed'), { detail: result.detail })
    } catch (err) {
      lastError = err
      if (err.status === 401) break // wrong access code: retrying won't help
    }
  }
  if (best) return { ...best, detail: lastError?.detail || '' }
  throw lastError
}
