import { changeText, changeTone } from './format.js'
import Icon from './icons.jsx'

export const GRADE_TONES = {
  Elite: 'good',
  Strong: 'good',
  Developing: 'mixed',
  'Needs Improvement': 'mixed',
  Poor: 'bad',
}

export const OUTCOMES = {
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
const points = (n) => String(Math.round(n))

function Quote({ text }) {
  return text ? <span className="evidence">“{text}”</span> : null
}

function Points({ items, tone }) {
  if (!items?.length) return <p className="muted small">Nothing to note.</p>
  return (
    <ul className="marked">
      {items.map((item, i) => (
        <li key={i}>
          <span className={`mark ${tone}`} aria-hidden="true">
            <Icon name={tone === 'good' ? 'check' : 'alert'} />
          </span>
          <span>
            {item.point} <Quote text={item.quote} />
          </span>
        </li>
      ))}
    </ul>
  )
}

// What worked and what to fix, side by side in one card.
function Takeaways({ worked, fellFlat }) {
  if (!worked?.length && !fellFlat?.length) return null
  return (
    <section className="card takeaways">
      <div>
        <h2 className="card-title">What you did well</h2>
        <Points items={worked} tone="good" />
      </div>
      <div>
        <h2 className="card-title">Areas to improve</h2>
        <Points items={fellFlat} tone="warn" />
      </div>
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
                <strong>How you handled it:</strong> {o.yourResponse.replace(/^you (initially )?said:?\s*/i, '')}
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

// How the call ended, as one tag.
function CallResult({ outcome }) {
  if (!outcome) return null
  const o = OUTCOMES[outcome.status] || OUTCOMES.insufficient_information
  return (
    <>
      <span className="result-label">Outcome</span>
      <span className={`tag ${o.tone}`}>{o.label}</span>
    </>
  )
}

function Reveal({ hidden, coaching, name }) {
  if (!hidden) return null
  return (
    <details className="reveal">
      <summary>
        <span className="reveal-icon">
          <Icon name="bulb" />
        </span>
        <span className="reveal-head">
          <strong>What {name} was really thinking</strong>
          <span className="muted">{coaching || 'The problems and concerns they kept to themselves.'}</span>
        </span>
        <span className="reveal-more">
          <span className="when-closed">View details</span>
          <span className="when-open">Hide details</span>
        </span>
      </summary>
      <h4>Real problems</h4>
      <ul className="report-list">
        {hidden.problems.map((p, i) => (
          <li key={i}>{p.charAt(0).toUpperCase() + p.slice(1)}</li>
        ))}
      </ul>
      {hidden.providerWeakness && (
        <p>
          Already had something for this: {hidden.providerWeakness}.
        </p>
      )}
      <h4>Concerns they had ready</h4>
      <ul className="report-list">
        {hidden.concerns.map((c, i) => (
          <li key={i}>{c.charAt(0).toUpperCase() + c.slice(1)}</li>
        ))}
      </ul>
      {hidden.personality?.length > 0 && <p className="muted">Personality: {hidden.personality.join(', ')}</p>}
    </details>
  )
}

// "How to improve" content for one scored category.
function Advice({ c }) {
  return (
    <>
      {c.whatHappened && (
        <p>
          <span className="improve-label">What happened</span>
          {c.whatHappened}
        </p>
      )}
      <p>
        <span className="improve-label">{c.id === 'delivery' ? 'Filler words' : 'Next time'}</span>
        {c.improvement}
      </p>
      {c.tryLine && (
        <p className="better-line">
          <span className="improve-label">Say</span>“{c.tryLine}”
        </p>
      )}
    </>
  )
}

// Scorecard rows. Clear and Concise (graded by the coach) and Filler Words (counted
// by the app) are scored separately but shown together as one Delivery row.
export function scorecardRows(categories) {
  return categories
    .filter((c) => c.id !== 'delivery' || !categories.some((x) => x.id === 'clarity'))
    .map((c) => {
      const parts = c.id === 'clarity' ? [c, ...categories.filter((x) => x.id === 'delivery')] : [c]
      const counted = parts.filter((p) => p.rating !== 'na')
      return {
        id: c.id,
        name: parts.length > 1 ? 'Delivery' : c.name,
        parts,
        na: counted.length === 0,
        earned: counted.reduce((sum, p) => sum + p.earnedPoints, 0),
        max: counted.reduce((sum, p) => sum + p.maxPoints, 0),
      }
    })
}

// Circular score, filled to the score out of 100.
function ScoreRing({ score, tone }) {
  const r = 52
  const c = 2 * Math.PI * r
  return (
    <div className={`score-ring tone-${tone}`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="ring-track" cx="60" cy="60" r={r} />
        <circle className="ring-fill" cx="60" cy="60" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} />
      </svg>
      <div className="score-ring-text">
        <span className="score-number">{score}</span>
        <span className="score-label">out of 100</span>
      </div>
    </div>
  )
}

// The three skills shown as headline cards next to the score.
const HEADLINE = [
  { id: 'discovery', label: 'Pain Discovery', icon: 'search' },
  { id: 'objection_handling', label: 'Objection Handling', icon: 'shield' },
  { id: 'closing', label: 'Closing and Next Step', icon: 'handshake' },
]

// A skill's points on this call, shown the same way as the scorecard ("12 / 20").
const pointsOf = (report, id) => {
  const row = scorecardRows(report.categories || []).find((r) => r.id === id)
  return row && !row.na && row.max ? { earned: row.earned, max: row.max } : null
}

// previous: reports from earlier calls, used to show change against your average.
export default function Report({ report, persona, previous = [] }) {
  const score = clamp(report.overallScore, 0, 100)
  const rows = scorecardRows(report.categories || [])
  const skipped = rows.filter((r) => r.na).length
  const tone = GRADE_TONES[report.performanceGrade] || 'mixed'
  // The lowest-scoring skill that has advice; its "How to improve" starts open.
  const weakestId = rows
    .filter((r) => !r.na && r.max && r.parts.some((p) => p.improvement))
    .reduce((low, r) => {
      if (!low) return r
      const diff = r.earned / r.max - low.earned / low.max
      return diff < 0 || (diff === 0 && r.max - r.earned > low.max - low.earned) ? r : low
    }, null)?.id
  const avgOf = (values) => {
    const v = values.filter((x) => x != null)
    return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null
  }
  const avgScore = avgOf(previous.map((r) => r.overallScore))

  const change = (now, avg) => {
    if (now == null || avg == null) return null
    const d = now - avg
    return <span className={`change ${changeTone(d)}`}>{changeText(d)} vs your average</span>
  }

  return (
    <div className="report">
      <div className="result-cards">
        <section className="card score-card">
          <ScoreRing score={score} tone={tone} />
          <div className="score-card-text">
            <span className={`tag ${tone}`}>{report.performanceGrade}</span>
            {change(score, avgScore)}
          </div>
        </section>
        {HEADLINE.map((h) => {
          const pts = pointsOf(report, h.id)
          return (
            <section key={h.id} className="card skill-card">
              <span className="stat-icon blue">
                <Icon name={h.icon} />
              </span>
              <span className="skill-card-label">{h.label}</span>
              <span className="skill-card-value">
                {pts ? (
                  <>
                    {pts.earned}
                    <span className="skill-card-max"> / {pts.max}</span>
                  </>
                ) : (
                  'N/A'
                )}
              </span>
              {change(pts?.earned, avgOf(previous.map((r) => pointsOf(r, h.id)?.earned)))}
            </section>
          )
        })}
      </div>

      <Reveal hidden={report.hidden} coaching={report.hiddenCoaching} name={persona?.name || 'the owner'} />

      <section className="card summary-card">
        <div className="result-chips">
          <CallResult outcome={report.outcome} />
        </div>
        <p className="summary-text">{report.summary}</p>
        {report.focusNextCall && (
          <div className="focus">
            <h3>Focus for your next call</h3>
            <p>{report.focusNextCall}</p>
          </div>
        )}
      </section>

      <Takeaways worked={report.whatWorked} fellFlat={report.whatFellFlat} />

      {rows.length > 0 && (
        <section className="card">
          <div className="panel-head">
            <h2 className="card-title">Scorecard</h2>
            <p className="muted small">
              {skipped > 0
                ? `Graded on ${rows.length - skipped} of ${rows.length} skills. Skills marked N/A didn't come up on this call, so they don't count toward your score.`
                : `Graded on all ${rows.length} skills`}
            </p>
          </div>
          {rows.map((r) => {
            const advice = r.parts.filter((p) => p.improvement)
            const weakest = r.id === weakestId
            return (
              <div key={r.id} className={`skill${r.na ? ' na' : ''}`}>
                <div className="skill-row">
                  <span className="skill-name">{r.name}</span>
                  <span className="skill-score">{r.na ? 'N/A' : `${points(r.earned)} / ${r.max}`}</span>
                </div>
                {!r.na && (
                  <div className="meter">
                    <div className="meter-fill" style={{ width: `${(r.earned / r.max) * 100}%` }} />
                  </div>
                )}
                {r.parts.map((p) => (
                  <p key={p.id} className="skill-note">
                    {r.parts.length > 1 && <strong>{p.name}: </strong>}
                    {p.rating === 'na' ? 'Not counted. ' : `${RATING_LABELS[p.rating]}. `}
                    {p.rationale}
                  </p>
                ))}
                {r.id === 'objection_handling' && <Objections items={report.objections} />}
                {advice.length > 0 && (
                  <details className="improve" open={weakest}>
                    <summary>How to improve{weakest && <span className="pill mixed small-pill">Your weakest skill</span>}</summary>
                    {advice.map((p) => (
                      <Advice key={p.id} c={p} />
                    ))}
                  </details>
                )}
              </div>
            )
          })}
        </section>
      )}
    </div>
  )
}
