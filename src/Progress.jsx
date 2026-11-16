// "My progress": how a rep is improving, from the same rubric scores the coach
// gives on every call. Compares your last 5 calls with the 5 before. Analytics
// shows what happened on calls; this page says what's getting better and what's next.
import { average } from './Dashboard.jsx'
import { changeText, changeTone } from './format.js'
import Icon from './icons.jsx'
import { scorecardRows } from './Report.jsx'
import { SKILL_ADVICE } from './skillAdvice.js'

const WINDOW = 5
const ROWS = 3 // rows per column, so all three columns line up

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : null)

// Recent value, the value before it, and the change, for any per-call number.
function compare(calls, valueOf) {
  const recent = calls.slice(0, WINDOW).map(valueOf).filter((v) => v != null)
  const before = calls.slice(WINDOW, WINDOW * 2).map(valueOf).filter((v) => v != null)
  const now = recent.length ? Math.round(average(recent)) : null
  const then = before.length ? Math.round(average(before)) : null
  return { now, then, change: now == null || then == null ? null : now - then }
}

// Each skill: recent percent, change and best.
function skillStats(calls) {
  const ids = new Map()
  for (const call of calls) {
    for (const row of scorecardRows(call.report.categories || [])) {
      if (!ids.has(row.id)) ids.set(row.id, { id: row.id, name: row.name, max: row.max })
    }
  }
  return [...ids.values()].map((skill) => {
    const percentOf = (call) => {
      const row = scorecardRows(call.report.categories || []).find((r) => r.id === skill.id)
      return row && !row.na && row.max ? (row.earned / row.max) * 100 : null
    }
    const known = calls.map(percentOf).filter((v) => v != null)
    return {
      ...skill,
      ...compare(calls, percentOf),
      best: known.length ? Math.round(Math.max(...known)) : null,
    }
  })
}

function Change({ value, unit = ' pts' }) {
  if (value == null) return <span className="chg flat">New</span>
  return <span className={`chg ${changeTone(value)}`}>{changeText(value, unit)}</span>
}

function Stat({ label, now, suffix = '', change, note, empty }) {
  return (
    <div className="pstat">
      <span className="pstat-label">{label}</span>
      <span className="pstat-value">
        {now ?? '—'}
        {now != null && suffix && <small>{suffix}</small>}
      </span>
      <span className="pstat-foot">
        {now == null ? (
          <span className="muted">{empty}</span>
        ) : change === undefined || change === null ? (
          <span className="muted">{note}</span>
        ) : change === 0 ? (
          <span className="muted">Same as the 5 calls before</span>
        ) : (
          <>
            <Change value={change} unit=" pts" />
            <span className="muted">vs the 5 calls before</span>
          </>
        )}
      </span>
    </div>
  )
}

function SkillColumn({ title, icon, tone, skills, empty }) {
  const rows = skills.slice(0, ROWS)
  return (
    <section className={`card pcol ${tone}`}>
      <h2 className="pcol-title">
        <span className={`pcol-icon ${tone}`}>
          <Icon name={icon} />
        </span>
        {title}
      </h2>
      <ul className="pcol-list">
        {rows.map((s) => (
          <li key={s.id}>
            <div className="pcol-row">
              <span className="pcol-name">{s.name}</span>
              <span className="pcol-num">{s.now}%</span>
            </div>
            <div className="pcol-row">
              <span className="pbar">
                <span className={`pbar-fill ${tone}`} style={{ width: `${s.now}%` }} />
              </span>
              <Change value={s.change} unit=" pts" />
            </div>
          </li>
        ))}
        {rows.length === 0 && <li className="pcol-empty">{empty}</li>}
      </ul>
    </section>
  )
}

export default function MyProgress({ calls, onPractice }) {
  if (calls.length === 0) {
    return (
      <section className="card empty">
        <h2>Your progress starts with your first call</h2>
        <p className="muted">After each graded call, this page shows what you're getting better at and what to work on next.</p>
        <button className="button accent" onClick={onPractice}>
          Start a call
        </button>
      </section>
    )
  }

  const trending = calls.length > WINDOW
  const score = compare(calls, (c) => c.report.overallScore)
  const booked = compare(calls, (c) => (c.report.outcome?.status === 'meeting_booked' ? 100 : 0))
  const handled = compare(calls, (c) => {
    const o = c.report.objections || []
    return o.length ? pct(o.filter((x) => x.verdict === 'worked').length, o.length) : null
  })
  const best = Math.max(...calls.map((c) => c.report.overallScore))

  const skills = skillStats(calls).filter((s) => s.now != null)
  // Each skill shows in one column only: needs work first, then strengths (85%+,
  // whose arrows still show if they're climbing), then whatever else is going up.
  const needsWork = skills
    .filter((s) => s.now < 80 || s.change <= -5)
    .sort((a, b) => a.now - (a.change < 0 ? 8 : 0) - (b.now - (b.change < 0 ? 8 : 0)))
    .slice(0, ROWS)
  const strengths = skills
    .filter((s) => s.now >= 85 && !needsWork.includes(s))
    .sort((a, b) => b.now - a.now)
    .slice(0, ROWS)
  const improving = skills
    .filter((s) => s.change >= 3 && !needsWork.includes(s) && !strengths.includes(s))
    .sort((a, b) => b.change - a.change)
    .slice(0, ROWS)
  const focus = needsWork[0] || [...skills].sort((a, b) => a.now - b.now)[0]

  return (
    <div className="progress">
      <section className="card pstats">
        <Stat label={`Average, last ${Math.min(WINDOW, calls.length)} calls`} now={score.now} change={score.change} note="Your recent average" />
        <Stat label="Best score" now={best} note={`Across ${calls.length} ${calls.length === 1 ? 'call' : 'calls'}`} />
        <Stat label="Meetings booked" now={booked.now} suffix="%" change={booked.change} note="Of your recent calls" />
        <Stat
          label="Objections handled"
          now={handled.now}
          suffix="%"
          change={handled.change}
          note="Of recent pushback"
          empty="No objections on recent calls"
        />
      </section>

      {!trending && (
        <p className="progress-note">
          Make {WINDOW + 1 - calls.length} more {WINDOW + 1 - calls.length === 1 ? 'call' : 'calls'} to see what's going up and down.
        </p>
      )}

      <div className="pcols">
        <SkillColumn
          title="Getting better"
          icon="trend"
          tone="good"
          skills={improving}
          empty={trending ? 'Nothing has moved up 3 points or more yet.' : 'Shows up after a few more calls.'}
        />
        <SkillColumn title="Needs work" icon="target" tone="warn" skills={needsWork} empty="Every skill is at 80% or higher." />
        <SkillColumn title="Your strengths" icon="trophy" tone="navy" skills={strengths} empty="Skills at 85% or higher show up here." />
      </div>

      {focus && (
        <section className="pfocus">
          <div className="pfocus-main">
            <h2>
              <Icon name="bulb" /> Next focus: {focus.name}
            </h2>
            <p className="pfocus-meta">
              Your lowest skill. You averaged {Math.round((focus.now / 100) * focus.max * 2) / 2} of {focus.max} points on it
              {calls.length === 1 ? ' on your first call' : ` over your last ${Math.min(WINDOW, calls.length)} calls`}.
            </p>
            {SKILL_ADVICE[focus.id] && <p className="pfocus-tip">{SKILL_ADVICE[focus.id].habit}</p>}
            <button className="button accent pfocus-button" onClick={onPractice}>
              <Icon name="phone" /> Practice it now
            </button>
          </div>
          {SKILL_ADVICE[focus.id] && (
            <div className="pfocus-glass">
              <h3>How to work on it</h3>
              <ul className="pfocus-steps">
                {SKILL_ADVICE[focus.id].steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ul>
              <h3>Try saying something like</h3>
              <p className="pfocus-line">“{SKILL_ADVICE[focus.id].tryLine}”</p>
            </div>
          )}
        </section>
      )}

      <section className="card pskills">
        <h2 className="card-title">Every skill</h2>
        <table className="skill-table">
          <thead>
            <tr>
              <th>Skill</th>
              <th className="num-col">Last {WINDOW} calls</th>
              <th className="num-col">Change</th>
              <th className="num-col hide-sm">Best</th>
            </tr>
          </thead>
          <tbody>
            {skills.map((s) => (
              <tr key={s.id}>
                <td>
                  <strong>{s.name}</strong>
                </td>
                <td className="num-col">{s.now}%</td>
                <td className="num-col">
                  <Change value={s.change} unit=" pts" />
                </td>
                <td className="num-col hide-sm muted">{s.best}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
