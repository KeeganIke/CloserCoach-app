// Made-up graded calls behind "Show sample scores", so someone without calls yet
// (like a judge) can see what the dashboard, progress and analytics look like.
// Scores move up and down and each report agrees with itself. They are labeled
// as samples in the app, and removed when the first real call is saved.
import { loadHistory } from './history.js'

const OWNERS = [
  { name: 'Dave', business: "Dave's Auto Repair", detail: 'a 3-bay auto shop with 4 mechanics' },
  { name: 'Maria', business: 'Bella Cucina', detail: 'a family Italian restaurant, about 40 seats' },
  { name: 'Tom', business: 'Summit Roofing', detail: 'a roofing company with 2 crews' },
  { name: 'Linda', business: 'Bright Smiles Dental', detail: 'a dental practice with 2 dentists' },
  { name: 'Mike', business: 'Iron Works Gym', detail: 'an independent gym with about 300 members' },
]

// [id, name, weight, how strong this rep usually is at it]
const CATS = [
  ['opening', 'Opening and Attention', 10, 0.6],
  ['discovery', 'Pain Discovery', 20, 0],
  ['solution_fit', 'Solution Fit', 15, -0.7],
  ['listening', 'Listening and Adaptability', 10, 0.1],
  ['objection_handling', 'Objection Handling', 20, -0.3],
  ['closing', 'Closing and Next Step', 15, 0.2],
  ['clarity', 'Clear and Concise', 7, 0],
  ['delivery', 'Filler Words', 3, 0.5],
]
const PERCENT = { 4: 100, 3: 80, 2: 60, 1: 30, 0: 0 }
const band = (s) => (s >= 90 ? 'Elite' : s >= 80 ? 'Strong' : s >= 70 ? 'Developing' : s >= 60 ? 'Needs Improvement' : 'Poor')

// What the coach says about each skill at each rating (4 = best).
const NOTES = {
  opening: {
    4: 'Gave a clear reason for the call in the first ten seconds and asked for permission to continue.',
    3: 'Clear opener, but it ran a little long before getting to why you called.',
    2: 'Jumped into the pitch before the owner agreed to keep talking.',
    1: 'Opened with a script that sounded like every other sales call.',
  },
  discovery: {
    4: 'Asked open questions and followed up until the owner named a real problem.',
    3: 'Found one problem, but moved on before learning what it costs them.',
    2: 'Asked one question, then went straight to the pitch.',
    1: 'Pitched without asking about the business at all.',
  },
  solution_fit: {
    4: 'Tied every benefit back to the problem the owner described.',
    3: 'Connected the offer to their problem once, then drifted into general features.',
    2: 'Described the offer in general terms that could fit any business.',
    1: 'The pitch had nothing to do with what the owner told you.',
  },
  listening: {
    4: 'Picked up on what the owner said and changed course to match it.',
    3: 'Mostly responded to the owner, but talked over one of their concerns.',
    2: 'Kept to your script even after the owner hinted at a different problem.',
    1: 'Ignored what the owner said and repeated the pitch.',
  },
  objection_handling: {
    4: 'Acknowledged each concern and answered it with something specific.',
    3: 'Handled most pushback well, but one answer was vague.',
    2: 'Got defensive on the main objection and did not resolve it.',
    1: 'Dropped the conversation as soon as the owner pushed back.',
  },
  closing: {
    4: 'Asked for a specific day and time and confirmed it.',
    3: 'Asked for a meeting, but left the time open.',
    2: 'Ended with "I will send you some info" instead of a next step.',
    1: 'Never asked for a next step.',
  },
  clarity: {
    4: 'Short, plain answers the owner could follow.',
    3: 'Mostly clear, with one long-winded explanation.',
    2: 'Several answers ran long and lost the owner.',
    1: 'Hard to follow; the main point got buried.',
  },
  delivery: {
    4: 'Almost no filler words.',
    3: 'A few filler words, not distracting.',
    2: 'Filler words in most answers.',
    1: 'Filler words made you sound unsure.',
  },
}

const TIPS = {
  opening: ['Say why you are calling in one sentence, then ask if they have thirty seconds.', 'Hey, this is Keegan. I help local shops get more calls from Google. Got thirty seconds?'],
  discovery: ['Ask one follow-up about what the problem costs them before you pitch.', 'How many calls would you say you miss in a busy week?'],
  solution_fit: ['Repeat their problem back, then explain how your offer fixes that one thing.', 'You said slow weeks hurt. This is built to fill exactly those weeks.'],
  listening: ['When they mention a concern, stop and ask about it before going on.', 'You mentioned getting burned before. What happened there?'],
  objection_handling: ['Acknowledge the concern, then answer it with one specific fact.', 'Fair question. It is $77 a month with no contract, so you can stop anytime.'],
  closing: ['Offer two specific times instead of asking if they are interested.', 'Would Tuesday at 10 or Thursday at 2 work better for a quick look?'],
  clarity: ['Keep each answer to two sentences and stop.', ''],
  delivery: ['Pause instead of saying "um" while you think.', ''],
}

const STRENGTHS = {
  opening: 'Strong, confident opener',
  discovery: 'Asked good questions about their business',
  solution_fit: 'Tied the offer to their actual problem',
  listening: 'Adjusted to what the owner said',
  objection_handling: 'Calm, specific answers to pushback',
  closing: 'Asked for a clear next step',
  clarity: 'Kept answers short and clear',
  delivery: 'Sounded confident with few filler words',
}

const WEAKNESSES = {
  opening: 'Opener took too long to get to the point',
  discovery: 'Pitched before finding out what was wrong',
  solution_fit: 'Pitch stayed generic instead of matching their problem',
  listening: 'Talked past one of the owner’s concerns',
  objection_handling: 'Left the main objection unresolved',
  closing: 'Ended without a specific next step',
  clarity: 'Some answers ran long',
  delivery: 'Too many filler words',
}

const OBJECTIONS = [
  ['We already have a website.', "Makes sense. How many new customers would you say it brings in a month?"],
  ['How much is this going to cost me?', "It's $77 a month, no contract. If it brings in one extra job a month, it pays for itself."],
  ['Just send me an email.', 'I can. So I send the right thing, are slow weeks or missed calls the bigger headache for you?'],
  ["I've been burned by this kind of thing before.", 'That happens a lot. What went wrong last time? I want to make sure this is different.'],
  ["I'm pretty busy right now.", "I'll be quick. One question, and if it's not a fit I'll let you go."],
]

// Small seeded random numbers so the sample set is the same every time.
function random(seed) {
  let t = seed
  return () => {
    t = (t * 1664525 + 1013904223) % 4294967296
    return t / 4294967296
  }
}

function sampleReport(i, level, rand) {
  const categories = CATS.map(([id, name, weight, bias]) => {
    const rating = String(Math.max(1, Math.min(4, Math.round(level + bias + (rand() - 0.5) * 1.2))))
    const improve = rating !== '4'
    return {
      id,
      name,
      weight,
      maxPoints: weight,
      rating,
      earnedPoints: (weight * PERCENT[rating]) / 100,
      rationale: NOTES[id][rating],
      whatHappened: improve ? NOTES[id][rating] : '',
      improvement: improve ? TIPS[id][0] : '',
      tryLine: improve ? TIPS[id][1] : '',
    }
  })
  const overallScore = Math.round(categories.reduce((s, c) => s + c.earnedPoints, 0))
  // Strengths only from top-rated skills, weaknesses only from skills below 4,
  // so a skill at 100% never shows up as something to improve.
  const ranked = [...categories].sort((a, b) => b.rating - a.rating || b.weight - a.weight)
  const strengths = ranked.filter((c) => c.rating >= 3).slice(0, 2)
  const weaknesses = categories
    .filter((c) => c.rating < 4)
    .sort((a, b) => a.rating - b.rating || a.earnedPoints - a.maxPoints - (b.earnedPoints - b.maxPoints))
    .slice(0, 2)
  const weakest = weaknesses[0]

  const roll = rand()
  const status =
    overallScore >= 85
      ? roll < 0.85 ? 'meeting_booked' : 'follow_up_agreed'
      : overallScore >= 75
        ? roll < 0.5 ? 'meeting_booked' : 'follow_up_agreed'
        : overallScore >= 65
          ? roll < 0.5 ? 'follow_up_agreed' : 'no_meeting'
          : roll < 0.5 ? 'no_meeting' : 'declined'

  const handling = Number(categories.find((c) => c.id === 'objection_handling').rating)
  const count = 1 + Math.floor(rand() * 3)
  const objections = Array.from({ length: count }, (_, k) => {
    // Better objection handling means more objections land.
    const roll = rand()
    const works = { 4: 0.95, 3: 0.75, 2: 0.4, 1: 0.1 }[handling]
    const verdict = roll < works ? 'worked' : roll < works + (1 - works) / 2 ? 'mixed' : 'fell_flat'
    const [objection, better] = OBJECTIONS[(i + k * 2) % OBJECTIONS.length]
    return { objection, yourResponse: '', verdict, why: '', betterLine: verdict === 'worked' ? '' : better }
  })

  return {
    overallScore,
    performanceGrade: band(overallScore),
    summary: `${strengths[0] ? STRENGTHS[strengths[0].id] : 'A steady call'}, but ${weakest ? WEAKNESSES[weakest.id].charAt(0).toLowerCase() + WEAKNESSES[weakest.id].slice(1) : 'there is still room to sharpen it'}.`,
    outcome: { status },
    focusNextCall: weakest ? TIPS[weakest.id][0] : 'Keep doing what worked and try a tougher prospect.',
    categories,
    whatWorked: strengths.map((c) => ({ point: STRENGTHS[c.id], quote: '' })),
    whatFellFlat: weaknesses.map((c) => ({ point: WEAKNESSES[c.id], quote: '' })),
    objections,
    hidden: {
      situation: 'has_provider',
      problems: ['new customers mostly come from word of mouth, which has slowed', 'nobody answers the phone after 5pm'],
      providerWeakness: 'has not been updated in two years',
      concerns: ['got burned by a contract before', 'not sure it pays for itself'],
      personality: ['busy', 'skeptical'],
    },
    hiddenCoaching: 'They were open to it but worried about getting locked into a contract.',
  }
}

export default function loadSampleHistory() {
  const rand = random(7)
  const count = 30
  const calls = Array.from({ length: count }, (_, i) => {
    const daysAgo = (count - 1 - i) * 2 + (i % 3 === 0 ? 1 : 0)
    // A slow upward trend with real swings from call to call.
    const level = 2.2 + i * 0.03 + (rand() - 0.5) * 1.6
    return {
      id: `sample-${i}`,
      date: new Date(Date.now() - daysAgo * 86400000).toISOString(),
      persona: OWNERS[(i * 3) % OWNERS.length],
      offer: '',
      report: sampleReport(i, level, rand),
      lines: [
        { role: 'assistant', text: 'Hello, this is the shop.' },
        { role: 'user', text: 'Hey, this is a sample call for previewing the app.' },
      ],
    }
  }).reverse()
  const all = [...calls, ...loadHistory().filter((c) => !c.id.startsWith('sample-'))]
  try {
    localStorage.setItem('closer-coach-history', JSON.stringify(all))
  } catch {
    // Preview only.
  }
  return all
}
