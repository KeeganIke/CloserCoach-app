const GRADE_TONES = {
  Excellent: 'good',
  Strong: 'good',
  Passing: 'good',
  'Needs Improvement': 'mixed',
  'Significant Improvement Needed': 'bad',
}

const OUTCOMES = {
  meeting_booked: { label: 'Meeting booked', tone: 'good' },
  follow_up_agreed: { label: 'Follow-up agreed', tone: 'mixed' },
  no_meeting: { label: 'No meeting', tone: 'bad' },
  declined: { label: 'Declined', tone: 'bad' },
  insufficient_information: { label: 'Outcome unclear', tone: 'mixed' },
}

const QUALIFICATIONS = {
  qualified: { label: 'Qualified', tone: 'good' },
  not_qualified: { label: 'Not a fit', tone: 'bad' },
  insufficient_information: { label: 'Not enough info', tone: 'mixed' },
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

function List({ title, items, suggestedLine }) {
  if (!items?.length) return null
  return (
    <section className="report-section">
      <h3>{title}</h3>
      <ul className="report-list">
        {items.map((item, i) => (
          <li key={i}>
            {item.point} <Quote text={item.quote} />
            {i === 0 && suggestedLine && (
              <p className="better-line">
                <strong>Try instead:</strong> “{suggestedLine}”
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function Result({ label, value, options }) {
  if (!value) return null
  const option = options[value.status] || options.insufficient_information
  return (
    <div className="result-row">
      <div className="result-top">
        <span className="result-label">{label}</span>
        <span className={`tag ${option.tone}`}>{option.label}</span>
      </div>
      <p className="muted">
        {value.rationale} <Quote text={value.quote} />
      </p>
    </div>
  )
}

export default function Report({ report }) {
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

      <section className="report-section call-result">
        <h3>How the call ended</h3>
        <p className="muted">Not part of your score.</p>
        <Result label="Outcome" value={report.outcome} options={OUTCOMES} />
        <Result label="Qualification" value={report.qualification} options={QUALIFICATIONS} />
      </section>

      {report.focusNextCall && (
        <section className="focus">
          <h3>Focus for your next call</h3>
          <p>{report.focusNextCall}</p>
        </section>
      )}

      {categories.length > 0 && (
        <section className="report-section">
          <h3>Scorecard</h3>
          {skipped > 0 && (
            <p className="muted">
              {skipped === 1 ? 'One category' : `${skipped} categories`} marked N/A {skipped === 1 ? 'is' : 'are'} left
              out of your score.
            </p>
          )}
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
                  {c.rationale} <Quote text={c.evidence} />
                </p>
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
                {o.yourResponse && (
                  <p>
                    <strong>You said:</strong> {o.yourResponse.replace(/^you (initially )?said:?\s*/i, '')}
                  </p>
                )}
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

      <List title="Strengths" items={report.whatWorked} />
      <List title="Missed opportunities" items={report.whatFellFlat} suggestedLine={report.suggestedLine} />
    </div>
  )
}
