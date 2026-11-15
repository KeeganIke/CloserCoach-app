// The rep's offer: what they sell, who they sell to, the price, and any terms.
// Practice owners run businesses that match who they sell to.

const KEY = 'closer-coach-offer-fields'
const OLD_KEY = 'closer-coach-offer' // the single text box from before

export const OFFER_LIMITS = { product: 300, audience: 120, price: 80, terms: 200 }
export const EMPTY_OFFER = { product: '', audience: '', price: '', terms: '' }

const oneLine = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '')

// Same cleanup as the server (amplify/functions/shared/offer.ts).
export function normalizeOffer(o) {
  return Object.fromEntries(Object.keys(OFFER_LIMITS).map((k) => [k, oneLine(o?.[k]).slice(0, OFFER_LIMITS[k])]))
}

export const isComplete = (o) => {
  const n = normalizeOffer(o)
  return Boolean(n.product && n.audience && n.price)
}

export const sameOffer = (a, b) => JSON.stringify(normalizeOffer(a)) === JSON.stringify(normalizeOffer(b))

// The offer as one text, for the grader and call history. Same format as the server.
export function offerText(o) {
  const n = normalizeOffer(o)
  if (!isComplete(n)) return ''
  return [`What I sell: ${n.product}`, `Who I sell to: ${n.audience}`, `Price: ${n.price}`, ...(n.terms ? [`Terms: ${n.terms}`] : [])].join('\n')
}

// The saved offer. An old single-text offer moves into "What you sell", and the
// rep fills in the rest.
export function loadOffer() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (saved && typeof saved === 'object') return { ...EMPTY_OFFER, ...normalizeOffer(saved) }
    const old = localStorage.getItem(OLD_KEY)
    if (old) return { ...EMPTY_OFFER, product: oneLine(old).slice(0, OFFER_LIMITS.product) }
  } catch {
    // No storage: start empty.
  }
  return { ...EMPTY_OFFER }
}

export function storeOffer(o) {
  try {
    localStorage.setItem(KEY, JSON.stringify(normalizeOffer(o)))
  } catch {
    // Not remembering is fine.
  }
}
