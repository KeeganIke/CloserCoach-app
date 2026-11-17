// Test calls for tuning the grader (run with scripts/grader-eval/run.ts).
// Each category in the rubric has one call that is clearly bad at it and one that is
// clearly good at it, plus whole-call and edge cases. All of these are made up.
// Real practice calls (with real people's names) live in real-calls.ts, which is
// kept out of the public repo; run.ts adds them when the file is present.
// "expect" is what a correct grade looks like. Ratings are the rubric's 0-4 scale.

import type { Line } from '../../amplify/functions/coach-report/grading'

export type Range = [number, number]
export type Expect = {
  ratings?: Partial<Record<string, Range | 'na' | 'na_or_ok'>> // 'na_or_ok': N/A, or 2 and up
  score?: Range
  outcome?: string[]
  termsFlagged?: boolean // a weakness says a promised term isn't in the offer
  noZeros?: boolean
  tooShort?: boolean // the grader should refuse: "too short to grade"
}
export type TestCall = {
  id: string
  title: string
  persona: { name: string; business: string; detail: string }
  offer: string
  lines: Line[]
  expect: Expect
}

// "R: ..." is the rep, "O: ..." is the owner.
export const t = (s: string): Line[] =>
  s
    .trim()
    .split('\n')
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => ({ role: row.startsWith('R:') ? 'user' : 'assistant', text: row.slice(2).trim() }))

export const WEB = `My company: Eichert Digital
What I sell: Websites for local businesses, built and kept updated for you
Who I sell to: Local service businesses
Price: $50/month`
export const WEB_GUARANTEE = `${WEB}
Terms: No contract. If you're not satisfied after the first month, you get your money back.`

const tom = { name: 'Tom', business: 'Summit Roofing', detail: 'a roofing company with 2 crews' }
const dave = { name: 'Dave', business: "Dave's Auto Repair", detail: 'a 3-bay auto shop with 4 mechanics' }
const linda = { name: 'Linda', business: 'Bright Smiles Dental', detail: 'a dental practice with 2 dentists' }
const mike = { name: 'Mike', business: 'Iron Works Gym', detail: 'an independent gym with about 300 members' }
const maria = { name: 'Maria', business: 'Green Leaf Landscaping', detail: 'a landscaping company with 6 seasonal workers' }

export const CALLS: TestCall[] = [
  // ---------- Opening ----------
  {
    id: 'opening-bad',
    title: 'Opening: no name, no reason, straight into a pitch',
    persona: tom,
    offer: WEB,
    lines: t(`
      O: Summit Roofing, this is Tom.
      R: Yeah, so we do websites, fifty bucks a month, you want one?
      O: Who is this?
      R: It's websites. Fifty a month and we handle everything.
      O: I didn't catch your name or where you're calling from.
      R: Oh, sorry. Sam, Eichert Digital. So how do most of your roofing jobs come in right now?
      O: Mostly referrals and insurance work.
      R: Got it. When a homeowner hears your name from a neighbor, what do they find when they look you up?
      O: Honestly, not much. An old Facebook page.
      R: That's the gap I help with. Would fifteen minutes Thursday at 10 work to show you an example?
      O: I'll pass for now. Thanks.
    `),
    expect: { ratings: { opening: [0, 1] } },
  },
  {
    id: 'opening-good',
    title: 'Opening: name, specific reason, asks for 30 seconds',
    persona: tom,
    offer: WEB,
    lines: t(`
      O: Summit Roofing, this is Tom.
      R: Hi Tom, this is Sam with Eichert Digital. I work with roofers around here whose homeowners look them up after a referral and can't find photos or reviews. Do you have thirty seconds?
      O: I'm about to get on a roof, so make it quick.
      R: I'll be quick. Do you have a website right now?
      O: No, just a Facebook page.
      R: Okay. We build websites and keep them updated for fifty a month.
      O: I don't really need one. Most of my work is referrals.
      R: Fair enough. Can I send you some info?
      O: Sure, whatever. I've got to go.
    `),
    expect: { ratings: { opening: [4, 4] } },
  },

  // ---------- Pain Discovery ----------
  {
    id: 'discovery-bad',
    title: 'Discovery: one closed question, then pitches over "we already have one"',
    persona: dave,
    offer: WEB,
    lines: t(`
      O: Dave's Auto Repair, this is Dave.
      R: Hi Dave, this is Sam with Eichert Digital. I help auto shops get found online. Got a minute?
      O: A minute.
      R: Do you have a website?
      O: Yeah, my nephew made us one a few years back.
      R: Great, well, we build modern websites that look great on phones, we keep them updated, and it's only fifty a month with no contract.
      O: Like I said, I've already got one.
      R: Totally understand. Ours would just be more modern. Could we do a quick fifteen-minute call Thursday at 2 so I can show you an example?
      O: No, I'm good. Thanks.
    `),
    expect: { ratings: { discovery: [0, 1] } },
  },
  {
    id: 'discovery-good',
    title: 'Discovery: open questions with follow-ups on how often and what it costs',
    persona: dave,
    offer: WEB,
    lines: t(`
      O: Dave's Auto Repair, this is Dave.
      R: Hi Dave, Sam with Eichert Digital. I work with local auto shops on how customers find them. Have you got a minute?
      O: Go ahead.
      R: When someone new needs a repair, how do they usually end up calling you?
      O: Word of mouth mostly. Some find us on Google.
      R: And when they find you on Google, what do they see?
      O: Our hours, a couple of reviews. My nephew made a site but it's out of date.
      R: Out of date how?
      O: Wrong hours, old prices. People call to ask stuff that should be on there.
      R: How often does that happen in a week?
      O: Ten, fifteen calls maybe. My guys stop working to answer them.
      R: So that's real time off the cars. Has it ever cost you a job, someone going elsewhere because the info was wrong?
      O: Probably. People show up on Sunday and we're closed.
      R: Got it. We keep sites like that updated for you, fifty a month. Could I show you what yours could look like?
      O: Maybe. Send me something.
      R: Sure. Can I call you Friday morning to walk through it?
      O: Fine, Friday morning.
    `),
    expect: { ratings: { discovery: [4, 4] } },
  },

  // ---------- Solution Fit ----------
  {
    id: 'fit-bad',
    title: 'Solution Fit: keeps pushing "more leads" after the owner says he is fully booked',
    persona: tom,
    offer: WEB,
    lines: t(`
      O: Summit Roofing, this is Tom.
      R: Hi Tom, Sam with Eichert Digital. I work with roofers on their websites. Got a minute?
      O: One minute.
      R: How do new jobs come in for you right now?
      O: Referrals. Honestly we're booked out six weeks. I don't need more work.
      R: What takes up the most of your time outside the jobs themselves?
      O: Homeowners calling to ask where we are on their schedule.
      R: Got it. A new website would bring you a lot more leads, way more traffic and more jobs coming in.
      O: I just told you I don't need more jobs.
      R: Right, but more leads means you can pick the best ones. Our sites get tons of traffic.
      O: Not interested. Thanks.
    `),
    expect: { ratings: { solution_fit: [0, 1] } },
  },
  {
    id: 'fit-good',
    title: "Solution Fit: ties one feature to the owner's exact problem and checks it lands",
    persona: tom,
    offer: WEB,
    lines: t(`
      O: Summit Roofing, this is Tom.
      R: Hi Tom, Sam with Eichert Digital. I build websites for roofers. Got a minute?
      O: One minute.
      R: How do new jobs come in for you right now?
      O: Referrals. We're booked out six weeks, I don't need more work.
      R: Makes sense. What eats your time outside the jobs?
      O: Homeowners calling to ask where they are on the schedule.
      R: So the calls aren't about new work, they're people already booked wanting an update. A simple page on your site where they can see the schedule and what happens next would cut a lot of those. Would that help?
      O: If it actually cut the calls, yeah. What's it cost?
      R: Fifty a month, and I keep it updated for you.
      O: Huh. Okay.
      R: Want to talk through it for fifteen minutes Thursday at 4?
      O: Thursday at 4 is fine.
    `),
    expect: { ratings: { solution_fit: [4, 4] } },
  },

  // ---------- Listening ----------
  {
    id: 'listening-bad',
    title: 'Listening: ignores "I am with a customer" and "price is the issue"',
    persona: linda,
    offer: WEB,
    lines: t(`
      O: Bright Smiles Dental, this is Linda.
      R: Hi Linda, Sam with Eichert Digital. I build websites for dental offices. Do you have a minute?
      O: I'm with a patient right now, can you make it quick?
      R: Sure. So I wanted to tell you about our websites. They're mobile friendly, they have online booking, and we handle the updates.
      O: Okay, but we're watching every dollar right now. Price is the issue for me.
      R: Online booking is great because patients can book any time, even at night.
      O: I heard you. What does it cost?
      R: And we also do the updates, so you never have to touch it.
      O: You're not answering me. I have to go.
      R: Sounds good, could we set up a call Wednesday at 1?
      O: No. Bye.
    `),
    expect: { ratings: { listening: [0, 1] } },
  },
  {
    id: 'listening-good',
    title: "Listening: changes course on each signal and reuses the owner's details",
    persona: linda,
    offer: WEB,
    lines: t(`
      O: Bright Smiles Dental, this is Linda.
      R: Hi Linda, Sam with Eichert Digital. I build websites for dental offices. Do you have a minute?
      O: I'm with a patient right now, can you make it quick?
      R: I'll keep it to twenty seconds, or I can call back after lunch. Which is better?
      O: Twenty seconds is fine.
      R: Thanks. Is your website doing what you need it to?
      O: It's fine. My daughter set it up. Money's tight though, I'm watching every dollar.
      R: Then I won't pitch you something big. It's fifty a month, and since your daughter already set it up, I'd only fix what isn't working, not start over.
      O: That's more reasonable than I expected.
      R: Since you're with a patient, can I call you back at 1 for five minutes to hear what's not working?
      O: One works.
    `),
    expect: { ratings: { listening: [4, 4] } },
  },

  // ---------- Objection Handling ----------
  {
    id: 'objection-bad',
    title: 'Objections: argues with "we already have someone" and brushes past price',
    persona: mike,
    offer: WEB,
    lines: t(`
      O: Iron Works Gym, Mike speaking.
      R: Hi Mike, Sam with Eichert Digital. I build websites for gyms. Do you have a minute?
      O: Sure, quick.
      R: How are new members finding you these days?
      O: Instagram mostly. And we already have a guy who does our website.
      R: Honestly, most of those guys overcharge and do a bad job. Ours are just better.
      O: He's been great for five years.
      R: Yeah, but he's probably not doing it right. Anyway, it's only fifty a month.
      O: That's more than I pay him.
      R: Well, you get what you pay for.
      O: Okay, I'm done here. Not interested.
      R: Alright, thanks.
    `),
    expect: { ratings: { objection_handling: [0, 1] } },
  },
  {
    id: 'objection-good',
    title: 'Objections: acknowledges, asks what is behind it, answers that',
    persona: mike,
    offer: WEB,
    lines: t(`
      O: Iron Works Gym, Mike speaking.
      R: Hi Mike, Sam with Eichert Digital. I build websites for gyms. Do you have a minute?
      O: Sure, quick.
      R: How are new members finding you these days?
      O: Instagram mostly. And we already have a guy who does our website.
      R: Good, sounds like you're covered. How long have you worked with him?
      O: Five years. He's fine.
      R: If you could change one thing about how it works with him, what would it be?
      O: He's slow. A class schedule change takes him a week.
      R: That makes sense. With us, you send a text and it's updated within a day. You'd keep everything he built.
      O: Fifty a month is more than I pay him though.
      R: Fair. Is it the monthly cost itself, or not being sure the faster updates are worth it?
      O: Whether it's worth it.
      R: How many members ask about a class that's not on the site anymore?
      O: A few a week, it's annoying.
      R: Then let's see if it's worth it before you decide. Fifteen minutes Tuesday at 11?
      O: Tuesday at 11 works.
    `),
    expect: { ratings: { objection_handling: [3, 4] } },
  },

  // ---------- Closing ----------
  {
    id: 'closing-bad',
    title: 'Closing: owner is interested, rep never asks for a next step',
    persona: maria,
    offer: WEB,
    lines: t(`
      O: Green Leaf Landscaping, this is Maria.
      R: Hi Maria, Sam with Eichert Digital. I build websites for landscapers. Got a minute?
      O: Sure.
      R: How do new customers find you?
      O: Mostly yard signs and referrals.
      R: When they look you up after seeing a sign, what do they find?
      O: Nothing, really. We don't have a site.
      R: So some of them probably move on to someone they can look up.
      O: Yeah, I've thought about that.
      R: We build sites like that and keep them updated, fifty a month.
      O: Okay, that actually sounds useful.
      R: Cool. Alright, well, thanks for your time, have a good one.
      O: Oh. Okay, bye.
    `),
    expect: { ratings: { closing: [0, 1] } },
  },
  {
    id: 'closing-good',
    title: 'Closing: two specific times, confirms the details',
    persona: maria,
    offer: WEB,
    lines: t(`
      O: Green Leaf Landscaping, this is Maria.
      R: Hi Maria, Sam with Eichert Digital. I build websites for landscapers. Got a minute?
      O: Sure.
      R: Do you have a website right now?
      O: No, we don't.
      R: We build them and keep them updated, fifty a month.
      O: Okay, that actually sounds useful.
      R: Would fifteen minutes Thursday at 10 or Friday at 2 work to show you an example?
      O: Friday at 2.
      R: Great, Friday at 2, fifteen minutes. I'll call this number. Does that work?
      O: Yep, talk then.
    `),
    expect: { ratings: { closing: [4, 4] } },
  },

  // ---------- Delivery (clarity from the model, filler words from code) ----------
  {
    id: 'delivery-bad',
    title: 'Delivery: rambling, garbled lines, lots of filler',
    persona: dave,
    offer: WEB,
    lines: t(`
      O: Dave's Auto Repair, this is Dave.
      R: Um, hi, uh, this is Sam, um, from Eichert Digital, and, like, we do, um, websites and stuff for, uh, businesses.
      O: Okay. What about them?
      R: So, um, like, basically, uh, what we do is we, like, make the website and then, um, you know, we kind of, like, keep it updated and stuff, and, uh, it's like a monthly thing, um, and a lot of shops, like, they don't really, uh, have that, so, um, yeah, that's kind of, like, the idea, I guess.
      O: How much?
      R: Um, so it's, uh, the thing is, like, it depends, well, no, it's fifty, um, a month, I think, yeah.
      O: You think?
      R: That's for the. Um. See the other one.
      O: I don't follow you.
      R: Uh, like, could we, um, maybe talk, uh, Thursday or something, like, at 2?
      O: I don't think so. I've got cars to fix.
    `),
    expect: { ratings: { clarity: [0, 1], delivery: [0, 1] } },
  },
  {
    id: 'delivery-good',
    title: 'Delivery: short, clear answers, no filler',
    persona: dave,
    offer: WEB,
    lines: t(`
      O: Dave's Auto Repair, this is Dave.
      R: Hi Dave, Sam with Eichert Digital. We build and update websites for local shops.
      O: Okay. What about them?
      R: A good site answers hours and prices so your guys don't have to.
      O: How much?
      R: Fifty a month, no contract.
      O: What do I get for that?
      R: The site, hosting, and any updates you text me, done within a day.
      O: I don't know. We're busy.
      R: Understood. Can I check back next month?
      O: Sure, whatever.
    `),
    expect: { ratings: { clarity: [4, 4], delivery: [4, 4] } },
  },

  // ---------- Whole calls ----------
  {
    id: 'excellent',
    title: 'Excellent all-around call',
    persona: mike,
    offer: WEB,
    lines: t(`
      O: Iron Works Gym, Mike speaking.
      R: Hi Mike, Sam with Eichert Digital. I work with independent gyms whose members check the site for class times. Have you got thirty seconds?
      O: Sure, go.
      R: When someone wants to try a class, where do they look?
      O: Instagram, and our website, which is a mess.
      R: A mess how?
      O: The schedule's wrong half the time. My guy takes a week to change it.
      R: How often does a member show up for a class that isn't running?
      O: A couple of times a week. They get annoyed, some cancel.
      R: What does a cancelled membership cost you?
      O: Fifty-five a month each.
      R: So one lost member a month is more than what I'd charge. It's fifty a month, I keep the schedule current within a day of your text, and you keep everything your guy built.
      O: I'm not sure I want to switch on him.
      R: That's fair. Is it loyalty, or worry the switch is a hassle?
      O: Mostly the hassle.
      R: I'd do the move and keep the same look. You wouldn't touch anything. Would Tuesday at 11 or Wednesday at 3 work for fifteen minutes to see it?
      O: Wednesday at 3.
      R: Wednesday at 3, fifteen minutes, I'll call this number. Thanks Mike.
      O: Talk then.
    `),
    expect: { score: [85, 100], noZeros: true },
  },
  {
    id: 'terrible',
    title: 'Terrible all-around call',
    persona: linda,
    offer: WEB,
    lines: t(`
      O: Bright Smiles Dental, this is Linda.
      R: Hey, so you need a new website.
      O: Who is this?
      R: Websites. Ours get you like a hundred new patients.
      O: We're fine, thanks.
      R: You're not fine, your site looks old.
      O: Excuse me?
      R: Just sign up, it's cheap.
      O: I'm hanging up.
      R: Wait, wait, how about a meeting tomorrow?
      O: No. Bye.
    `),
    expect: { score: [0, 35], outcome: ['declined', 'no_meeting'] },
  },

  // ---------- Edge cases ----------
  {
    id: 'decent',
    title: 'Decent all-around call: does most things fine, nothing great',
    persona: tom,
    offer: WEB,
    lines: t(`
      O: Summit Roofing, Tom speaking.
      R: Hi Tom, this is Sam with Eichert Digital. I help local service businesses with their websites. Do you have a quick minute?
      O: A minute, sure. What's this about?
      R: I was looking at roofing companies around here. Do you have a website right now?
      O: We have one. My nephew made it a few years back.
      R: Okay. Do you get many customers from it?
      O: Some. Most of our work is referrals and insurance jobs.
      R: Got it. Is there anything about the site you wish worked better?
      O: I don't know. People still call to ask if we do gutters, so maybe it's not clear enough.
      R: That makes sense. We build modern websites that look professional, work on phones, show up on Google, and have a contact form, and we keep them updated for you.
      O: What does that cost?
      R: It's $50 a month, and that includes the updates.
      O: Fifty a month adds up. The site I have is already paid for.
      R: I understand. A lot of owners feel that way at first. It's less than one service call a month, and you wouldn't have to deal with updates yourself.
      O: Maybe. I'd have to see it.
      R: Sure. Could I show you an example sometime next week?
      O: I guess. Tuesday's usually slower.
      R: Great, I'll give you a call Tuesday. Thanks, Tom.
    `),
    expect: {
      ratings: { opening: [2, 3], discovery: [2, 3], solution_fit: [2, 3], objection_handling: [2, 3], closing: [2, 4] },
      score: [70, 80],
      outcome: ['meeting_booked', 'follow_up_agreed'],
    },
  },
  {
    id: 'hangup-unanswered',
    title: 'Owner hangs up with his question unanswered: closing is N/A, and the better line uses his numbers',
    persona: dave,
    offer: WEB,
    lines: t(`
      O: Dave's Auto Repair, this is Dave.
      R: Hi Dave, this is Sam with Eichert Digital. I build websites for local shops. Got a minute?
      O: I'm under a car, so make it quick.
      R: Do you have a website right now?
      O: No. We've always run on referrals. Never made it a priority.
      R: What if I told you I could make you a custom website for $50 a month and do all the updates? It would get you more customers. Would you be interested?
      O: Fifty a month is a real cost. I need a specific reason it pays for itself for a shop like mine, not just more customers.
      R: Yeah, so...
      O: That's not an answer. How does it pay for itself?
      R: People could find you online and you'd save a lot of time and money.
      O: That doesn't tell me anything. I'm going to pass. Good luck, goodbye.
    `),
    expect: { ratings: { closing: 'na', objection_handling: [0, 1] } },
  },
  {
    id: 'past-clients',
    title: 'Mentions past clients honestly (not in the offer box): not treated as misleading',
    persona: tom,
    offer: WEB,
    lines: t(`
      O: Summit Roofing, this is Tom.
      R: Hi Tom, Sam with Eichert Digital. I build websites for roofers. Got a minute?
      O: A minute.
      R: How do most new jobs find you right now?
      O: Referrals, and some people call off the truck.
      R: When someone hears about you and looks you up, what do they find?
      O: Not much. We don't really have a site.
      R: That's common. I built a site for another roofing crew last spring, and they told me people started calling them after looking up their past jobs online.
      O: Huh. What does it cost?
      R: It's $50 a month, and I keep it updated for you.
      O: Okay. I'd want to see one.
      R: Could I show you an example Thursday at 10?
      O: Thursday at 10 works.
    `),
    expect: { ratings: { solution_fit: [2, 4] }, termsFlagged: false },
  },
  {
    id: 'invented-terms',
    title: 'Invents results and a guarantee that are not in the offer',
    persona: tom,
    offer: WEB,
    lines: t(`
      O: Summit Roofing, this is Tom.
      R: Hi Tom, Sam with Eichert Digital. I build websites for roofers. Got a minute?
      O: A minute.
      R: How do new jobs find you now?
      O: Referrals, mostly.
      R: Our sites bring roofers at least twenty new jobs a month. That's guaranteed, and setup is free.
      O: Twenty a month? From a website?
      R: Every client we have gets that. Guaranteed.
      O: I find that hard to believe.
      R: Let me show you Thursday at 10.
      O: I'll think about it.
    `),
    expect: { ratings: { solution_fit: [0, 1] }, termsFlagged: true },
  },
  {
    id: 'guarantee-in-offer',
    title: 'Promises a refund that IS in the offer, worded differently',
    persona: tom,
    offer: WEB_GUARANTEE,
    lines: t(`
      O: Summit Roofing, this is Tom.
      R: Hi Tom, Sam with Eichert Digital. I build websites for roofers. Got a minute?
      O: A minute.
      R: How do homeowners check you out after a referral?
      O: Facebook, I guess.
      R: We build a simple site with your photos and reviews for fifty a month. If you're not happy after the first month, you get a full refund.
      O: No contract?
      R: No contract.
      O: Hm. Maybe.
      R: Could I show you an example Thursday at 10?
      O: Sure, Thursday at 10.
    `),
    expect: { termsFlagged: false },
  },
  {
    id: 'two-refusals',
    title: 'Asks again after two clear no answers',
    persona: maria,
    offer: WEB,
    lines: t(`
      O: Green Leaf Landscaping, this is Maria.
      R: Hi Maria, Sam with Eichert Digital. I build websites for landscapers. Got a minute?
      O: Quickly.
      R: Do you have a website?
      O: No, and I don't want one right now.
      R: Could we do fifteen minutes Thursday to look at an example?
      O: No, thank you.
      R: What about Friday then?
      O: I said no. Please stop.
      R: Just ten minutes next week, it'll be worth it, I promise.
      O: Goodbye.
    `),
    expect: { ratings: { closing: [0, 1], listening: [0, 1], objection_handling: [0, 1] } },
  },
  {
    id: 'early-hangup',
    title: "Owner hangs up early: too short to grade",
    persona: dave,
    offer: WEB,
    lines: t(`
      O: Dave's Auto Repair, this is Dave.
      R: Hi Dave, Sam with Eichert Digital. I work with local auto shops whose customers look them up before calling. Got thirty seconds?
      O: Not really. What is it?
      R: We build and update websites for shops, fifty a month. Quick question: when someone new looks you up, what do they find?
      O: Look, I'm not interested in anything. I've got a car on the lift.
      R: Understood, I'll let you go. Thanks Dave.
      O: Yep. Bye.
    `),
    expect: { tooShort: true },
  },
]
