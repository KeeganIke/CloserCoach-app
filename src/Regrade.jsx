// Grade a saved transcript with the current grader (open the app with ?regrade).
// Used to re-run a past call after the rubric changes, without making a new call.
// The owner's sealed secret only exists during a live call, so there's no reveal.

import { useState } from 'react'

// Same owners as the call backend (amplify/functions/session-token/handler.ts).
export const OWNERS = [
  { name: 'Dave', business: "Dave's Auto Repair", detail: 'a 3-bay auto shop with 4 mechanics' },
  { name: 'Maria', business: 'Bella Cucina', detail: 'a family Italian restaurant, about 40 seats' },
  { name: 'Tom', business: 'Summit Roofing', detail: 'a roofing company with 2 crews' },
  { name: 'Linda', business: 'Bright Smiles Dental', detail: 'a dental practice with 2 dentists' },
  { name: 'Mike', business: 'Iron Works Gym', detail: 'an independent gym with about 300 members' },
]

// Reads a transcript copied from the app ("You" / owner name before each line, either
// on its own line, followed by a colon, or stuck to the text like "MikeIron Works…").
// A speaker label counts only when followed by a colon, the end of the line, or
// stuck-on text starting with a capital ("YouHey…"), so "You too, bye." stays speech.
function speakerOf(row, ownerName) {
  for (const [label, role] of [
    ['you', 'user'],
    [ownerName.toLowerCase(), 'assistant'],
  ]) {
    if (row.slice(0, label.length).toLowerCase() !== label) continue
    const rest = row.slice(label.length)
    const colon = rest.match(/^\s*:\s*/)
    if (colon) return { role, text: rest.slice(colon[0].length) }
    if (!rest || /^[A-Z0-9"“'…]/.test(rest)) return { role, text: rest }
  }
  return null
}

export function parseTranscript(text, ownerName) {
  const lines = []
  let current = null
  for (const raw of text.split('\n')) {
    const row = raw.trim()
    if (!row || /^(show transcript|start another call)$/i.test(row)) continue
    const s = speakerOf(row, ownerName)
    if (s) {
      current = { id: `line-${lines.length}`, role: s.role, text: s.text.trim() }
      lines.push(current)
    } else if (current) {
      current.text = `${current.text} ${row}`.trim()
    }
  }
  return lines.filter((l) => l.text && l.text !== '…')
}

export default function Regrade({ onGrade }) {
  const [owner, setOwner] = useState(OWNERS[0].name)
  const [text, setText] = useState('')
  const [error, setError] = useState('')

  const submit = (e) => {
    e.preventDefault()
    const persona = OWNERS.find((o) => o.name === owner)
    const lines = parseTranscript(text, persona.name)
    if (!lines.some((l) => l.role === 'user') || !lines.some((l) => l.role === 'assistant')) {
      setError(`Couldn't find lines from both "You" and "${persona.name}". Paste the transcript from "Show transcript".`)
      return
    }
    setError('')
    onGrade(persona, lines)
  }

  return (
    <section className="setup-section">
      <h2 className="setup-heading">Grade a saved transcript</h2>
      <select className="code-input" value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner">
        {OWNERS.map((o) => (
          <option key={o.name} value={o.name}>
            {o.name}, {o.business}
          </option>
        ))}
      </select>
      <textarea
        className="offer-input"
        rows={10}
        placeholder="Paste the transcript here"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button className="button primary" type="button" onClick={submit} disabled={!text.trim()}>
        Grade
      </button>
      {error && <p className="error">{error}</p>}
    </section>
  )
}
