const GRADE_TONES = {
  Elite: 'good',
  Strong: 'good',
  Developing: 'mixed',
  'Needs Improvement': 'mixed',
  Poor: 'bad',
}

const OUTCOMES = {
  meeting_booked: { label: 'Meeting booked', tone: 'good' },
  follow_up_agreed: { label: 'Follow-up agreed', tone: 'mixed' },
  no_meeting: { label: 'No meeting', tone: 'bad' },
  declined: { label: 'Declined', tone: 'bad' },
  insufficient_information: { label: 'Outcome unclear', tone: 'mixed' },
}

const RATING_LABELS = { 4: 'Excellent', 3: 'Good', 2: 'Fair', 1: 'Poor', 0: 'Not shown' }

const VERDICTS = {
  worked: { label: 'Worked', tone: 'good' },
  mixed: { label: 'Mixed', tone: 'mixed' },
  fell_flat: { label: 'Fell flat', tone: 'bad' },
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Number(n) || 0))
const points = (n) => String(Math.round(n * 100) / 100)

function Quote({ text }) {
  return text ? <span className="evidence">“{text}”</span> : null
}

function List({ title, items }) {
  if (!items?.length) return null
  return (
    <section className="report-section">
      <h3>{title}</h3>
      <ul className="report-list">
        {items.map((item, i) => (
          <li key={i}>
            {item.point} <Quote text={item.quote} />
          </li>
        ))}
      </ul>
    </section>
  )
}

// The objections the owner raised, shown under the Objection Handling score.
function Objections({ items }) {
  if (!items?.length) return null
  return (
    <details className="improve">
      <summary>
        {items.length === 1 ? 'The objection' : `The ${Math.min(items.length, 3)} objections`} and how you handled{' '}
        {items.length === 1 ? 'it' : 'them'}
      </summary>
      {items.slice(0, 3).map((o, i) => {
        const verdict = VERDICTS[o.verdict] || VERDICTS.mixed
        return (
          <div key={i} className="objection">
            <div className="objection-top">
              <p className="objection-quote">“{o.objection}”</p>
              <span className={`tag ${verdict.tone}`}>{verdict.label}</span>
            </div>
            {o.yourResponse && (
              <p>
                <strong>You said:</strong> {o.yourResponse.replace(/^you (initially )?said:?\s*/i, '')}
              </p>
            )}
            <p className="muted">{o.why}</p>
            {o.verdict !== 'worked' && o.betterLine && (
              <p className="better-line">
                <span className="improve-label">Say</span>“{o.betterLine}”
              </p>
            )}
          </div>
        )
      })}
    </details>
  )
}

// The outcome on one line, with the reason tucked away.
function CallResult({ outcome }) {
  if (!outcome) return null
  const o = OUTCOMES[outcome.status] || OUTCOMES.insufficient_information
  return (
    <section className="call-result">
      <div className="result-chips">
        <span className="result-label">Outcome</span>
        <span className={`tag ${o.tone}`}>{o.label}</span>
      </div>
      <details className="why">
        <summary>Why? (not part of your score)</summary>
        <p>{outcome.rationale}</p>
      </details>
    </section>
  )
}

function Reveal({ hidden, coaching, name }) {
  if (!hidden) return null
  return (
    <details className="reveal">
      <summary>What {name} wasn't telling you</summary>
      <h4>Real problems</h4>
      <ul className="report-list">
        {hidden.problems.map((p, i) => (
          <li key={i}>{p.charAt(0).toUpperCase() + p.slice(1)}</li>
        ))}
      </ul>
      {hidden.providerWeakness && (
        <p>
          Already had someone for this, but it {hidden.providerWeakness}.
        </p>
      )}
      <h4>Concerns they had ready</h4>
      <ul className="report-list">
        {hidden.concerns.map((c, i) => (
          <li key={i}>{c.charAt(0).toUpperCase() + c.slice(1)}</li>
        ))}
      </ul>
      {hidden.personality?.length > 0 && <p className="muted">Personality: {hidden.personality.join(', ')}</p>}
      {coaching && <p className="reveal-coaching">{coaching}</p>}
    </details>
  )
}

export default function Report({ report, persona }) {
  const score = clamp(report.overallScore, 0, 100)
  const categories = report.categories || []
  const skipped = categories.filter((c) => c.rating === 'na').length

  return (
    <div className="report">
      <div className="report-header">
        <div className="score">
          <span className="score-number">{score}</span>
          <span className="score-label">/ 100</span>
        </div>
        <div>
          <span className={`tag ${GRADE_TONES[report.performanceGrade] || 'mixed'}`}>{report.performanceGrade}</span>
          <p className="outcome-summary">{report.summary}</p>
        </div>
      </div>

      <CallResult outcome={report.outcome} />

      <Reveal hidden={report.hidden} coaching={report.hiddenCoaching} name={persona?.name || 'the owner'} />

      {report.focusNextCall && (
        <section className="focus">
          <h3>Focus for your next call</h3>
          <p>{report.focusNextCall}</p>
        </section>
      )}

      {categories.length > 0 && (
        <section className="report-section">
          <h3>Scorecard</h3>
          <p className="muted">
            Scored on {categories.length - skipped} of {categories.length} categories
            {skipped > 0 && '. Categories marked N/A are left out of your score'}.
          </p>
          {categories.map((c) => {
            const na = c.rating === 'na'
            return (
              <div key={c.id} className={`skill${na ? ' na' : ''}`}>
                <div className="skill-row">
                  <span className="skill-name">{c.name}</span>
                  <span className="skill-score">
                    {na ? 'N/A' : `${points(c.earnedPoints)} / ${c.maxPoints}`}
                  </span>
                </div>
                {!na && (
                  <div className="meter" title={RATING_LABELS[c.rating]}>
                    <div className="meter-fill" style={{ width: `${(c.earnedPoints / c.maxPoints) * 100}%` }} />
                  </div>
                )}
                <p className="skill-note">
                  {na ? 'Not counted. ' : `${RATING_LABELS[c.rating]}. `}
                  {c.rationale}
                </p>
                {c.id === 'objection_handling' && <Objections items={report.objections} />}
                {c.improvement && (
                  <details className="improve">
                    <summary>How to improve</summary>
                    {c.whatHappened && (
                      <p>
                        <span className="improve-label">What happened</span>
                        {c.whatHappened}
                      </p>
                    )}
                    <p>
                      <span className="improve-label">Next time</span>
                      {c.improvement}
                    </p>
                    {c.tryLine && (
                      <p className="better-line">
                        <span className="improve-label">Say</span>“{c.tryLine}”
                      </p>
                    )}
                  </details>
                )}
              </div>
            )
          })}
        </section>
      )}

      <List title="Strengths" items={report.whatWorked} />
      <List title="Weaknesses" items={report.whatFellFlat} />
    </div>
  )
}
