const OUTCOMES = {
  meeting_booked: { label: 'Meeting booked', tone: 'good' },
  no_meeting: { label: 'No meeting booked', tone: 'bad' },
}

const VERDICTS = {
  worked: { label: 'Worked', tone: 'good' },
  mixed: { label: 'Mixed', tone: 'mixed' },
  fell_flat: { label: 'Fell flat', tone: 'bad' },
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number(n) || 0))

function List({ title, items }) {
  if (!items?.length) return null
  return (
    <section className="report-section">
      <h3>{title}</h3>
      <ul className="report-list">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </section>
  )
}

export default function Report({ report }) {
  const score = clamp(report.overallScore, 0, 100)
  const outcome = OUTCOMES[report.outcome] || OUTCOMES.no_meeting

  return (
    <div className="report">
      <div className="report-header">
        <div className="score">
          <span className="score-number">{score}</span>
          <span className="score-label">/ 100</span>
        </div>
        <div>
          <span className={`tag ${outcome.tone}`}>{outcome.label}</span>
          <p className="outcome-summary">{report.outcomeSummary}</p>
        </div>
      </div>

      <p className="report-summary">{report.summary}</p>

      {report.focusNextCall && (
        <section className="focus">
          <h3>Focus for your next call</h3>
          <p>{report.focusNextCall}</p>
        </section>
      )}

      {report.skills?.length > 0 && (
        <section className="report-section">
          <h3>Skills</h3>
          {report.skills.map((s) => {
            const value = clamp(s.score, 1, 10)
            return (
              <div key={s.name} className="skill">
                <div className="skill-row">
                  <span className="skill-name">{s.name}</span>
                  <span className="skill-score">{value}/10</span>
                </div>
                <div className="meter">
                  <div className="meter-fill" style={{ width: `${value * 10}%` }} />
                </div>
                <p className="skill-note">{s.note}</p>
              </div>
            )
          })}
        </section>
      )}

      {report.objections?.length > 0 && (
        <section className="report-section">
          <h3>Objections</h3>
          {report.objections.slice(0, 3).map((o, i) => {
            const verdict = VERDICTS[o.verdict] || VERDICTS.mixed
            return (
              <div key={i} className="objection">
                <div className="objection-top">
                  <p className="objection-quote">“{o.objection}”</p>
                  <span className={`tag ${verdict.tone}`}>{verdict.label}</span>
                </div>
                <p>
                  <strong>You said:</strong> {o.yourResponse.replace(/^you (initially )?said:?\s*/i, '')}
                </p>
                <p className="muted">{o.why}</p>
                {o.verdict !== 'worked' && o.betterLine && (
                  <p className="better-line">
                    <strong>Try instead:</strong> “{o.betterLine}”
                  </p>
                )}
              </div>
            )
          })}
        </section>
      )}

      <List title="What worked" items={report.whatWorked} />
      <List title="What fell flat" items={report.whatFellFlat} />
    </div>
  )
}
