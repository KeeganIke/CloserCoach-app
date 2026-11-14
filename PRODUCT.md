# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

One person at a time who is trying to get better at selling, practicing alone before the real call:

- Business students and new salespeople learning to cold-call small business owners.
- People who sell their own services: independent web designers, marketing agency owners, AI automation consultants, freelance service providers, and entrepreneurs.

Their job: rehearse a cold call out loud on their actual offer, find out what went wrong, and come back better next time. Most use it on a laptop with a microphone, between real sales work or classes.

## Product Purpose

Closer Coach lets a rep practice a cold call against a realistic AI small business owner, then get an honest coaching report the moment they hang up. Success is a rep who books more meetings on real calls because they have already heard the objections, found the owner's problem, and asked for the next step in practice.

## Positioning

Built around one individual improving at selling, not a team or a manager's dashboard. The practice is a live voice call with an owner who reacts to the rep's own offer, and the grade comes from a fixed rubric backed by quotes from the call, followed by what the owner was hiding.

## Operating Context

- Built for the CUA Busch School AI Vibe Coding Contest, Fall 2026. Judges review the live app, the public GitHub repo, a 5 to 10 minute demo, and a one-page summary.
- A typical session: save an offer (what you sell and the price), start a call, talk for up to 5 minutes, hang up, read the report, then check progress over time.
- Live app: https://main.d35wias2tzhiw9.amplifyapp.com/ (AWS Amplify).
- Access is gated by a shared access code; there are no user accounts yet.

## Capabilities and Constraints

- Voice call: OpenAI Realtime (gpt-realtime-2.1) over WebRTC. The owner is one of five fixed businesses (Dave's Auto Repair, Bella Cucina, Summit Roofing, Bright Smiles Dental, Iron Works Gym).
- Grading: a weighted rubric scored out of 100. Categories: Opening and Attention, Pain Discovery, Solution Fit, Listening and Adaptability, Objection Handling, Closing and Next Step, and Delivery (Clear and Concise plus Filler Words). The AI rates; code computes the points.
- Reports include objection cards with a better line to say, strengths, areas to improve, and the owner's hidden problems and concerns.
- Call history and progress are saved in the browser only (no server storage yet). Score history across devices waits on a server and sign-in.
- The OpenAI key stays server-side as an Amplify secret; spending is capped.
- Not in the product, by decision: difficulty levels, practice modes, "no fit" calls where the owner has nothing to find.
- Undecided: the business-owner personality rebuild (traits, offer analysis), a possible switch to GPT-Live-1, and per-owner voices.

## Brand Commitments

- Name: Closer Coach.
- Voice: plain, practical, coach-like. Advice is specific and actionable, never vague or flattering.

## Evidence on Hand

- Real practice calls and transcripts made by the creator during development.
- No testimonials, customer logos, usage numbers, or outcome statistics exist. Do not invent them.
- Sample calls in the app are made up and load only in local development.

## Product Principles

1. One rep, one next step: every screen should help the rep know what to do on their next call.
2. Honest over flattering: scores and feedback must match what actually happened on the call, with quotes as evidence.
3. Practice on the real offer: the owner, objections, and advice should fit what the rep actually sells.
4. Realistic, not rigged: owners can be won or lost, and there is always a real problem to uncover.
5. Fast to start: getting from the app to a live call should take seconds.
