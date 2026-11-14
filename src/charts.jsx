// Small SVG charts for the dashboard, so there's no chart library to load.
// Each chart measures its container and redraws at that width, and shows a
// tooltip for the point under the pointer.
import { useEffect, useRef, useState } from 'react'

function useWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    if (!ref.current) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

// Grade bands drawn behind score charts (matches the grader's SCORE_BANDS).
const BANDS = [
  { min: 90, max: 100, label: 'Elite' },
  { min: 80, max: 90, label: 'Strong' },
  { min: 70, max: 80, label: 'Developing' },
  { min: 60, max: 70, label: 'Needs improvement' },
  { min: 0, max: 60, label: 'Poor' },
]

function Tooltip({ x, width, title, rows }) {
  const left = Math.min(Math.max(x - 80, 0), width - 160)
  return (
    <div className="chart-tip" style={{ left }}>
      <p className="chart-tip-title">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="chart-tip-row">
          <span className={`swatch ${r.tone}`} aria-hidden="true" />
          <span>{r.label}</span>
          <strong>{r.value}</strong>
        </p>
      ))}
    </div>
  )
}

// Line chart of one series per bucket, with an optional dashed comparison series.
export function LineChart({ buckets, compare, height = 220, min = 0, max = 100, bands = false, format = (v) => v }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState(null)
  const pad = { top: 10, right: bands ? 118 : 40, bottom: 26, left: 4 }
  const n = buckets.length
  const x = (i) => pad.left + (n === 1 ? (width - pad.left - pad.right) / 2 : (i * (width - pad.left - pad.right)) / (n - 1))
  const y = (v) => pad.top + ((max - v) * (height - pad.top - pad.bottom)) / (max - min)

  // Days with no calls are skipped, and the line joins the days on either side.
  const path = (values) =>
    values
      .map((v, i) => (v == null ? null : `${x(i)},${y(v)}`))
      .filter(Boolean)
      .map((p, i) => `${i ? 'L' : 'M'}${p}`)
      .join('')

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const rel = e.clientX - rect.left
    const i = Math.round(((rel - pad.left) / (width - pad.left - pad.right)) * (n - 1))
    setHover(Math.max(0, Math.min(n - 1, i)))
  }

  const values = buckets.map((b) => b.value)
  const compareValues = compare?.map((b) => b.value)
  const lastIndex = values.findLastIndex((v) => v != null)

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img">
          {bands &&
            BANDS.map((b) => {
              const top = y(Math.min(b.max, max))
              const bottom = y(Math.max(b.min, min))
              if (bottom <= top) return null
              return (
                <g key={b.label} className={`band band-${b.min}`}>
                  <rect x={pad.left} y={top} width={width - pad.left - pad.right} height={bottom - top} />
                  {bottom - top > 14 && (
                    <text x={width - pad.right + 10} y={(top + bottom) / 2 + 4}>
                      {b.label}
                    </text>
                  )}
                </g>
              )
            })}
          {!bands &&
            [min, (min + max) / 2, max].map((g) => (
              <g key={g}>
                <line className="grid" x1={pad.left} x2={width - pad.right} y1={y(g)} y2={y(g)} />
                <text className="axis" x={width - pad.right + 8} y={y(g) + 4}>
                  {format(g)}
                </text>
              </g>
            ))}
          {compareValues && <path className="line compare" d={path(compareValues)} />}
          <path className="line primary" d={path(values)} />
          {values.map((v, i) =>
            v == null ? null : (
              <circle key={i} className={`dot${i === lastIndex ? ' last' : ''}`} cx={x(i)} cy={y(v)} r={i === lastIndex ? 4.5 : 2.5} />
            ),
          )}
          <text className="axis" x={pad.left} y={height - 6}>
            {buckets[0]?.label}
          </text>
          <text className="axis" x={width - pad.right} y={height - 6} textAnchor="end">
            {buckets.at(-1)?.label}
          </text>
          {hover != null && <line className="hover-line" x1={x(hover)} x2={x(hover)} y1={pad.top} y2={height - pad.bottom} />}
        </svg>
      )}
      {hover != null && (
        <Tooltip
          x={x(hover)}
          width={width}
          title={buckets[hover].label}
          rows={[
            { label: 'This period', value: values[hover] == null ? 'No calls' : format(values[hover]), tone: 'primary' },
            ...(compareValues
              ? [
                  {
                    label: compare[hover]?.label || 'Previous',
                    value: compareValues[hover] == null ? 'No calls' : format(compareValues[hover]),
                    tone: 'compare',
                  },
                ]
              : []),
          ]}
        />
      )}
    </div>
  )
}

// Vertical bars, one per bucket.
export function BarChart({ buckets, height = 140, format = (v) => v }) {
  const [ref, width] = useWidth()
  const [hover, setHover] = useState(null)
  const pad = { top: 8, bottom: 22 }
  const max = Math.max(1, ...buckets.map((b) => b.value))
  const slot = width / buckets.length
  const barW = Math.max(3, Math.min(28, slot * 0.6))
  const h = (v) => ((height - pad.top - pad.bottom) * v) / max

  return (
    <div className="chart" ref={ref}>
      {width > 0 && (
        <svg width={width} height={height} onMouseLeave={() => setHover(null)} role="img">
          <line className="grid" x1={0} x2={width} y1={height - pad.bottom} y2={height - pad.bottom} />
          {buckets.map((b, i) => (
            <g key={i} onMouseEnter={() => setHover(i)}>
              <rect className="bar-hit" x={i * slot} y={0} width={slot} height={height} />
              <rect
                className={`bar${hover === i ? ' active' : ''}`}
                x={i * slot + (slot - barW) / 2}
                y={height - pad.bottom - h(b.value)}
                width={barW}
                height={h(b.value)}
                rx={2}
              />
            </g>
          ))}
          <text className="axis" x={0} y={height - 6}>
            {buckets[0]?.label}
          </text>
          <text className="axis" x={width} y={height - 6} textAnchor="end">
            {buckets.at(-1)?.label}
          </text>
        </svg>
      )}
      {hover != null && (
        <Tooltip
          x={hover * slot + slot / 2}
          width={width}
          title={buckets[hover].label}
          rows={[{ label: 'Calls', value: format(buckets[hover].value), tone: 'primary' }]}
        />
      )}
    </div>
  )
}

// The dashed "No data" placeholder from an empty chart.
export function NoData({ height = 140, text = 'No data' }) {
  return (
    <div className="no-data" style={{ height }}>
      <span>{text}</span>
    </div>
  )
}
