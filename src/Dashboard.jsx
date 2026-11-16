import { BarChart, LineChart, NoData } from './charts.jsx'
import { changeText, changeTone } from './format.js'
import Icon from './icons.jsx'
import { objectionType } from './objections.js'
import { GRADE_TONES, OUTCOMES, scorecardRows } from './Report.jsx'

const DAY = 86400000

export const RANGES = [
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
  { id: 'all', label: 'All time', days: null },
]

export const average = (nums) => (nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null)
const startOfDay = (t) => new Date(new Date(t).toDateString()).getTime()
const shortDate = (t) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export function formatDate(iso, withTime = false) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(withTime && { hour: 'numeric', minute: '2-digit' }),
  })
}

// Splits a period into chart buckets: single days for a week, then wider buckets
// so a few calls a week still make a readable chart.
function makeBuckets(start, end) {
  const days = Math.max(1, Math.round((end - start) / DAY))
  const size = (days <= 14 ? 1 : days <= 31 ? 3 : days <= 120 ? 7 : 14) * DAY
  const buckets = []
  for (let t = start; t < end; t += size) buckets.push({ start: t, end: Math.min(t + size, end), label: shortDate(t) })
  return buckets
}

function fill(buckets, calls, valueOf) {
  return buckets.map((b) => {
    const inside = calls.filter((c) => {
      const t = new Date(c.date).getTime()
      return t >= b.start && t < b.end
    })
    return { ...b, value: valueOf(inside) }
  })
}

const scoreOf = (calls) => {
  const a = average(calls.map((c) => c.report.overallScore))
  return a == null ? null : Math.round(a)
}

// Average share of points per scorecard row ("Delivery" merges clarity + filler words).
export function skillAverages(calls) {
  const totals = new Map()
  for (const call of calls) {
    for (const row of scorecardRows(call.report.categories || [])) {
      if (row.na || !row.max) continue
      const t = totals.get(row.id) || { name: row.name, percents: [] }
      t.percents.push((row.earned / row.max) * 100)
      totals.set(row.id, t)
    }
  }
  return new Map([...totals].map(([id, t]) => [id, { name: t.name, percent: average(t.percents) }]))
}

// The calls inside the selected date range, and the same-length period before it.
export function periodOf(calls, range) {
  const now = Date.now()
  const r = RANGES.find((x) => x.id === range) || RANGES[1]
  const earliest = calls.length ? startOfDay(Math.min(...calls.map((c) => new Date(c.date).getTime()))) : now - 30 * DAY
  const end = startOfDay(now) + DAY
  const start = r.days ? end - r.days * DAY : Math.min(earliest, end - 7 * DAY)
  const prevStart = start - (end - start)
  const inRange = (c, a, b) => {
    const t = new Date(c.date).getTime()
    return t >= a && t < b
  }
  return {
    r,
    start,
    end,
    prevStart,
    current: calls.filter((c) => inRange(c, start, end)),
    previous: r.days ? calls.filter((c) => inRange(c, prevStart, start)) : [],
  }
}

// The lowest-scoring scorecard row on one report.
export function weakestSkill(report) {
  const rows = scorecardRows(report.categories || []).filter((row) => !row.na && row.max)
  if (!rows.length) return null
  // Lowest percentage; on a tie, the skill that cost more points.
  const low = rows.reduce((a, b) => {
    const diff = b.earned / b.max - a.earned / a.max
    return diff < 0 || (diff === 0 && b.max - b.earned > a.max - a.earned) ? b : a
  })
  return { name: low.name, percent: Math.round((low.earned / low.max) * 100), points: `${low.earned} / ${low.max}` }
}

function Delta({ now, before, unit = ' pts' }) {
  if (now == null || before == null) return null
  const d = Math.round(now - before)
  return <span className={`delta ${changeTone(d)}`}>{changeText(d, unit)}</span>
}

function SkillChange({ now, before }) {
  const d = Math.round(now - before)
  return <span className={`skill-change ${changeTone(d)}`}>{changeText(d)}</span>
}

function Tile({ title, wide, full, children, footer }) {
  return (
    <section className={`tile${wide ? ' wide' : ''}${full ? ' full' : ''}`}>
      <h2 className="tile-title">{title}</h2>
      {children}
      {footer && <div className="tile-footer">{footer}</div>}
    </section>
  )
}

// Days in a row, ending today or yesterday, with at least one call.
function streak(calls) {
  const days = new Set(calls.map((c) => startOfDay(c.date)))
  let day = startOfDay(Date.now())
  if (!days.has(day)) day -= DAY
  let n = 0
  while (days.has(day)) {
    n += 1
    day -= DAY
  }
  return n
}

function StatCard({ icon, tone, value, label, change, valueTone = '' }) {
  return (
    <div className="stat-card">
      <span className={`stat-icon ${tone}`}>
        <Icon name={icon} />
      </span>
      <span className={`stat-value ${valueTone}`}>{value}</span>
      <span className="stat-label">{label}</span>
      {change}
    </div>
  )
}

// The four headline numbers at the top of the dashboard.
export function StatCards({ calls }) {
  const now = Date.now()
  const week = calls.filter((c) => now - new Date(c.date).getTime() < 7 * DAY)
  const lastWeek = calls.filter((c) => {
    const age = now - new Date(c.date).getTime()
    return age >= 7 * DAY && age < 14 * DAY
  })
  const avgAll = scoreOf(calls)
  const avg30 = scoreOf(periodOf(calls, '30').current)
  const avgRecent = scoreOf(calls.slice(0, 5))
  const avgBefore = scoreOf(calls.slice(5, 10))
  const trend = avgRecent != null && avgBefore ? Math.round(((avgRecent - avgBefore) / avgBefore) * 100) : null
  const days = streak(calls)

  return (
    <div className="stat-cards">
      <StatCard
        icon="trophy"
        tone="gold"
        value={avg30 ?? '—'}
        label="Average, last 30 days"
        change={
          <span className="change flat">
            {avgAll == null ? 'No calls yet' : `All-time ${avgAll}. Last 5 calls ${avgRecent}.`}
          </span>
        }
      />
      <StatCard
        icon="phone"
        tone="blue"
        value={week.length}
        label="Calls this week"
        change={<Change now={week.length} before={lastWeek.length} label="vs last week" />}
      />
      <StatCard
        icon="chart"
        tone={trend < 0 ? 'red' : 'green'}
        value={trend == null ? '—' : trend === 0 ? 'Same' : `${trend > 0 ? '↑' : '↓'} ${Math.abs(trend)}%`}
        valueTone={trend > 0 ? 'up' : trend < 0 ? 'down' : ''}
        label="Score change"
        change={
          <span className="change flat">{trend == null ? 'Needs 6 calls to compare' : 'Last 5 calls vs the 5 before'}</span>
        }
      />
      <StatCard
        icon="flame"
        tone="orange"
        value={`${days} day${days === 1 ? '' : 's'}`}
        label="Practice streak"
        change={<span className="change flat">{days ? 'Keep it going' : 'Make a call today to start one'}</span>}
      />
    </div>
  )
}

function Change({ now, before, label }) {
  if (now == null || before == null) return <span className="change flat">&nbsp;</span>
  const d = Math.round(now - before)
  return (
    <span className={`change ${changeTone(d)}`}>
      {changeText(d, '')} {label}
    </span>
  )
}

// What to work on next: the weakest skill in the selected date range (the same
// numbers as the Skills panel), plus the latest call's own tip.
export function coachingFocus(calls, range) {
  const { r, current } = periodOf(calls, range)
  if (!current.length) return null
  const skills = [...skillAverages(current)].map(([id, s]) => ({ id, ...s }))
  if (!skills.length) return null
  const weakest = skills.reduce((a, b) => (b.percent < a.percent ? b : a))
  // The coach's most recent advice for that same skill.
  const tip = current
    .map((c) => scorecardRows(c.report.categories || []).find((row) => row.id === weakest.id))
    .flatMap((row) => row?.parts.map((p) => p.improvement) || [])
    .find(Boolean)
  return { skill: weakest.name, percent: Math.round(weakest.percent), tip, period: r.label.toLowerCase() }
}

// Meeting booked is the expected result, so it gets a quiet badge; the outcomes
// worth noticing keep their colors.
const outcomeTone = (status, tone) => (status === 'meeting_booked' ? 'quiet' : tone)

export function CallTable({ calls, onOpen, compact = false }) {
  return (
    <table className="call-table">
      <colgroup>
        <col className="col-score" />
        <col />
        <col className="col-outcome hide-sm" />
        {!compact && <col className="col-weak hide-sm" />}
        <col className="col-date" />
        <col className="col-go" />
      </colgroup>
      <thead>
        <tr>
          <th>Score</th>
          <th>Prospect</th>
          <th className="hide-sm">Outcome</th>
          {!compact && <th className="hide-sm">Weakest skill</th>}
          <th>Date</th>
          <th aria-hidden="true" />
        </tr>
      </thead>
      <tbody>
        {calls.map((c) => {
          const r = c.report
          const outcome = OUTCOMES[r.outcome?.status] || OUTCOMES.insufficient_information
          const weak = weakestSkill(r)
          return (
            <tr
              key={c.id}
              onClick={() => onOpen(c)}
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onOpen(c)}
              aria-label={`Open the call with ${c.persona?.name || 'the prospect'}`}
            >
              <td>
                <span className={`score-chip tone-${GRADE_TONES[r.performanceGrade] || 'mixed'}`}>
                  {r.overallScore} <span className="chip-grade">· {r.performanceGrade}</span>
                </span>
              </td>
              <td>
                <strong>{c.persona?.name || 'Prospect'}</strong>
                <span className="muted owner-biz">{c.persona?.business}</span>
              </td>
              <td className="hide-sm">
                <span className={`pill ${outcomeTone(r.outcome?.status, outcome.tone)}`}>{outcome.label}</span>
              </td>
              {!compact && <td className="hide-sm muted">{weak ? `${weak.name}, ${weak.points}` : '—'}</td>}
              <td className="muted">{formatDate(c.date)}</td>
              <td className="row-go" aria-hidden="true">
                <Icon name="chevron" />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function ReviewList({ calls, onOpen }) {
  return (
    <ol className="top-calls">
      {calls.map((c) => {
        const weak = weakestSkill(c.report)
        return (
          <li key={c.id}>
            <button onClick={() => onOpen(c)}>
              <span className={`score-chip tone-${GRADE_TONES[c.report.performanceGrade] || 'mixed'}`}>{c.report.overallScore}</span>
              <span className="top-call-who">
                <strong>{c.persona?.name || 'Prospect'}</strong>
                <span className="muted">{weak ? `Weakest: ${weak.name}, ${weak.points}` : c.persona?.business}</span>
              </span>
              <span className="muted top-call-date">{formatDate(c.date)}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

// The short version for the Dashboard: last 30 days of scores, the calls worth
// rereading, and the latest calls. Everything else lives on the Analytics page.
export function Overview({ calls, onOpen, onShowCalls, onShowAnalytics }) {
  const { start, end, current, previous } = periodOf(calls, '30')
  const series = fill(makeBuckets(start, end), current, scoreOf)
  const avgNow = scoreOf(current)
  const avgBefore = scoreOf(previous)
  const low = Math.max(0, Math.floor((Math.min(100, ...series.map((b) => b.value ?? 100)) - 10) / 10) * 10)
  const toReview = [...current].sort((a, b) => a.report.overallScore - b.report.overallScore).slice(0, 4)

  return (
    <div className="tray">
      <Tile
        title="Score trend, last 30 days"
        wide
        footer={
          <button className="text-button" onClick={onShowAnalytics}>
            See full analytics
          </button>
        }
      >
        <p className="metric-sub">
          {avgBefore == null ? `${current.length} graded calls` : <><Delta now={avgNow} before={avgBefore} /> vs the 30 days before</>}
        </p>
        {current.length ? <LineChart buckets={series} min={low} max={100} bands height={200} /> : <NoData height={200} text="No calls in the last 30 days" />}
      </Tile>

      <Tile title="Calls to review">{toReview.length ? <ReviewList calls={toReview} onOpen={onOpen} /> : <NoData />}</Tile>

      <Tile
        title="Recent calls"
        full
        footer={
          calls.length > 5 && (
            <button className="text-button" onClick={onShowCalls}>
              View all calls
            </button>
          )
        }
      >
        {calls.length ? <CallTable calls={calls.slice(0, 5)} onOpen={onOpen} compact /> : <NoData text="Your graded calls will show up here" />}
      </Tile>
    </div>
  )
}

export default function Dashboard({ calls, range, compare, onOpen, onShowCalls }) {
  const { r, start, end, prevStart, current, previous } = periodOf(calls, range)
  const showCompare = compare && r.days != null

  const buckets = makeBuckets(start, end)
  const prevBuckets = makeBuckets(prevStart, start).map((b) => ({ ...b, label: `${shortDate(b.start)} (previous)` }))

  const avgNow = scoreOf(current)
  const avgBefore = scoreOf(previous)
  const scoreSeries = fill(buckets, current, scoreOf)
  const scorePrev = showCompare ? fill(prevBuckets, previous, scoreOf) : null
  const scoreLow = Math.max(0, Math.floor((Math.min(100, ...scoreSeries.concat(scorePrev || []).map((b) => b.value ?? 100)) - 10) / 10) * 10)

  const countSeries = fill(buckets, current, (cs) => cs.length)
  const booked = (cs) => cs.filter((c) => c.report.outcome?.status === 'meeting_booked').length
  const bookedRate = (cs) => (cs.length ? Math.round((booked(cs) / cs.length) * 100) : null)

  const skillsNow = skillAverages(current)
  const skillsBefore = skillAverages(previous)
  const skillList = [...skillsNow].map(([id, s]) => ({ id, ...s, before: skillsBefore.get(id)?.percent ?? null }))
  const weakest = skillList.length ? skillList.reduce((a, b) => (b.percent < a.percent ? b : a)) : null

  const outcomeCounts = Object.entries(OUTCOMES)
    .map(([id, o]) => ({ id, ...o, count: current.filter((c) => (c.report.outcome?.status || 'insufficient_information') === id).length }))
    .filter((o) => o.count > 0)

  // Each objection type: how often it came up and how often it didn't go well.
  const objectionTotals = new Map()
  for (const c of current) {
    for (const o of c.report.objections || []) {
      const type = objectionType(o.objection)
      const t = objectionTotals.get(type.id) || { ...type, total: 0, missed: 0, example: o.objection }
      t.total += 1
      if (o.verdict !== 'worked') t.missed += 1
      objectionTotals.set(type.id, t)
    }
  }
  const struggles = [...objectionTotals.values()]
    .filter((t) => t.missed > 0)
    .sort((a, b) => b.missed / b.total - a.missed / a.total || b.missed - a.missed)
    .slice(0, 4)
  const handledAll = objectionTotals.size > 0 && struggles.length === 0

  const toReview = [...current].sort((a, b) => a.report.overallScore - b.report.overallScore).slice(0, 4)

  const period = showCompare ? 'vs previous period' : null

  return (
    <div className="tray">
      <Tile
        title={`Average score, ${r.label.toLowerCase()}`}
        wide
        footer={
          showCompare && (
            <span className="legend">
              <span className="swatch primary" aria-hidden="true" /> {r.label}
              <span className="swatch compare" aria-hidden="true" /> Previous period
            </span>
          )
        }
      >
        <p className="metric">
          {avgNow ?? '—'}
          {avgNow != null && <span className="metric-unit">/ 100</span>}
          <Delta now={avgNow} before={showCompare ? avgBefore : null} />
        </p>
        <p className="metric-sub">{showCompare ? (avgBefore == null ? 'No calls in the previous period' : `${avgBefore} previous period`) : `${current.length} graded calls`}</p>
        {current.length ? (
          <LineChart buckets={scoreSeries} compare={scorePrev} min={scoreLow} max={100} bands height={240} />
        ) : (
          <NoData height={240} text="No calls in this period" />
        )}
      </Tile>

      <Tile title="Calls made">
        <p className="metric">
          {current.length}
          <Delta now={current.length} before={showCompare ? previous.length : null} unit="" />
        </p>
        <p className="metric-sub">{showCompare ? `${previous.length} previous period` : 'In this period'}</p>
        {current.length ? <BarChart buckets={countSeries} /> : <NoData />}
      </Tile>

      <Tile title="Skills" footer={period && <span className="legend"><span className="tick-key" aria-hidden="true" /> Previous period</span>}>
        {skillList.length ? (
          <ul className="skill-bars">
            {skillList.map((s) => (
              <li key={s.id}>
                <div className="skill-bar-head">
                  <span>
                    {s.name}
                    {s.id === weakest?.id && <span className="pill mixed small-pill">Work on this</span>}
                  </span>
                  <span className="skill-pct num">
                    {showCompare && s.before != null && <SkillChange now={s.percent} before={s.before} />}
                    {Math.round(s.percent)}%
                  </span>
                </div>
                <div className="track">
                  <div className="fill" style={{ width: `${s.percent}%` }} />
                  {showCompare && s.before != null && <span className="tick" style={{ left: `${s.before}%` }} />}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <NoData height={220} />
        )}
      </Tile>

      <Tile title="Call outcomes">
        {current.length ? (
          <>
            <p className="metric">
              {booked(current)}
              <span className="metric-unit">meetings booked</span>
            </p>
            <p className="metric-sub">
              {bookedRate(current)}% of calls
              {showCompare && previous.length > 0 && `, ${bookedRate(previous)}% previous period`}
            </p>
            <div className="stack" role="img" aria-label="Share of call outcomes">
              {outcomeCounts.map((o) => (
                <span key={o.id} className={`stack-seg ${o.tone} ${o.id}`} style={{ flex: o.count }} title={`${o.label}: ${o.count}`} />
              ))}
            </div>
            <ul className="stack-legend">
              {outcomeCounts.map((o) => (
                <li key={o.id}>
                  <span className={`swatch ${o.tone} ${o.id}`} aria-hidden="true" />
                  <span>{o.label}</span>
                  <strong className="num">{o.count}</strong>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <NoData height={200} />
        )}
      </Tile>

      <Tile title="Objections you struggle with">
        {struggles.length ? (
          <ul className="struggles">
            {struggles.map((t) => (
              <li key={t.id}>
                <div className="struggle-head">
                  <strong>{t.label}</strong>
                  <span className="muted num">
                    {t.missed} of {t.total} missed
                  </span>
                </div>
                <div className="track">
                  <div className="fill bad" style={{ width: `${(t.missed / t.total) * 100}%` }} />
                </div>
                <p className="struggle-example">“{t.example}”</p>
              </li>
            ))}
          </ul>
        ) : (
          <NoData height={200} text={handledAll ? 'You handled every objection in this period' : 'No objections in this period'} />
        )}
      </Tile>

      <Tile title="Calls to review">{toReview.length ? <ReviewList calls={toReview} onOpen={onOpen} /> : <NoData />}</Tile>

      <Tile
        title="Recent calls"
        wide
        footer={
          calls.length > 5 && (
            <button className="text-button" onClick={onShowCalls}>
              View all calls
            </button>
          )
        }
      >
        {calls.length ? <CallTable calls={calls.slice(0, 5)} onOpen={onOpen} compact /> : <NoData text="Your graded calls will show up here" />}
      </Tile>
    </div>
  )
}
