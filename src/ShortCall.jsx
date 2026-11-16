// Shown instead of a report when the call ended before there was enough to grade.
// General advice on keeping an owner on the line, since that is what went wrong.

const STEPS = [
  'Give one specific reason to listen in your first two sentences: their kind of business and a problem common to it.',
  'Ask for 30 seconds instead of launching into the pitch.',
  "When they say they're busy, acknowledge it and ask one easy question about their business before you pitch anything.",
  "If they still need to go, ask for a better time to call back so the call doesn't end with nothing.",
]

export default function ShortCall() {
  return (
    <section className="panel short-call">
      <h2>Too short to grade</h2>
      <p className="short-call-lead">
        The call ended before there was enough to score. The first goal of a cold call is earning a few more minutes. Here is how to keep them on the line.
      </p>
      <ol className="pfocus-steps">
        {STEPS.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <p className="better-line">
        <span className="improve-label">Try saying something like</span>
        “Sounds like a busy day, so I'll be quick. One question and I'll let you go: how are most new customers finding you right now?”
      </p>
    </section>
  )
}
