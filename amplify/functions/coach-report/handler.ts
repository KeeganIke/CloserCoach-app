// Amplify backend function that grades a finished practice call and returns a
// coaching report. Uses the same Amplify secrets as session-token.

const MODEL = 'gpt-6.1-sol'
const MAX_LINES = 200
const MAX_CHARS = 30000

type Line = { role: 'user' | 'assistant'; text: string }
type Persona = { name?: string; business?: string; detail?: string }

const INSTRUCTIONS = `You are an experienced sales coach reviewing a practice cold call. A sales rep called a small business owner, who was played by an AI. Grade the rep only, never the owner.

Be direct, specific and honest, like a good coach: give credit where it was earned and point out mistakes plainly. Quote the rep's actual words when you discuss what they said. Every "betterLine" must be the exact words the rep could have said instead: natural, spoken, one or two sentences, fitted to this owner and business.

List each distinct objection the owner raised, in the order raised. Merge repeats of the same objection into one entry.

Reward: asking permission up front, being brief, discovery questions about the owner's business, adapting to what the owner says, specific and relevant value, giving a straight answer about price, accepting a condition the owner offers and locking in a specific time.
Penalize: repeating an ask after a clear no, ignoring information the owner gave, vague or exaggerated claims ("you're losing money as we speak"), dodging questions, rambling.

Scoring guide for overallScore (0-100):
- 90-100: booked a specific next step (a set day/time), handled objections cleanly and concisely.
- 70-89: earned a conditional next step, or a near miss with solid technique.
- 50-69: some good moments, but pushy, vague, or missed clear openings.
- Below 50: no discovery, pushy or rambling, owner shut it down.
Skill scores are 1-10.

The transcript was generated automatically from speech. Ignore transcription glitches, filler words and slips like calling the owner the wrong name unless they clearly hurt the call.`

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['overallScore', 'outcome', 'outcomeSummary', 'summary', 'skills', 'objections', 'whatWorked', 'whatFellFlat', 'focusNextCall'],
  properties: {
    overallScore: { type: 'integer', description: '0-100, using the scoring guide' },
    outcome: { type: 'string', enum: ['meeting_booked', 'conditional_next_step', 'no_next_step'] },
    outcomeSummary: { type: 'string', description: 'One sentence on where the call ended up' },
    summary: { type: 'string', description: 'Two or three sentences on the call overall' },
    skills: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'score', 'note'],
        properties: {
          name: { type: 'string', enum: ['Opener', 'Discovery', 'Value', 'Objection handling', 'Tone', 'Close'] },
          score: { type: 'integer', description: '1-10' },
          note: { type: 'string', description: 'One sentence' },
        },
      },
    },
    objections: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['objection', 'yourResponse', 'verdict', 'why', 'betterLine'],
        properties: {
          objection: { type: 'string', description: "The owner's objection, quoted or closely paraphrased" },
          yourResponse: { type: 'string', description: 'What the rep said back, quoted or closely paraphrased' },
          verdict: { type: 'string', enum: ['worked', 'mixed', 'fell_flat'] },
          why: { type: 'string', description: 'One or two sentences' },
          betterLine: { type: 'string', description: 'Exact words the rep could say instead' },
        },
      },
    },
    whatWorked: { type: 'array', items: { type: 'string' } },
    whatFellFlat: { type: 'array', items: { type: 'string' } },
    focusNextCall: { type: 'string', description: 'The single most important thing to work on next call' },
  },
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

  let body: { accessCode?: string; persona?: Persona; lines?: Line[] } = {}
  try {
    const raw = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString() : event.body
    body = JSON.parse(raw || '{}')
  } catch {
    return json(400, { error: 'Bad request' })
  }

  if (!process.env.ACCESS_CODE || body.accessCode !== process.env.ACCESS_CODE) {
    return json(401, { error: 'Wrong access code' })
  }

  const lines = Array.isArray(body.lines) ? body.lines.slice(0, MAX_LINES) : []
  const ownerName = body.persona?.name || 'Owner'
  const transcript = lines
    .filter((l) => typeof l?.text === 'string' && l.text.trim())
    .map((l) => `${l.role === 'user' ? 'Rep' : `Owner (${ownerName})`}: ${l.text.trim()}`)
    .join('\n')
    .slice(0, MAX_CHARS)

  if (!lines.some((l) => l?.role === 'user')) {
    return json(400, { error: 'The call was too short to grade.' })
  }

  const p = body.persona || {}
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      instructions: INSTRUCTIONS,
      input: `The owner was ${p.name || 'unknown'}, owner of ${p.business || 'a small business'} (${p.detail || 'no details'}).\n\nTranscript:\n${transcript}`,
      reasoning: { effort: 'low' },
      max_output_tokens: 6000,
      text: { format: { type: 'json_schema', name: 'coaching_report', schema: SCHEMA, strict: true } },
    }),
  })

  if (!res.ok) {
    console.error('OpenAI error', res.status, await res.text())
    return json(502, { error: 'Could not grade the call' })
  }

  const data = await res.json()
  const message = data.output?.find((item: { type: string }) => item.type === 'message')
  const text = message?.content?.find((c: { type: string }) => c.type === 'output_text')?.text
  try {
    return json(200, { report: JSON.parse(text) })
  } catch {
    console.error('Unreadable report', JSON.stringify(data).slice(0, 2000))
    return json(502, { error: 'Could not grade the call' })
  }
}
