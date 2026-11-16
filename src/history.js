// Graded calls saved in this browser so the Progress page can show improvement.
// Each entry keeps the full report and transcript so a past call can be reopened.
// Browser storage only for now: it stays on this device and can come back empty,
// so every read and write is wrapped and the app works without it.

const HISTORY_KEY = 'closer-coach-history'
const MAX_CALLS = 100

export function loadHistory() {
  try {
    const calls = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
    return Array.isArray(calls) ? calls.filter((c) => c?.id && c.report) : []
  } catch {
    return []
  }
}

function write(calls) {
  if (!calls.length) return clearHistory()
  // Oldest calls go first if the browser runs out of room.
  for (let keep = calls.length; keep > 0; keep = Math.floor(keep * 0.8)) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(calls.slice(0, keep)))
      return calls.slice(0, keep)
    } catch {
      // Too big; try again with fewer calls.
    }
  }
  return calls
}

// Made-up calls loaded from "Show sample scores" have ids starting with "sample-".
export const isSample = (call) => String(call?.id).startsWith('sample-')

export function removeSamples() {
  return write(loadHistory().filter((c) => !isSample(c)))
}

// Saves a graded call, newest first. Returns the updated list. Sample calls are
// cleared at the same time, so made-up scores never mix with real ones.
export function saveCall({ persona, offer, report, lines }) {
  const call = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    date: new Date().toISOString(),
    persona: { name: persona?.name, business: persona?.business, detail: persona?.detail },
    offer,
    report,
    lines: lines.map(({ role, text }) => ({ role, text })),
  }
  return write([call, ...loadHistory().filter((c) => !isSample(c))].slice(0, MAX_CALLS))
}

export function deleteCall(id) {
  return write(loadHistory().filter((c) => c.id !== id))
}

export function clearHistory() {
  try {
    localStorage.removeItem(HISTORY_KEY)
  } catch {
    // Nothing saved to remove.
  }
  return []
}
