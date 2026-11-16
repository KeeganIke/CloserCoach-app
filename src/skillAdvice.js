// General advice for each scored skill, shown in "Next focus" on the progress page.
// It's about the skill, not one call, so it works whatever the rep sells.

const DELIVERY = {
  habit: 'Answer the question that was asked in one or two sentences, then stop.',
  steps: [
    'Lead with the answer, then give one supporting detail.',
    'If the owner asks three things, answer each one in its own short sentence.',
    'When you need a second to think, pause instead of filling it with "um" or "like".',
  ],
  tryLine: "Short answer: it's $50 a month with no contract. Want me to explain what that covers?",
}

export const SKILL_ADVICE = {
  opening: {
    habit: 'Say who you are and give one specific reason this business should care, in two sentences.',
    steps: [
      'Name their kind of business and a problem common to it.',
      'Ask for 30 seconds instead of launching into the pitch.',
      'If they say they are busy, promise to be quick and keep that promise.',
    ],
    tryLine: "Hi, this is Sam with Brightside. I work with shops like yours that lose calls while they're out on jobs. Do you have 30 seconds?",
  },
  discovery: {
    habit: 'Ask before you pitch, and follow every answer with one more question.',
    steps: [
      'Start open: ask how they handle it today.',
      'When they name a problem, ask how often it happens and what it costs them.',
      'If they already have something, ask what they like about it and what they would change.',
    ],
    tryLine: 'How are you handling that today? And how often does it end up costing you a job?',
  },
  solution_fit: {
    habit: 'Tie what you sell to something the owner told you, in their words.',
    steps: [
      'Repeat back the problem they named before you pitch.',
      'Name one feature and the result it gives for that problem, not a list of features.',
      'Check that it lands: ask whether that would help with what they described.',
    ],
    tryLine: 'You said the same questions eat up your afternoons. This answers them before people call, so the phone rings less for the basics.',
  },
  listening: {
    habit: 'Let what the owner just said change what you say next.',
    steps: [
      'Acknowledge their point in a few words before you respond.',
      'When they push back or say they are busy, change course instead of sticking to your script.',
      'Bring up details they gave you later in the call.',
    ],
    tryLine: "That makes sense, you're already booked. So more calls isn't the goal. What would make the calls you do get easier?",
  },
  clarity: DELIVERY,
  delivery: DELIVERY,
  objection_handling: {
    habit: "Acknowledge the concern, ask what's behind it, then answer that.",
    steps: [
      "Don't argue or rush past it. Show you heard it first.",
      'Ask one question to find the real worry, like price versus whether it will pay off.',
      'Answer that worry specifically, then check whether it settled it.',
    ],
    tryLine: "Fair enough. When you say it's not in the budget, is it the monthly cost or not being sure it'll pay for itself?",
  },
  closing: {
    habit: 'Ask for a small, specific next step: a day, a time and how long.',
    steps: [
      'Ask once the owner has shown real interest, not before.',
      'Offer two times instead of "whenever works for you".',
      'Repeat the day and time back before you hang up.',
    ],
    tryLine: 'Would 15 minutes on Thursday at 10 or Friday at 2 work to walk you through it?',
  },
}
