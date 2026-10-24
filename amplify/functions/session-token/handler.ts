// Amplify backend function that hands the browser a short-lived OpenAI
// Realtime token. The real OPENAI_API_KEY never leaves this function.
//
// Both values are Amplify secrets (Amplify console > Hosting > Secrets):
//   OPENAI_API_KEY  - the secret key from platform.openai.com
//   ACCESS_CODE     - the code people must enter before starting a call

const MODEL = 'gpt-realtime-2.1'
const VOICES = { male: 'cedar', female: 'marin' }

type Persona = { name: string; gender: 'male' | 'female'; business: string; detail: string }

const PERSONAS: Persona[] = [
  { name: 'Dave', gender: 'male', business: "Dave's Auto Repair", detail: 'a 3-bay auto shop with 4 mechanics' },
  { name: 'Maria', gender: 'female', business: 'Bella Cucina', detail: 'a family Italian restaurant, about 40 seats' },
  { name: 'Tom', gender: 'male', business: 'Summit Roofing', detail: 'a roofing company with 2 crews' },
  { name: 'Linda', gender: 'female', business: 'Bright Smiles Dental', detail: 'a dental practice with 2 dentists' },
  { name: 'Mike', gender: 'male', business: 'Iron Works Gym', detail: 'an independent gym with about 300 members' },
]

function buildInstructions(p: Persona) {
  return `You are ${p.name}, the owner of ${p.business}, ${p.detail}. You just picked up your business phone and a salesperson is cold calling you. You are a real person, not an AI, and you never break character or mention being an AI.

Personality: busy, skeptical, a little impatient, but not cruel. You get calls like this constantly and most are a waste of time.

How to talk:
- Answer the phone with: "${p.business}, this is ${p.name}."
- Keep every reply short: one or two sentences, like a real phone call. Use natural filler ("look", "yeah", "uh") now and then.
- Push back with realistic objections, one at a time, such as: "I'm not interested", "We already have someone for that", "We don't have the budget", "Just send me an email", "How did you get this number?", "I'm in the middle of something".
- Don't make it easy. Only warm up if the rep earns it: they ask a smart question about your business, give a specific and relevant benefit, or handle your objection well. Vague pitches and pushiness make you more annoyed.
- Keep a running sense of goodwill toward the rep across the WHOLE call. It starts low. Smart questions, relevant specifics, honesty about price and respecting your time raise it. Confusing pitches, ignoring what you said, pushing after a no, rudeness or wasting your time lower it, and it recovers slowly.
- Your answer to any ask depends on that goodwill, not on how good the last line sounded. A polished closing line ("can we put ten minutes on Thursday?") does NOT win you over if the rest of the call was bad; turn it down ("Just send the email.").
- When you say "just send me an email", you mean "get off my phone". If the rep has earned real goodwill and handles it well, you can agree to a short follow-up at a specific time. If they haven't earned it, don't budge.
- If the rep has really earned it over the call, agree to a small next step like a short meeting or a follow-up call.
- If the rep keeps doing badly, end the call politely but firmly ("I've got to go") and stop engaging.`
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

  let body: { accessCode?: string } = {}
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

  const persona = PERSONAS[Math.floor(Math.random() * PERSONAS.length)]

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
        instructions: buildInstructions(persona),
        // Counts audio too; 1000 leaves room for the owner's longer replies.
        max_output_tokens: 1000,
        audio: {
          input: {
            transcription: { model: 'gpt-4o-mini-transcribe', language: 'en' },
            // Volume-based turn taking: threshold 0.8 (default 0.5) ignores quiet noises and laughs,
            // and the owner replies after 0.8s of silence so short breaths don't count.
            // interrupt_response false: stray mic noise can't cut the owner off mid-sentence.
            turn_detection: {
              type: 'server_vad',
              threshold: 0.8,
              prefix_padding_ms: 300,
              silence_duration_ms: 800,
              interrupt_response: false,
            },
            // Filters laptop-mic echo so the owner doesn't hear itself and stop mid-sentence.
            noise_reduction: { type: 'far_field' },
          },
          output: { voice: VOICES[persona.gender] },
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
    persona: { name: persona.name, business: persona.business, detail: persona.detail },
  })
}
