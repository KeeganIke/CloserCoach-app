// The offer analysis tailors each owner's setup, problems and concerns to what
// the rep sells. The server returns it sealed (unreadable here, so it can't spoil
// a call), and this browser keeps it until the offer text changes.

const KEY = 'closer-coach-offer-analysis'

// The sealed analysis for this exact offer, or null if there isn't one yet.
export function loadAnalysis(offer) {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null')
    return saved && saved.offer === offer.trim() && typeof saved.sealed === 'string' ? saved.sealed : null
  } catch {
    return null
  }
}

function storeAnalysis(offer, sealed) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ offer: offer.trim(), sealed }))
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

// Asks the coach-report function to analyze the offer. Returns the sealed text.
export async function analyzeOffer({ reportUrl, accessCode, offer }) {
  if (!reportUrl) throw new Error("The backend isn't deployed yet.")
  const res = await fetch(reportUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'analyze-offer', accessCode, offer }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || typeof data.analysis !== 'string') throw new Error(data.error || "Couldn't get your owners ready")
  storeAnalysis(offer, data.analysis)
  return data.analysis
}
