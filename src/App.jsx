import { useEffect, useRef, useState } from 'react'
import { startCall } from './realtimeCall.js'
import { fetchReport } from './report.js'
import Report from './Report.jsx'
import GradingProgress from './GradingProgress.jsx'
import { MAX_CALL_SECONDS, REPORT_URL, TOKEN_URL } from './config.js'

const CODE_KEY = 'closer-coach-access-code'

// A shared link like /?code=XYZ fills in the access code so people can start a call
// right away. Changing ACCESS_CODE in Amplify secrets turns old links off.
const linkCode = new URLSearchParams(window.location.search).get('code') || ''

function readSavedCode() {
  if (linkCode) return linkCode
  try {
    return localStorage.getItem(CODE_KEY) || ''
  } catch {
    return ''
  }
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = String(seconds % 60).padStart(2, '0')
  return `${m}:${s}`
}

// Mic noise sometimes gets transcribed as stray words in other scripts ("好", "어 아").
// Treat rep lines without at least two English letters as noise.
function isRealLine(l) {
  if (!l.text) return false
  if (l.role !== 'user') return true
  return (l.text.match(/[a-z]/gi) || []).length >= 2
}

function Transcript({ lines, persona }) {
  const shown = lines.filter(isRealLine)
  if (shown.length === 0) return null
  return (
    <div className="transcript">
      {shown.map((l) => (
        <p key={l.id} className={`line ${l.role}`}>
          <span className="speaker">{l.role === 'user' ? 'You' : persona?.name || 'Owner'}</span>
          {l.text}
        </p>
      ))}
    </div>
  )
}

function App() {
  const [phase, setPhase] = useState('setup') // setup | connecting | live | ended
  const [accessCode, setAccessCode] = useState(readSavedCode)
  const [error, setError] = useState('')
  const [persona, setPersona] = useState(null)
  const [lines, setLines] = useState([])
  const [secondsLeft, setSecondsLeft] = useState(MAX_CALL_SECONDS)
  const [retryAudio, setRetryAudio] = useState(null) // set when the browser blocks the owner's audio
  const [report, setReport] = useState(null)
  const [reportStatus, setReportStatus] = useState('idle') // idle | loading | done | error
  const [reportError, setReportError] = useState('')
  const callRef = useRef(null)
  const stickToBottom = useRef(true)

  const gradeCall = async (callLines) => {
    setReport(null)
    setReportError('')
    setReportStatus('loading')
    try {
      setReport(await fetchReport({ reportUrl: REPORT_URL, accessCode, persona, lines: callLines.filter(isRealLine) }))
      setReportStatus('done')
    } catch (err) {
      setReportError(err.message)
      setReportStatus('error')
    }
  }

  const endCall = () => {
    if (!callRef.current) return
    const finalLines = callRef.current.hangup()
    callRef.current = null
    setLines(finalLines)
    setPhase('ended')
    gradeCall(finalLines)
  }

  const handleStart = async (e) => {
    e.preventDefault()
    setError('')
    setLines([])
    setRetryAudio(null)
    stickToBottom.current = true
    setPhase('connecting')
    try {
      localStorage.setItem(CODE_KEY, accessCode)
    } catch {
      // Remembering the code is only a convenience.
    }
    try {
      const call = await startCall({
        tokenUrl: TOKEN_URL,
        accessCode,
        onTranscript: setLines,
        onAudioBlocked: (retry) => setRetryAudio(() => retry),
      })
      callRef.current = call
      setPersona(call.persona)
      setSecondsLeft(MAX_CALL_SECONDS)
      setPhase('live')
    } catch (err) {
      setError(err.name === 'NotAllowedError' ? 'Microphone access is needed to make a call.' : err.message)
      setPhase('setup')
    }
  }

  // Countdown; hang up automatically when time runs out.
  useEffect(() => {
    if (phase !== 'live') return
    if (secondsLeft <= 0) {
      endCall()
      return
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [phase, secondsLeft])

  const turnOnSound = () => {
    retryAudio?.()
      .then(() => setRetryAudio(null))
      .catch(() => {})
  }

  // Follow new transcript lines during a call, unless the rep scrolled up to reread.
  useEffect(() => {
    const onScroll = () => {
      const fromBottom = document.documentElement.scrollHeight - (window.innerHeight + window.scrollY)
      stickToBottom.current = fromBottom < 120
    }
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (phase === 'live' && stickToBottom.current) {
      window.scrollTo({ top: document.documentElement.scrollHeight })
    }
  }, [lines, phase])

  // Hang up if the page is closed mid-call.
  useEffect(() => () => callRef.current?.hangup(), [])

  return (
    <main className="page">
      <div className="card">
        <h1 className="title">Closer Coach</h1>

        {(phase === 'setup' || phase === 'connecting') && (
          <form onSubmit={handleStart}>
            <p className="description">
              Practice your cold call. A busy small business owner will pick up. Deliver your pitch out
              loud and handle their objections. Calls end after {MAX_CALL_SECONDS / 60} minutes.
            </p>
            {/* Hidden when the link supplied the code, unless that code was rejected. */}
            {(!linkCode || /access code/i.test(error)) && (
              <input
                className="code-input"
                type="password"
                placeholder="Access code"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                required
              />
            )}
            <button className="button primary" type="submit" disabled={phase === 'connecting'}>
              {phase === 'connecting' ? 'Dialing…' : 'Start call'}
            </button>
            {error && <p className="error">{error}</p>}
          </form>
        )}

        {phase === 'live' && (
          <>
            <p className="calling">
              On a call with <strong>{persona?.name}</strong>, owner of {persona?.business}
            </p>
            <p className="persona-detail">{persona?.detail}</p>
            <Transcript lines={lines} persona={persona} />
            <div className="call-bar">
              {retryAudio && (
                <button className="button primary" onClick={turnOnSound}>
                  Tap to hear {persona?.name || 'the owner'}
                </button>
              )}
              <span className="timer">{formatTime(secondsLeft)}</span>
              <button className="button danger" onClick={endCall}>
                End call
              </button>
            </div>
          </>
        )}

        {phase === 'ended' && (
          <>
            <p className="calling">Call with {persona?.name} ended</p>
            {reportStatus === 'loading' && <GradingProgress />}
            {reportStatus === 'error' && (
              <div className="report-error">
                <p className="error">{reportError}</p>
                <button className="button primary" onClick={() => gradeCall(lines)}>
                  Try again
                </button>
              </div>
            )}
            {reportStatus === 'done' && report && <Report report={report} />}
            <details className="transcript-toggle">
              <summary>Show transcript</summary>
              <Transcript lines={lines} persona={persona} />
            </details>
            {reportStatus !== 'loading' && (
              <button className="button secondary" onClick={() => setPhase('setup')}>
                Start another call
              </button>
            )}
          </>
        )}
      </div>
    </main>
  )
}

export default App
