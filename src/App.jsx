import { useEffect, useRef, useState } from 'react'
import { startCall } from './realtimeCall.js'
import { fetchReport } from './report.js'
import Report from './Report.jsx'
import GradingProgress from './GradingProgress.jsx'
import ShortCall from './ShortCall.jsx'
import Regrade from './Regrade.jsx'
import MyProgress from './Progress.jsx'
import Icon, { Logo } from './icons.jsx'
import Dashboard, { CallTable, Overview, RANGES, StatCards, formatDate } from './Dashboard.jsx'
import { clearHistory, deleteCall, isSample, loadHistory, removeSamples, saveCall } from './history.js'
import { analyzeOffer, clearAnalysis, loadAnalysis, loadRecent, pickAhead, rememberCall } from './offerAnalysis.js'
import { OFFER_LIMITS, isComplete, loadOffer, normalizeOffer, offerText, productText, sameOffer, storeOffer } from './offer.js'
import { MAX_CALL_SECONDS, REPORT_URL, TOKEN_URL } from './config.js'

// Settings are a per-device convenience; the app works without storage.
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

// /?regrade shows a box for grading a saved transcript instead of starting a call.
const regradeMode = [...new URLSearchParams(window.location.search).keys()].some((key) => key.toLowerCase() === 'regrade')

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = String(seconds % 60).padStart(2, '0')
  return `${m}:${s}`
}

// Mic noise sometimes gets transcribed as stray words in other scripts ("好", "어 아").
// Treat rep lines without at least two English letters as noise. Older calls could
// also have the transcriber's own instructions echoed back as a rep line.
const PROMPT_ECHO = /sales rep cold calling|their offer:|what i sell:|who i sell to:/i
function isRealLine(l) {
  if (!l.text) return false
  if (l.role !== 'user') return true
  if (PROMPT_ECHO.test(l.text)) return false
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

// What the page shows: real lines, plus a "…" for the rep's line while their words
// are still being transcribed, so the owner's reply never gets pushed down by it.
function shownLines(lines) {
  return lines
    .filter((l) => (l.role === 'user' && l.pending) || isRealLine(l))
    .filter((l, i, kept) => !isEcho(l, i, kept))
}

const initials = (name) => (name || '?').slice(0, 1).toUpperCase()

function Transcript({ lines, persona }) {
  const shown = shownLines(lines)
  if (shown.length === 0) return null
  return (
    <div className="transcript">
      {shown.map((l) => (
        <p key={l.id} className={`line ${l.role}${l.pending ? ' pending' : ''}`}>
          <span className="speaker">{l.role === 'user' ? 'You' : persona?.name || 'Owner'}</span>
          {l.pending ? '…' : l.text}
        </p>
      ))}
    </div>
  )
}


// Made-up calls so someone with no calls yet can see what the app looks like.
// Loaded on demand, so they cost nothing for anyone who doesn't ask for them.
const loadSample = async () => (await import('./sampleHistory.js')).default()

const NAV = [
  { id: 'home', label: 'Dashboard', icon: 'home' },
  { id: 'progress', label: 'My progress', icon: 'trend' },
  { id: 'analytics', label: 'Analytics', icon: 'chart' },
  { id: 'calls', label: 'Call history', icon: 'calls' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
]

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function Sidebar({ active, onNavigate, locked, open, onToggle }) {
  return (
    <aside className={`sidebar${open ? ' open' : ''}`}>
      <div className="sidebar-top">
        <button className="brand" onClick={() => onNavigate('home')} disabled={locked}>
          <Logo />
          Closer Coach
        </button>
        <button className="menu-button" onClick={onToggle} aria-label="Menu" aria-expanded={open}>
          <Icon name="menu" />
        </button>
      </div>
      <button className="button accent block side-start" onClick={() => onNavigate('practice')} disabled={locked}>
        <Icon name="phone" />
        Start a call
      </button>
      <nav className="side-nav" aria-label="Main">
        {NAV.map((item) => (
          <button
            key={item.id}
            className={active === item.id ? 'active' : ''}
            aria-current={active === item.id ? 'page' : undefined}
            onClick={() => onNavigate(item.id)}
            disabled={locked}
          >
            <Icon name={item.icon} />
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  )
}

function PageHeader({ title, subtitle, actions }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

const OFFER_HELP =
  "Tell the coach what you sell, who you sell to, and the price. Every practice call is with a business you'd actually sell to, and the owner's problems and pushback fit your offer."

const OFFER_FIELDS = [
  { key: 'product', label: 'What you sell', placeholder: "e.g. Missed-call text-back: every missed call gets an instant text so the customer doesn't call someone else", multiline: true },
  { key: 'audience', label: 'Who you sell to', placeholder: 'e.g. Contractors: plumbers, electricians, roofers' },
  { key: 'price', label: 'Price', placeholder: 'e.g. $97/month' },
  { key: 'terms', label: 'Terms (optional)', placeholder: 'e.g. No contract, 14-day free trial' },
  { key: 'company', label: 'Your company (optional)', placeholder: 'e.g. Brightside Web' },
]

// The offer box used on both the Practice and Settings pages. A saved offer shows
// as a short summary with an Edit link; editing opens the fields.
function OfferEditor({ offer, savedOffer, onChange, onSave, onSettle, analysis, onRetry, compact = false }) {
  const saved = isComplete(savedOffer)
  const [editing, setEditing] = useState(!saved)
  const unsaved = !sameOffer(offer, savedOffer)
  const complete = isComplete(offer)

  if (!editing && saved && !unsaved) {
    return (
      <div className="offer-editor">
        {!compact && <p className="help-text">{OFFER_HELP}</p>}
        <div className="offer-summary">
          <dl className="offer-facts">
            {OFFER_FIELDS.filter((f) => savedOffer[f.key]).map((f) => (
              <div key={f.key}>
                <dt>{f.label.replace(' (optional)', '')}</dt>
                <dd>{savedOffer[f.key]}</dd>
              </div>
            ))}
          </dl>
          <button type="button" className="text-button" onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
        <OwnersStatus analysis={analysis} onRetry={onRetry} />
      </div>
    )
  }

  const field = (f) => {
    const props = {
      id: `offer-${f.key}${compact ? '-settings' : ''}`,
      className: 'input',
      maxLength: OFFER_LIMITS[f.key],
      placeholder: f.placeholder,
      value: offer[f.key],
      onChange: (e) => onChange({ ...offer, [f.key]: e.target.value }),
      // Leaving "what you sell" or "who you sell to" starts picking businesses early.
      onBlur: f.key === 'product' || f.key === 'audience' ? () => onSettle?.(offer) : undefined,
    }
    return (
      <label className={`offer-field offer-field-${f.key}`} key={f.key} htmlFor={props.id}>
        <span className="offer-label">{f.label}</span>
        {f.multiline ? <textarea rows={2} {...props} /> : <input {...props} />}
      </label>
    )
  }

  return (
    <div className="offer-editor">
      {!compact && <p className="help-text">{OFFER_HELP}</p>}
      <div className="offer-fields">{OFFER_FIELDS.map(field)}</div>
      <div className="offer-foot">
        {unsaved ? (
          <span className="save-state unsaved">{complete ? 'Unsaved changes' : 'Fill in what you sell, who to, and the price'}</span>
        ) : (
          <span />
        )}
        <div className="offer-actions">
          {saved && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                onChange(savedOffer)
                setEditing(false)
              }}
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            className="button secondary small-button"
            onClick={() => {
              onSave()
              setEditing(false)
            }}
            disabled={!unsaved || !complete}
          >
            Save offer
          </button>
        </div>
      </div>
    </div>
  )
}

// What the offer card shows for a saved analysis result (or none).
function analysisState(result) {
  if (!result) return { status: 'idle' }
  if (result.missing?.length) return { status: 'partial', ready: result.ready, missing: result.missing, error: result.detail }
  return { status: 'ready', ready: result.ready, ms: result.ms }
}

const listKinds = (ready = []) => [...new Set(ready)].join(', ')

// Under a saved offer: whether the businesses for it are ready.
function OwnersStatus({ analysis, onRetry }) {
  if (analysis?.status === 'loading') {
    return (
      <span className="save-state working" role="status">
        <span className="pulse-dot" aria-hidden="true" /> Saved. Getting your businesses ready…
      </span>
    )
  }
  const retry = (
    <button type="button" className="text-button" onClick={onRetry}>
      Try again
    </button>
  )
  if (analysis?.status === 'partial') {
    const total = analysis.ready.length + analysis.missing.length
    return (
      <span className="save-state unsaved" role="status">
        Saved. {analysis.ready.length} of {total} businesses ready.
        {analysis.error && <span className="status-detail"> ({analysis.error})</span>}
        {retry}
      </span>
    )
  }
  if (analysis?.status === 'error') {
    return (
      <span className="save-state unsaved" role="status">
        Saved, but your businesses aren't ready yet.
        {analysis.error && <span className="status-detail"> ({analysis.error})</span>}
        {retry}
      </span>
    )
  }
  if (analysis?.status === 'ready') {
    return (
      <span className="save-state saved ready-list" role="status">
        <Icon name="check" />
        <span>
          Saved. You'll call: <span className="status-detail">{listKinds(analysis.ready)}</span>
          {analysis.ms > 0 && <span className="status-detail"> · took {(analysis.ms / 1000).toFixed(1)}s</span>}
        </span>
      </span>
    )
  }
  return (
    <span className="save-state saved" role="status">
      <Icon name="check" /> Saved
    </span>
  )
}

function Alert({ children }) {
  return (
    <p className="alert" role="alert">
      <Icon name="alert" />
      <span>{children}</span>
    </p>
  )
}

const OUTCOME_FILTERS = [
  ['', 'All outcomes'],
  ['meeting_booked', 'Meeting booked'],
  ['follow_up_agreed', 'Follow-up agreed'],
  ['no_meeting', 'No meeting'],
  ['declined', 'Declined'],
]

const SORTS = {
  newest: (a, b) => b.date.localeCompare(a.date),
  oldest: (a, b) => a.date.localeCompare(b.date),
  highest: (a, b) => b.report.overallScore - a.report.overallScore,
  lowest: (a, b) => a.report.overallScore - b.report.overallScore,
}

// Decorative phone with sound waves for the "Start a new practice call" card.
function PhoneArt() {
  return (
    <svg className="phone-art" viewBox="0 0 160 140" aria-hidden="true">
      <circle cx="78" cy="72" r="62" className="art-halo" />
      <path
        className="art-phone"
        d="M52 38h16l8 20-10 6a44 44 0 0 0 20 20l6-10 20 8v16a8 8 0 0 1-8 8A64 64 0 0 1 44 46a8 8 0 0 1 8-8z"
      />
      <path className="art-wave" d="M100 52a18 18 0 0 1 14 14" />
      <path className="art-wave" d="M102 36a34 34 0 0 1 28 28" />
    </svg>
  )
}

function App() {
  const [view, setView] = useState('home') // home | progress | analytics | practice | calls | settings | saved (shown when no call is on screen)
  const [phase, setPhase] = useState('setup') // setup | connecting | live | ended
  const [error, setError] = useState('')
  const [persona, setPersona] = useState(null)
  const [hidden, setHidden] = useState(null) // sealed owner secret for the report's reveal
  const [savedReveal, setSavedReveal] = useState(null) // reveal pasted on the ?regrade page
  const [lines, setLines] = useState([])
  const [secondsLeft, setSecondsLeft] = useState(MAX_CALL_SECONDS)
  const [retryAudio, setRetryAudio] = useState(null) // set when the browser blocks the owner's audio
  const [report, setReport] = useState(null)
  const [reportStatus, setReportStatus] = useState('idle') // idle | loading | done | error
  const [reportError, setReportError] = useState('')
  const [offer, setOffer] = useState(loadOffer) // the fields being edited
  const [savedOffer, setSavedOffer] = useState(loadOffer)
  // idle | loading | ready | partial | error: the businesses for the saved offer.
  const [analysis, setAnalysis] = useState(() => analysisState(loadAnalysis(loadOffer())))
  const inFlight = useRef(null) // { key, promise } for the analysis running now
  const [history, setHistory] = useState(loadHistory)
  const [openCall, setOpenCall] = useState(null) // a saved call being reread
  const [range, setRange] = useState('7')
  const [compare, setCompare] = useState(true)
  const [ownerFilter, setOwnerFilter] = useState('')
  const [outcomeFilter, setOutcomeFilter] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('newest')
  const [menuOpen, setMenuOpen] = useState(false)
  const [toast, setToast] = useState('') // short confirmation shown in the corner
  const callRef = useRef(null)
  const stickToBottom = useRef(true)

  const onCallScreen = phase === 'live' || phase === 'ended'

  const hasSamples = history.some(isSample)
  const showSamples = async () => {
    setHistory(await loadSample())
    notify('Sample scores added')
  }
  const hideSamples = () => {
    setHistory(removeSamples())
    notify('Sample scores removed')
  }

  const notify = (text) => setToast(text)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2600)
    return () => clearTimeout(t)
  }, [toast])

  const savedText = offerText(savedOffer) // the saved offer as one text, for calls and grading

  // Gets the businesses for an offer ready. A second request for the same offer
  // waits on the first instead of starting another. Resolves to the new status.
  const prepareOwners = (fields) => {
    const key = productText(fields)
    if (inFlight.current?.key === key) return inFlight.current.promise
    setAnalysis({ status: 'loading' })
    const current = () => inFlight.current?.key === key
    const promise = analyzeOffer({ reportUrl: REPORT_URL, offer: fields })
      .then(analysisState, (err) => ({ status: 'error', error: err.detail || err.message }))
      .then((state) => {
        if (current()) {
          setAnalysis(state)
          inFlight.current = null
        }
        return state
      })
    inFlight.current = { key, promise }
    return promise
  }

  // Get the businesses ready whenever there's a saved offer without them. A
  // partial result (some businesses failed earlier) picks up where it left off.
  useEffect(() => {
    const saved = loadAnalysis(savedOffer)
    if (!savedText || (saved && !saved.missing.length)) {
      inFlight.current = null
      setAnalysis(analysisState(saved))
      return
    }
    prepareOwners(savedOffer)
  }, [savedText])

  const pickEarly = (fields) => pickAhead({ reportUrl: REPORT_URL, offer: fields })

  const saveOffer = () => {
    const clean = normalizeOffer(offer)
    storeOffer(clean)
    setOffer(clean)
    setSavedOffer(clean)
    notify('Offer saved')
  }

  const navigate = (next) => {
    if (phase === 'live') return
    if (phase === 'ended') setPhase('setup')
    setView(next)
    setMenuOpen(false)
    window.scrollTo(0, 0)
  }

  const openSaved = (call) => {
    setOpenCall(call)
    navigate('saved')
  }

  const gradeCall = async (callLines, callPersona = persona, callHidden = hidden, reveal = savedReveal) => {
    setReport(null)
    setReportError('')
    setReportStatus('loading')
    try {
      const kept = realLines(callLines)
      const graded = await fetchReport({
        reportUrl: REPORT_URL,
        persona: callPersona,
        offer: savedText,
        hidden: callHidden,
        lines: kept,
      })
      const finalReport = reveal ? { ...graded, hidden: reveal.hidden, hiddenCoaching: reveal.coaching } : graded
      setReport(finalReport)
      setReportStatus('done')
      setHistory(saveCall({ persona: callPersona, offer: savedText, report: finalReport, lines: kept }))
    } catch (err) {
      // A phone cuts the connection when you switch apps or lock the screen, and
      // Safari reports it as "Load failed". The grader still finished on the
      // server; only the answer was lost, so grade again when the page is back.
      const dropped = err instanceof TypeError || /load failed|failed to fetch|network/i.test(err.message || '')
      gradeDropped.current = dropped
      setReportError(
        dropped
          ? autoRetried.current
            ? "Couldn't reach the coach to grade your call. Check your connection, then tap Try again. Your call is still here."
            : "The connection dropped before your report arrived. This happens if you switch apps or lock your phone while it's grading. Your call is still here, and grading starts again when you come back to this page."
          : err.message,
      )
      setReportStatus(err.tooShort ? 'too_short' : 'error')
    }
  }

  const gradeSaved = (savedPersona, savedLines, reveal) => {
    setPersona(savedPersona)
    setHidden(null)
    setSavedReveal(reveal)
    setLines(savedLines)
    setPhase('ended')
    gradeCall(savedLines, savedPersona, null, reveal)
  }

  // The owner can hang up mid-call (they said bye); the ref always has the latest endCall.
  const endCallRef = useRef(null)
  const endCall = () => {
    if (!callRef.current) return
    const finalLines = callRef.current.hangup()
    callRef.current = null
    setLines(finalLines)
    setPhase('ended')
    window.scrollTo(0, 0)
    autoRetried.current = false
    gradeCall(finalLines)
  }
  endCallRef.current = endCall

  const handleStart = async (e) => {
    e.preventDefault()
    // The business, its problems and the owner's concerns are all built around the offer.
    if (!isComplete(offer)) {
      setError('Fill in what you sell, who you sell to, and the price before you start. Every owner you call is built around your offer.')
      return
    }
    const fields = normalizeOffer(offer)
    if (!sameOffer(fields, savedOffer)) {
      storeOffer(fields)
      setSavedOffer(fields)
    }
    setSavedReveal(null)
    setError('')
    setLines([])
    setRetryAudio(null)
    stickToBottom.current = true

    // Every call is with a business that matches the offer, so wait for them.
    const ready = loadAnalysis(fields)
    if (!ready) {
      setPhase('preparing')
      const state = await prepareOwners(fields)
      if (state.status === 'error') {
        setError(
          `Your businesses aren't ready yet, so the call didn't start. Try again in a moment.${state.error ? ` (${state.error})` : ''}`,
        )
        setPhase('setup')
        return
      }
    }
    setPhase('connecting')
    try {
      const call = await startCall({
        tokenUrl: TOKEN_URL,
        offer: fields,
        analysis: loadAnalysis(fields)?.sealed,
        recent: loadRecent(),
        onTranscript: setLines,
        onAudioBlocked: (retry) => setRetryAudio(() => retry),
        onOwnerHungUp: () => endCallRef.current?.(),
      })
      callRef.current = call
      rememberCall(call.recent)
      setPersona(call.persona)
      setHidden(call.hidden)
      setSecondsLeft(MAX_CALL_SECONDS)
      setPhase('live')
      window.scrollTo(0, 0)
    } catch (err) {
      setError(err.name === 'NotAllowedError' ? 'Microphone access is needed to make a call.' : err.message)
      // The server couldn't use the saved businesses: get fresh ones for next time.
      if (err.status === 409) {
        setError('Your businesses were out of date, so they are being rebuilt. Start the call again in a few seconds.')
        clearAnalysis()
        prepareOwners(fields)
      }
      setPhase('setup')
    }
  }

  // When grading was cut off by leaving the page, start it again on return.
  // Only once per call, so a connection that is really down can't loop; after
  // that, Try again is still there.
  const gradeDropped = useRef(false)
  const autoRetried = useRef(false)
  useEffect(() => {
    if (reportStatus !== 'error' || !gradeDropped.current || autoRetried.current) return
    const retry = () => {
      if (document.visibilityState !== 'visible' || !gradeDropped.current || autoRetried.current) return
      gradeDropped.current = false
      autoRetried.current = true
      gradeCall(lines)
    }
    retry()
    document.addEventListener('visibilitychange', retry)
    window.addEventListener('online', retry)
    return () => {
      document.removeEventListener('visibilitychange', retry)
      window.removeEventListener('online', retry)
    }
  }, [reportStatus])

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
  // Scrolls smoothly, and only when the page actually grew (a new line or a wrapped
  // line), not on every word the owner says.
  const lastHeight = useRef(0)
  const autoScrolling = useRef(false)
  const autoScrollTimer = useRef(null)
  useEffect(() => {
    const onScroll = () => {
      if (autoScrolling.current) return // our own glide, not the rep scrolling
      const fromBottom = document.documentElement.scrollHeight - (window.innerHeight + window.scrollY)
      stickToBottom.current = fromBottom < 120
    }
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    if (phase !== 'live' || !stickToBottom.current) return
    const height = document.documentElement.scrollHeight
    if (height === lastHeight.current) return
    lastHeight.current = height
    autoScrolling.current = true
    window.scrollTo({ top: height, behavior: 'smooth' })
    clearTimeout(autoScrollTimer.current)
    autoScrollTimer.current = setTimeout(() => (autoScrolling.current = false), 500)
  }, [lines, phase])

  // Hang up if the page is closed mid-call.
  useEffect(() => () => callRef.current?.hangup(), [])

  const focusPage = !onCallScreen && view === 'practice'
  const active = onCallScreen ? 'practice' : view === 'saved' ? 'calls' : view
  const ownerNames = [...new Set(history.map((c) => c.persona?.name).filter(Boolean))]
  const query = search.trim().toLowerCase()
  const filteredCalls = history
    .filter((c) => !ownerFilter || c.persona?.name === ownerFilter)
    .filter((c) => !outcomeFilter || c.report.outcome?.status === outcomeFilter)
    .filter((c) => !query || `${c.persona?.name} ${c.persona?.business} ${c.report.summary}`.toLowerCase().includes(query))
    .sort(SORTS[sort])
  const filtering = Boolean(ownerFilter || outcomeFilter || query)

  return (
    <div className={`shell${focusPage ? ' focus-mode' : ''}`}>
      {focusPage && (
        <header className="focus-bar">
          <span className="brand static">
            <Logo />
            Closer Coach
          </span>
          <button className="back-link" onClick={() => navigate('home')}>
            <Icon name="arrowLeft" /> Back to dashboard
          </button>
        </header>
      )}
      {!focusPage && (
      <Sidebar
        active={active}
        onNavigate={navigate}
        locked={phase === 'live'}
        open={menuOpen}
        onToggle={() => setMenuOpen((o) => !o)}
      />
      )}

      <main className={`main${phase === 'live' ? ' with-call-bar' : ''}`}>
        {hasSamples && !onCallScreen && ['home', 'progress', 'analytics', 'calls', 'saved'].includes(view) && (
          <div className="sample-banner" role="status">
            <Icon name="alert" />
            <span>
              <strong>You're looking at sample scores.</strong> These 30 calls are made up to show what the app looks like.
              They're removed when you save your first real call.
            </span>
            <button className="text-button" onClick={hideSamples}>
              Remove them
            </button>
          </div>
        )}
        {!onCallScreen && view === 'home' && (
          <>
            <PageHeader title={greeting()} subtitle="Sharpen your pitch before the real call." />
            <StatCards calls={history} />
            <section className="hero-card">
              <div className="hero-text">
                <h2>Start a new practice call</h2>
                <p>A small business owner picks up. Pitch your offer, handle their pushback, and get coached the moment you hang up.</p>
                <button className="button accent large" onClick={() => navigate('practice')}>
                  <Icon name="phone" />
                  Begin call
                </button>
              </div>
              <PhoneArt />
            </section>
            {history.length === 0 && (
              <section className="card empty-strip">
                <div>
                  <h2>Your stats fill in after your first call</h2>
                  <p className="muted">Each graded call adds to your scores, skills, and objection trends below.</p>
                </div>
                <button className="button secondary" onClick={showSamples}>
                  Show sample scores
                </button>
              </section>
            )}
            <Overview
              calls={history}
              onOpen={openSaved}
              onShowCalls={() => navigate('calls')}
              onShowAnalytics={() => navigate('analytics')}
            />
          </>
        )}

        {!onCallScreen && view === 'progress' && (
          <>
            <PageHeader title="My progress" subtitle="How you're improving, and what to work on next." />
            <MyProgress calls={history} onPractice={() => navigate('practice')} />
          </>
        )}

        {!onCallScreen && view === 'analytics' && (
          <>
            <PageHeader
              title="Analytics"
              subtitle="What happened on your calls: scores, outcomes, and trends."
              actions={
                <div className="filters">
                <label className="filter">
                  <span>Date range</span>
                  <select value={range} onChange={(e) => setRange(e.target.value)}>
                    {RANGES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className={`filter toggle${compare ? ' on' : ''}`}
                  onClick={() => setCompare((c) => !c)}
                  aria-pressed={compare}
                  disabled={range === 'all'}
                >
                  <span>Compare</span>
                  <strong>{compare && range !== 'all' ? 'Previous period' : 'Off'}</strong>
                </button>
                </div>
              }
            />
            <Dashboard
              calls={history}
              range={range}
              compare={compare}
              onOpen={openSaved}
              onShowCalls={() => navigate('calls')}
            />
          </>
        )}

        {!onCallScreen && view === 'practice' && (
          <div className="setup">
            <PageHeader
              title={regradeMode ? 'Grade a saved call' : 'Start a practice call'}
              subtitle="Pitch a small business owner out loud, then get coached on what to fix."
            />

            <ol className="timeline" aria-label="How the call works">
              <li>
                <span className="timeline-dot">1</span>
                <strong>Set your offer</strong>
                <span>What you sell, who to, and the price</span>
              </li>
              <li>
                <span className="timeline-dot">2</span>
                <strong>Pitch the owner</strong>
                <span>Find the problem, book a meeting</span>
              </li>
              <li>
                <span className="timeline-dot">3</span>
                <strong>Get coached</strong>
                <span>A score and what to fix</span>
              </li>
            </ol>

            <div className="launch">
              <section className="card offer-card">
                <h2 className="card-title">
                  <Icon name="target" /> Your offer
                </h2>
                <OfferEditor
                  offer={offer}
                  savedOffer={savedOffer}
                  onChange={setOffer}
                  onSave={saveOffer}
                  onSettle={pickEarly}
                  analysis={analysis}
                  onRetry={() => prepareOwners(savedOffer)}
                />
              </section>

              <form className="dial-card start-box" onSubmit={handleStart}>
                <h2 className="card-title">
                  <Icon name="phone" /> Start your call
                </h2>
                <p className="help-text">
                  The owner of a business you sell to picks up. Calls end after {MAX_CALL_SECONDS / 60} minutes.
                </p>
                {!isComplete(offer) && !regradeMode && (
                  <p className="soft-warning">
                    <Icon name="alert" /> Fill in your offer to start a call.
                  </p>
                )}
                {regradeMode ? (
                  <Regrade onGrade={gradeSaved} />
                ) : (
                  <button
                    className="button accent block start-button"
                    type="submit"
                    disabled={phase === 'connecting' || phase === 'preparing'}
                  >
                    <Icon name="phone" />
                    {phase === 'preparing' ? 'Getting your businesses ready…' : phase === 'connecting' ? 'Dialing…' : 'Start call'}
                  </button>
                )}
                {error && <Alert>{error}</Alert>}
                {!regradeMode && (
                  <p className="mic-note">
                    <Icon name="mic" /> Your browser will ask to use your microphone.
                  </p>
                )}
              </form>
            </div>
          </div>
        )}

        {!onCallScreen && view === 'calls' && (
          <>
            <PageHeader
              title="Call history"
              subtitle="Every graded call, with its report and transcript."
              actions={
                <button className="button accent" onClick={() => navigate('practice')}>
                  <Icon name="phone" /> New call
                </button>
              }
            />
            {history.length > 0 && (
              <div className="table-tools">
                <label className="search">
                  <Icon name="search" />
                  <input
                    type="search"
                    placeholder="Search prospect or business"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Search calls"
                  />
                </label>
                <select className="select" value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} aria-label="Prospect">
                  <option value="">All prospects</option>
                  {ownerNames.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
                <select className="select" value={outcomeFilter} onChange={(e) => setOutcomeFilter(e.target.value)} aria-label="Outcome">
                  {OUTCOME_FILTERS.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
                <select className="select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort">
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="highest">Highest score</option>
                  <option value="lowest">Lowest score</option>
                </select>
                <span className="table-count muted">
                  {filteredCalls.length} of {history.length}
                </span>
              </div>
            )}
            <section className="card flush">
              {filteredCalls.length ? (
                <CallTable calls={filteredCalls} onOpen={openSaved} />
              ) : (
                <div className="empty">
                  <h2>{filtering ? 'No calls match' : 'No calls yet'}</h2>
                  <p className="muted">
                    {filtering
                      ? 'Try a different search or clear the filters.'
                      : 'Every graded call is saved here so you can reread the report and transcript.'}
                  </p>
                  {filtering ? (
                    <button
                      className="button secondary"
                      onClick={() => {
                        setSearch('')
                        setOwnerFilter('')
                        setOutcomeFilter('')
                      }}
                    >
                      Clear filters
                    </button>
                  ) : (
                    <button className="button accent" onClick={() => navigate('practice')}>
                      Start a practice call
                    </button>
                  )}
                </div>
              )}
            </section>
          </>
        )}

        {!onCallScreen && view === 'settings' && (
          <div className="settings">
            <PageHeader title="Settings" subtitle="Everything here is saved in this browser only." />

            <section className="card setting">
              <div className="setting-text">
                <h2>Your offer</h2>
                <p>{OFFER_HELP}</p>
              </div>
              <OfferEditor
                offer={offer}
                savedOffer={savedOffer}
                onChange={setOffer}
                onSave={saveOffer}
                onSettle={pickEarly}
                analysis={analysis}
                onRetry={() => prepareOwners(savedOffer)}
                compact
              />
            </section>

            <section className="card setting">
              <div className="setting-text">
                <h2>Sample scores</h2>
                <p>
                  Fills the dashboard, progress and analytics with 30 made-up calls so you can see what they look like. They're
                  removed automatically when you save your first real call.
                </p>
              </div>
              <div className="setting-control end">
                {hasSamples ? (
                  <button className="button secondary" onClick={hideSamples}>
                    Remove sample scores
                  </button>
                ) : (
                  <button className="button secondary" onClick={showSamples}>
                    Show sample scores
                  </button>
                )}
              </div>
            </section>

            <section className="card setting danger-zone">
              <div className="setting-text">
                <h2>Delete call history</h2>
                <p>
                  Permanently removes all {history.length} saved {history.length === 1 ? 'call' : 'calls'}, including their reports
                  and transcripts. This can't be undone.
                </p>
              </div>
              <div className="setting-control end">
                <button
                  className="button danger"
                  disabled={history.length === 0}
                  onClick={() => {
                    if (!window.confirm(`Delete all ${history.length} saved calls? This cannot be undone.`)) return
                    setHistory(clearHistory())
                    notify('Call history deleted')
                  }}
                >
                  Delete all calls
                </button>
              </div>
            </section>
          </div>
        )}

        {!onCallScreen && view === 'saved' && openCall && (
          <div className="narrow">
            <button className="back-link" onClick={() => navigate('calls')}>
              ‹ Call history
            </button>
            <PageHeader title={`Call with ${openCall.persona?.name}`} subtitle={`${openCall.persona?.business}, ${formatDate(openCall.date, true)}`} />
            <Report
              report={openCall.report}
              persona={openCall.persona}
              previous={history.filter((c) => c.date < openCall.date).map((c) => c.report)}
            />
            <details className="panel transcript-toggle">
              <summary>Transcript</summary>
              <Transcript lines={openCall.lines} persona={openCall.persona} />
            </details>
            <button
              className="text-button danger-text"
              onClick={() => {
                if (!window.confirm('Delete this call from your history? This cannot be undone.')) return
                setHistory(deleteCall(openCall.id))
                navigate('calls')
              }}
            >
              Delete this call
            </button>
          </div>
        )}

        {onCallScreen && (
          <div className="narrow">
            <section className="call-head">
              <span className="avatar" aria-hidden="true">
                {initials(persona?.name)}
              </span>
              <div className="call-head-text">
                <h1>{persona?.name}</h1>
                <p className="muted">
                  {persona?.business}
                  {persona?.detail && `, ${persona.detail}`}
                </p>
              </div>
              {phase === 'live' ? (
                <span className="live-pill">
                  <span className="live-dot" aria-hidden="true" /> Live
                </span>
              ) : (
                <span className="pill neutral">Call ended</span>
              )}
            </section>

            {phase === 'live' && (
              <>
                {shownLines(lines).length === 0 && <p className="muted center waiting">Ringing. Say hello when they pick up.</p>}
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
                {reportStatus === 'loading' && (
                  <section className="panel">
                    <GradingProgress />
                  </section>
                )}
                {reportStatus === 'error' && (
                  <section className="panel report-error">
                    <Alert>{reportError}</Alert>
                    <button className="button primary" onClick={() => gradeCall(lines)}>
                      Try again
                    </button>
                  </section>
                )}
                {reportStatus === 'too_short' && (
                  <ShortCall />
                )}
                {reportStatus === 'done' && report && (
                  <Report report={report} persona={persona} previous={history.slice(1).map((c) => c.report)} />
                )}
                <details className="panel transcript-toggle">
                  <summary>Transcript</summary>
                  <Transcript lines={lines} persona={persona} />
                </details>
                {reportStatus !== 'loading' && (
                  <div className="end-actions">
                    <button className="button primary" onClick={() => navigate('practice')}>
                      Start another call
                    </button>
                    <button className="button secondary" onClick={() => navigate('home')}>
                      Back to dashboard
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </main>
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" /> {toast}
        </div>
      )}
    </div>
  )
}

export default App
