import { useEffect, useRef, useState } from 'react'
import { startCall } from './realtimeCall.js'
import { fetchReport } from './report.js'
import Report from './Report.jsx'
import GradingProgress from './GradingProgress.jsx'
import Regrade from './Regrade.jsx'
import MyProgress from './Progress.jsx'
import Icon, { Logo } from './icons.jsx'
import Dashboard, { CallTable, Overview, RANGES, StatCards, coachingFocus, formatDate } from './Dashboard.jsx'
import { clearHistory, deleteCall, loadHistory, saveCall } from './history.js'
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

// /?regrade shows a box for grading a saved transcript instead of starting a call.
const regradeMode = [...new URLSearchParams(window.location.search).keys()].some((key) => key.toLowerCase() === 'regrade')

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


// Sample calls for previewing the dashboard while developing; never in the live build.
const loadSample = import.meta.env.DEV
  ? async () => (await import('./sampleHistory.js')).default()
  : null

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
  "Tell the coach what you sell and how much it costs. Your offer helps generate realistic objections and ensures your practice calls reflect the product or service you're actually selling."

// The offer box used on both the Practice and Settings pages.
const OFFER_EXAMPLE = 'e.g. I build websites for local businesses. $77/month, fully built for you, no contracts.'

// The offer box used on both the Practice and Settings pages. A saved offer shows
// as a short summary with an Edit link; editing opens the text box.
function OfferEditor({ offer, savedOffer, onChange, onSave, compact = false }) {
  const [editing, setEditing] = useState(!savedOffer)
  const unsaved = offer !== savedOffer

  if (!editing && savedOffer && !unsaved) {
    return (
      <div className="offer-editor">
        {!compact && <p className="help-text">{OFFER_HELP}</p>}
        <div className="offer-summary">
          <p>{savedOffer}</p>
          <button type="button" className="text-button" onClick={() => setEditing(true)}>
            Edit
          </button>
        </div>
        <span className="save-state saved">
          <Icon name="check" /> Saved
        </span>
      </div>
    )
  }

  return (
    <div className="offer-editor">
      {!compact && <p className="help-text">{OFFER_HELP}</p>}
      <textarea
        className="input"
        rows={compact ? 5 : 4}
        maxLength={MAX_OFFER_CHARS}
        placeholder={OFFER_EXAMPLE}
        value={offer}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Your offer"
      />
      <div className="offer-foot">
        {unsaved ? (
          <span className="save-state unsaved">Unsaved changes</span>
        ) : (
          <span className="hint">
            {offer.length} / {MAX_OFFER_CHARS}
          </span>
        )}
        <div className="offer-actions">
          {savedOffer && (
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
              if (offer.trim()) setEditing(false)
            }}
            disabled={!unsaved}
          >
            Save offer
          </button>
        </div>
      </div>
    </div>
  )
}

// Password field with a show/hide toggle.
function SecretInput({ value, onChange, label, describedBy }) {
  const [shown, setShown] = useState(false)
  return (
    <div className="secret">
      <input
        className="input"
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        aria-describedby={describedBy}
        autoComplete="off"
        required
      />
      <button type="button" className="secret-toggle" onClick={() => setShown((v) => !v)} aria-pressed={shown}>
        {shown ? 'Hide' : 'Show'}
      </button>
    </div>
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
  const [accessCode, setAccessCode] = useState(readSavedCode)
  const [codeSaved, setCodeSaved] = useState(() => Boolean(readSavedCode()))
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
  const [offer, setOffer] = useState(() => readStored(OFFER_KEY, ''))
  const [savedOffer, setSavedOffer] = useState(() => readStored(OFFER_KEY, ''))
  const [history, setHistory] = useState(loadHistory)
  const [openCall, setOpenCall] = useState(null) // a saved call being reread
  const [range, setRange] = useState('30')
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

  const notify = (text) => setToast(text)
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 2600)
    return () => clearTimeout(t)
  }, [toast])

  const saveOffer = () => {
    store(OFFER_KEY, offer)
    setSavedOffer(offer)
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
        accessCode,
        persona: callPersona,
        offer,
        hidden: callHidden,
        lines: kept,
      })
      const finalReport = reveal ? { ...graded, hidden: reveal.hidden, hiddenCoaching: reveal.coaching } : graded
      setReport(finalReport)
      setReportStatus('done')
      setHistory(saveCall({ persona: callPersona, offer, report: finalReport, lines: kept }))
    } catch (err) {
      setReportError(err.message)
      setReportStatus('error')
    }
  }

  const gradeSaved = (savedPersona, savedLines, reveal) => {
    store(CODE_KEY, accessCode)
    setPersona(savedPersona)
    setHidden(null)
    setSavedReveal(reveal)
    setLines(savedLines)
    setPhase('ended')
    gradeCall(savedLines, savedPersona, null, reveal)
  }

  const endCall = () => {
    if (!callRef.current) return
    const finalLines = callRef.current.hangup()
    callRef.current = null
    setLines(finalLines)
    setPhase('ended')
    window.scrollTo(0, 0)
    gradeCall(finalLines)
  }

  const handleStart = async (e) => {
    e.preventDefault()
    setSavedReveal(null)
    setError('')
    setLines([])
    setRetryAudio(null)
    stickToBottom.current = true
    setPhase('connecting')
    store(CODE_KEY, accessCode)
    setCodeSaved(true)
    store(OFFER_KEY, offer)
    setSavedOffer(offer)
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
      window.scrollTo(0, 0)
    } catch (err) {
      setError(err.name === 'NotAllowedError' ? 'Microphone access is needed to make a call.' : err.message)
      if (/access code/i.test(err.message)) setCodeSaved(false)
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

  const focus = coachingFocus(history, '30')
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
              {focus ? (
                <div className="focus-panel">
                  <h3 className="focus-title">
                    <Icon name="bulb" /> Work on {focus.skill}
                  </h3>
                  <p className="focus-meta">{focus.percent}% in the {focus.period}, your lowest skill</p>
                  {focus.tip && <p className="focus-tip">{focus.tip}</p>}
                </div>
              ) : (
                <PhoneArt />
              )}
            </section>
            {history.length === 0 && (
              <section className="card empty-strip">
                <div>
                  <h2>Your stats fill in after your first call</h2>
                  <p className="muted">Each graded call adds to your scores, skills, and objection trends below.</p>
                </div>
                {loadSample && (
                  <button className="button secondary" onClick={async () => setHistory(await loadSample())}>
                    Load sample calls
                  </button>
                )}
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
                <span>What you sell and the price</span>
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
                <OfferEditor offer={offer} savedOffer={savedOffer} onChange={setOffer} onSave={saveOffer} />
              </section>

              <form className="dial-card start-box" onSubmit={handleStart}>
                <h2 className="card-title">
                  <Icon name="phone" /> Start your call
                </h2>
                <p className="help-text">
                  A random owner picks up. Calls end after {MAX_CALL_SECONDS / 60} minutes.
                </p>
                {/* A saved or linked code collapses to one line, unless it was rejected. */}
                {(codeSaved || linkCode) && accessCode && !/access code/i.test(error) ? (
                  <p className="code-saved">
                    <Icon name="check" /> Access code saved
                    <button type="button" className="text-button" onClick={() => setCodeSaved(false)}>
                      Change
                    </button>
                  </p>
                ) : (
                  <div className="field">
                    <span className="field-label" id="code-label">
                      Access code
                    </span>
                    <SecretInput value={accessCode} onChange={setAccessCode} label="Access code" describedBy="code-help" />
                    <span id="code-help" className="hint">
                      Remembered on this device.
                    </span>
                  </div>
                )}
                {!savedOffer && !regradeMode && (
                  <p className="soft-warning">
                    <Icon name="alert" /> No offer saved, so objections will be more generic.
                  </p>
                )}
                {regradeMode ? (
                  <Regrade onGrade={gradeSaved} />
                ) : (
                  <button className="button accent block start-button" type="submit" disabled={phase === 'connecting'}>
                    <Icon name="phone" />
                    {phase === 'connecting' ? 'Dialing…' : 'Start call'}
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
              <OfferEditor offer={offer} savedOffer={savedOffer} onChange={setOffer} onSave={saveOffer} compact />
            </section>

            <section className="card setting">
              <div className="setting-text">
                <h2>Access code</h2>
                <p>The code you were given to use Closer Coach. You need it to start a call.</p>
              </div>
              <div className="setting-control">
                <SecretInput value={accessCode} onChange={setAccessCode} label="Access code" />
                <div className="offer-foot">
                  <span />
                  <button
                    className="button secondary small-button"
                    onClick={() => {
                      store(CODE_KEY, accessCode)
                      setCodeSaved(Boolean(accessCode))
                      notify('Access code saved')
                    }}
                  >
                    Save code
                  </button>
                </div>
              </div>
            </section>

            {loadSample && (
              <section className="card setting">
                <div className="setting-text">
                  <h2>Sample calls</h2>
                  <p>Fills the dashboard with made-up calls for previewing. Only shown while developing.</p>
                </div>
                <div className="setting-control end">
                  <button
                    className="button secondary"
                    onClick={async () => {
                      setHistory(await loadSample())
                      notify('Sample calls loaded')
                    }}
                  >
                    Load sample calls
                  </button>
                </div>
              </section>
            )}

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
