// Objection types, shared by the dashboard and the Objections page. Owners word the
// same pushback many ways ("How much is it?", "That's expensive"), so each type
// matches on keywords. Each type also has a general approach and an example line,
// shown until your own calls give the coach something more specific.
export const OBJECTION_TYPES = [
  {
    id: 'info',
    label: 'Send me some info',
    test: /e-?mail|send (me )?(some|over|info|something)|information|brochure/,
    why: 'Usually a polite way to end the call, not a real request.',
    tip: 'Treat it as a brush-off and earn one more question.',
    answer: 'Happy to. So I send you the right thing, how are you getting most of your new customers right now?',
  },
  {
    id: 'trust',
    label: 'Trust and scams',
    test: /scam|trust|burn|how do i know|heard (that|this) before|another one of|legit|sales ?call/,
    why: "They've been let down before and are waiting to see if you're different.",
    tip: "Agree it's a fair worry, ask what happened, then offer proof instead of promises.",
    answer: "That's fair, a lot of people get burned. What happened last time? I'd rather show you exactly what you'd get than ask you to trust me.",
  },
  {
    id: 'contract',
    label: 'Contracts and commitment',
    test: /contract|locked|commit|cancel/,
    why: "They don't want to be stuck paying for something that doesn't work.",
    tip: "Lead with your actual terms. If there's no contract, say it plainly.",
    answer: "Totally fair. There's no contract, so you can stop anytime. That keeps it on me to make it worth it.",
  },
  {
    id: 'price',
    label: 'Price and budget',
    test: /price|cost|expensive|afford|money|budget|\$|how much|pay|cheap/,
    why: "They can't judge the price until they see what it's worth to them.",
    tip: 'Give the price straight, then tie it to the problem they told you about.',
    answer: "It's [your price] a month. If it brought in even one extra customer a month, would that cover it for you?",
  },
  {
    id: 'have',
    label: 'Already have someone',
    test: /already|we have|i have|got (a|someone|somebody|my)|current|nephew|guy who|person who/,
    why: "Switching feels like work, so they'll stay put unless something isn't working.",
    tip: "Don't knock their setup. Ask how well it's working.",
    answer: "Good, that means you know it matters. How's it working for you? Is it bringing in new customers, or mostly just there?",
  },
  {
    id: 'need',
    label: "Don't need it",
    test: /don'?t need|not interested|doing (fine|ok|okay|well)|word of mouth|enough (customers|business|work)|works? fine/,
    why: "They don't see a problem yet, so there's nothing for you to solve.",
    tip: "Look for the slow weeks or the problem they haven't noticed yet.",
    answer: "Glad business is good. Are there slow weeks in the year? That's usually where this helps most.",
  },
  {
    id: 'time',
    label: 'No time right now',
    test: /busy|time|call (me )?back|right now|minute|later/,
    why: 'They will give you a few seconds if you prove it is worth it right away.',
    tip: 'Respect their time and ask for one quick question, not the whole pitch.',
    answer: "I hear you, I'll be quick. One question, and you can tell me if it's worth another minute.",
  },
  {
    id: 'think',
    label: 'Need to think about it',
    test: /think (about|it over)|talk to|partner|wife|husband|sleep on/,
    why: 'Something is still unclear, or someone else has a say.',
    tip: "Find out what's still unclear, or who else has a say.",
    answer: 'Makes sense. What part would you want to think through? Would it help to set a quick time with whoever else decides?',
  },
]

const OTHER = {
  id: 'other',
  label: 'Other pushback',
  why: "Pushback that doesn't fit the usual patterns.",
  tip: 'Acknowledge it, ask one question to understand it, then answer the real concern.',
  answer: "That's a fair point. Can I ask what makes you say that?",
}

export function objectionType(text) {
  const t = (text || '').toLowerCase()
  return OBJECTION_TYPES.find((o) => o.test.test(t)) || OTHER
}

// Every objection across saved calls, grouped by type, newest first.
export function objectionLibrary(calls) {
  const types = new Map([...OBJECTION_TYPES, OTHER].map((t) => [t.id, { ...t, seen: [], missed: 0 }]))
  for (const call of calls) {
    for (const o of call.report.objections || []) {
      const t = types.get(objectionType(o.objection).id)
      t.seen.push({ ...o, call })
      if (o.verdict !== 'worked') t.missed += 1
    }
  }
  return [...types.values()]
}
