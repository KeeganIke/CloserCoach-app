import { useEffect, useRef, useState } from 'react'
import { startCall } from './realtimeCall.js'
import { MAX_CALL_SECONDS, TOKEN_URL } from './config.js'

const CODE_KEY = 'closer-coach-access-code'

function readSavedCode() {
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

function Transcript({ lines, persona }) {
  const shown = lines.filter((l) => l.text)
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
  const callRef = useRef(null)

  const endCall = () => {
    if (!callRef.current) return
    setLines(callRef.current.hangup())
    callRef.current = null
    setPhase('ended')
  }

  const handleStart = async (e) => {
    e.preventDefault()
    setError('')
    setLines([])
    setPhase('connecting')
    try {
      localStorage.setItem(CODE_KEY, accessCode)
    } catch {
      // Remembering the code is only a convenience.
    }
    try {
      const call = await startCall({ tokenUrl: TOKEN_URL, accessCode, onTranscript: setLines })
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
            <input
              className="code-input"
              type="password"
              placeholder="Access code"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value)}
              required
            />
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
              <span className="timer">{formatTime(secondsLeft)}</span>
              <button className="button danger" onClick={endCall}>
                End call
              </button>
            </div>
          </>
        )}

        {phase === 'ended' && (
          <>
            <p className="calling">Call ended</p>
            <p className="description">Your coaching report is coming in the next build.</p>
            <Transcript lines={lines} persona={persona} />
            <button className="button primary" onClick={() => setPhase('setup')}>
              New call
            </button>
          </>
        )}
      </div>
    </main>
  )
}

export default App
