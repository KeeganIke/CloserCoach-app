// Amplify backend function that hands the browser a short-lived OpenAI
// Realtime token. The real OPENAI_API_KEY never leaves this function.
//
// Both values are Amplify secrets (Amplify console > Hosting > Secrets):
//   OPENAI_API_KEY  - the secret key from platform.openai.com
//   ACCESS_CODE     - the code people must enter before starting a call

import { seal, sealHidden, unseal, type Hidden } from '../shared/hidden'
import { normalizeOffer, offerText, openOfferContext } from '../shared/offer'
import { PERSONALITIES } from './owners'
import { buildOwnerInstructions } from './ownerPrompt'
import { pickScenario, type RecentCall, type Scenario } from './scenario'

const MODEL = 'gpt-realtime-2.1'
// Voices are by gender for now; each owner gets their own after the GPT-Live test.
const VOICES = { male: 'cedar', female: 'marin' }

// The browser keeps a sealed summary of each recent call so the next owner
// doesn't repeat them, without the rep being able to read the personality or
// concerns mid-call. Newest first; only the last 3 matter.
const MAX_RECENT = 3

export function sealRecent(s: Scenario, secret: string) {
  const r: RecentCall = {
    owner: s.owner.name,
    business: s.owner.industry,
    businessName: s.owner.business,
    personality: s.personality.id,
    concernTypes: s.concerns.map((c) => c.type),
  }
  return seal(r, secret, 'recent')
}

export function openRecent(list: unknown, secret: string): RecentCall[] {
  if (!Array.isArray(list)) return []
  return list
    .slice(0, MAX_RECENT)
    .map((x) => unseal(x, secret, 'recent') as RecentCall | null)
    .filter((r): r is RecentCall => Boolean(r && typeof r.owner === 'string' && PERSONALITIES.some((p) => p.id === r.personality)))
}

// What coach-report reads for the grade and the after-call reveal, in the shape it
// uses today. Step 4 moves the grader to the full scenario.
export function toHidden(s: Scenario): Hidden {
  return {
    situation: s.situation === 'has_setup' ? 'has_provider' : 'unaware_need',
    problems: s.problems,
    providerWeakness: s.situation === 'has_setup' ? `${s.setup.text}, but ${s.setup.weakness}` : '',
    concerns: s.concerns.map((c) => `${c.typeLabel}: ${c.angleLabel}${c.major ? ' (major)' : ''}. ${c.reason}`),
    personality: [s.personality.label],
  }
}

function json(statusCode: number, body: object) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

type FunctionUrlEvent = {
  requestContext?: { http?: { method?: string } }
  body?: string
  isBase64Encoded?: boolean
}

export const handler = async (event: FunctionUrlEvent) => {
  if (event.requestContext?.http?.method !== 'POST') {
    return json(405, { error: 'Method not allowed' })
  }

  let body: { accessCode?: string; offer?: unknown; analysis?: unknown; recent?: unknown } = {}
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : event.body
    body = JSON.parse(raw || '{}')
  } catch {
    return json(400, { error: 'Bad request' })
  }

  // Case-insensitive so autocorrected links ("Closer2026" vs "closer2026") still work.
  const normalize = (code: unknown) => String(code ?? '').trim().toLowerCase()
  if (!process.env.ACCESS_CODE || normalize(body.accessCode) !== normalize(process.env.ACCESS_CODE)) {
    return json(401, { error: 'Wrong access code' })
  }

  const secret = process.env.OPENAI_API_KEY || ''
  const offer = normalizeOffer(body.offer)
  if (!offer) {
    return json(400, { error: 'Fill in what you sell, who you sell to, and the price before you start a call.' })
  }
  // Every owner runs one of the businesses analyzed for this exact offer.
  const context = openOfferContext(body.analysis, offer, secret)
  if (!context) {
    return json(409, { error: "Your businesses aren't ready for this offer yet. Save your offer, wait for them, and try again." })
  }
  const scenario = pickScenario({ recent: openRecent(body.recent, secret), offer: context })
  console.log(
    'Call setup',
    scenario.id,
    scenario.owner.name,
    scenario.owner.industry,
    scenario.personality.id,
    scenario.concerns.map((c) => `${c.type}${c.major ? '*' : ''}`).join(','),
  )

  const res = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      // The token only needs to live long enough for the browser to connect.
      expires_after: { anchor: 'created_at', seconds: 60 },
      session: {
        type: 'realtime',
        model: MODEL,
        instructions: buildOwnerInstructions(scenario, offerText(offer)),
        // Counts audio too; 1000 leaves room for the owner's longer replies.
        max_output_tokens: 1000,
        audio: {
          input: {
            transcription: { model: 'gpt-4o-mini-transcribe', language: 'en' },
            // Volume-based turn taking: threshold 0.8 (default 0.5) ignores quiet noises and laughs,
            // and the owner replies after 1.2s of silence so a mid-sentence pause doesn't end the
            // rep's turn (0.8s cut reps off). semantic_vad was tried: it waited up to ~8s and let
            // small noises start turns ("Still there?").
            // interrupt_response false: stray mic noise can't cut the owner off mid-sentence.
            turn_detection: {
              type: 'server_vad',
              threshold: 0.8,
              prefix_padding_ms: 300,
              silence_duration_ms: 1200,
              interrupt_response: false,
            },
            // Filters laptop-mic echo so the owner doesn't hear itself and stop mid-sentence.
            noise_reduction: { type: 'far_field' },
          },
          output: { voice: VOICES[scenario.owner.gender] },
        },
      },
    }),
  })

  if (!res.ok) {
    console.error('OpenAI error', res.status, await res.text())
    return json(502, { error: 'Could not start the call' })
  }

  const data = await res.json()
  return json(200, {
    token: data.value,
    persona: { name: scenario.owner.name, business: scenario.owner.business, detail: scenario.owner.detail, industry: scenario.owner.industry },
    // Sealed so the rep can't read it mid-call; coach-report opens it for the reveal.
    hidden: sealHidden(toHidden(scenario), secret),
    // Sealed summary the browser sends back next time, so calls don't repeat.
    recent: sealRecent(scenario, secret),
  })
}
