import { useEffect, useState } from 'react'

// The grader doesn't report real progress, so the bar is time-based: it eases
// toward 95% over roughly the usual grading time and jumps to done when the
// report arrives (this component is unmounted).
const STEPS = [
  { at: 0, text: 'Reading your call…' },
  { at: 5, text: 'Finding the objections…' },
  { at: 11, text: 'Scoring your skills…' },
  { at: 17, text: 'Writing better lines for you…' },
  { at: 26, text: 'Almost done…' },
]

export default function GradingProgress() {
  const [seconds, setSeconds] = useState(0)

  useEffect(() => {
    const started = Date.now()
    const t = setInterval(() => setSeconds((Date.now() - started) / 1000), 200)
    return () => clearInterval(t)
  }, [])

  const percent = 95 * (1 - Math.exp(-seconds / 12))
  const step = [...STEPS].reverse().find((s) => seconds >= s.at)

  return (
    <div className="grading" role="status" aria-live="polite">
      <p className="grading-text">{step.text}</p>
      <div className="meter grading-meter">
        <div className="meter-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="grading-hint">Your coach is reviewing the call. This usually takes 20–30 seconds.</p>
    </div>
  )
}
