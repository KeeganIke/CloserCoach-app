import { useEffect, useRef, useState } from 'react'
import { startCall } from './realtimeCall.js'
import { fetchReport } from './report.js'
import Report from './Report.jsx'
import GradingProgress from './GradingProgress.jsx'
import { MAX_CALL_SECONDS, REPORT_URL, TOKEN_URL } from './config.js'

const CODE_KEY = 'closer-coach-access-code'
const OFFER_KEY = 'closer-coach-offer'
const MAX_OFFER_CHARS = 600

// The offer is a per-device convenience; the app works without storage.
function readStored(key, fallback) {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}

function store(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Not remembering is fine.
  }
}

// A shared link like /?code=XYZ fills in the access code so people can start a call
// right away. Changing ACCESS_CODE in Amplify secrets turns old links off.
// Any capitalization of "code" works, since email apps autocorrect it to "Code".
const linkCode =
  [...new URLSearchParams(window.location.search)].find(([key]) => key.toLowerCase() === 'code')?.[1] || ''

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

const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()

// Speaker echo the mic picked up: a short "rep" line that only repeats words from
// the owner's line just before it ("Right now." after "...right now I'm busy").
function isEcho(line, i, lines) {
  if (line.role !== 'user') return false
  const text = normalize(line.text)
  if (!text || text.split(' ').length > 6) return false
  const prev = lines.slice(0, i).reverse().find((l) => l.role === 'assistant')
  return Boolean(prev && normalize(prev.text).includes(text))
}

// The lines worth showing and grading.
function realLines(lines) {
  return lines.filter(isRealLine).filter((l, i, kept) => !isEcho(l, i, kept))
}

function Transcript({ lines, persona }) {
  const shown = realLines(lines)
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
  const [hidden, setHidden] = useState(null) // sealed owner secret for the report's reveal
  const [lines, setLines] = useState([])
  const [secondsLeft, setSecondsLeft] = useState(MAX_CALL_SECONDS)
  const [retryAudio, setRetryAudio] = useState(null) // set when the browser blocks the owner's audio
  const [report, setReport] = useState(null)
  const [reportStatus, setReportStatus] = useState('idle') // idle | loading | done | error
  const [reportError, setReportError] = useState('')
  const [offer, setOffer] = useState(() => readStored(OFFER_KEY, ''))
  const [editingOffer, setEditingOffer] = useState(() => !readStored(OFFER_KEY, ''))
  const callRef = useRef(null)
  const stickToBottom = useRef(true)

  const gradeCall = async (callLines) => {
    setReport(null)
    setReportError('')
    setReportStatus('loading')
    try {
      setReport(
        await fetchReport({
          reportUrl: REPORT_URL,
          accessCode,
          persona,
          offer,
          hidden,
          lines: realLines(callLines),
        }),
      )
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
    store(CODE_KEY, accessCode)
    store(OFFER_KEY, offer)
    setEditingOffer(!offer)
    try {
      const call = await startCall({
        tokenUrl: TOKEN_URL,
        accessCode,
        offer,
        onTranscript: setLines,
        onAudioBlocked: (retry) => setRetryAudio(() => retry),
      })
      callRef.current = call
      setPersona(call.persona)
      setHidden(call.hidden)
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
              Practice your cold call. A small business owner will pick up. Deliver your pitch out loud,
              handle their objections, and get a coaching report when you hang up. Calls end after{' '}
              {MAX_CALL_SECONDS / 60} minutes.
            </p>

            <section className="setup-section">
              <h2 className="setup-heading">What are you selling?</h2>
              {editingOffer ? (
                <>
                  <textarea
                    className="offer-input"
                    rows={4}
                    maxLength={MAX_OFFER_CHARS}
                    placeholder="e.g. I run Meta ads for local restaurants and gyms. $400/month, no contract, most clients see more bookings within 30 days."
                    value={offer}
                    onChange={(e) => setOffer(e.target.value)}
                    aria-describedby="offer-hint"
                  />
                  <div className="offer-footer">
                    <span id="offer-hint" className="hint">
                      Optional. Include your price. Saved on this device.
                    </span>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => {
                        store(OFFER_KEY, offer)
                        setEditingOffer(false)
                      }}
                    >
                      Save
                    </button>
                  </div>
                </>
              ) : (
                <div className="offer-saved">
                  <p>{offer || 'Not set. The owner will learn what you sell from your pitch.'}</p>
                  <button type="button" className="link-button" onClick={() => setEditingOffer(true)}>
                    Edit
                  </button>
                </div>
              )}
            </section>


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
            <p className="persona-detail">
              {persona?.detail}
            </p>
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
            <p className="calling">
              Call with {persona?.name} ended
            </p>
            {reportStatus === 'loading' && <GradingProgress />}
            {reportStatus === 'error' && (
              <div className="report-error">
                <p className="error">{reportError}</p>
                <button className="button primary" onClick={() => gradeCall(lines)}>
                  Try again
                </button>
              </div>
            )}
            {reportStatus === 'done' && report && <Report report={report} persona={persona} />}
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
