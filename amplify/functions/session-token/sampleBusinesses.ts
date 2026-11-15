// A hand-written offer analysis for tests and scripts/sample-owners.ts: what the
// AI might produce for "missed-call text-back, sold to contractors". Includes
// edge cases on purpose: a business with no outside setup (can't be loyal to a
// vendor) and one with only customer problems (can't be fully booked).

import type { Business, OfferContext } from '../shared/offer'

const reasons = {
  price: 'It would be another monthly bill in a business where every expense gets watched.',
  trust: "You've heard plenty of promises from tech companies that didn't pan out.",
  time: 'You are on job sites all day and barely have time to take this call.',
  current: 'Whatever you do now about missed calls works well enough that you rarely think about it.',
  need: "You figure people who really need you will just call back.",
  timing: "It's the middle of the season and you don't want to change anything now.",
  commitment: "You don't want to be locked into another monthly contract.",
  hassle: "You don't want to spend evenings setting up another system.",
  payoff: "You'd want to know how many jobs it actually brings back before paying.",
  reliability: 'If the texts go out wrong or late, it makes the company look bad.',
}

const business = (b: Partial<Business> & Pick<Business, 'type' | 'name' | 'detail'>): Business => ({
  background: 'Started 10 years ago after working for a bigger company; most work comes from repeat customers and referrals.',
  scenes: ['driving between jobs', 'on a job site talking to a customer', 'in the office going over invoices'],
  fit: 'strong',
  setups: [
    { text: 'an answering service picks up when you miss a call', weakness: "they just take a message, and by the time you call back the customer hired someone else", outside: true },
    { text: 'your office manager calls back missed calls when there is time', weakness: 'callbacks happen hours later on busy days', outside: false },
    { text: 'calls forward to your cell phone', weakness: "you can't answer while you're on a ladder or under a house", outside: false },
  ],
  gaps: [
    { text: 'you check voicemail at the end of the day', gap: 'most callers never leave a message and just call the next company' },
    { text: 'you call back whoever you remember', gap: 'missed calls from new customers slip through' },
  ],
  problems: [
    { area: 'customers', text: 'misses calls while on jobs, and those callers hire whoever answers first' },
    { area: 'time', text: 'spends evenings returning calls instead of being home' },
    { area: 'money', text: 'pays for ads that make the phone ring, then loses the calls nobody answers' },
  ],
  reasons,
  ...b,
})

export const SAMPLE_BUSINESSES: Business[] = [
  business({ type: 'plumbing company', name: 'Summit Plumbing', detail: 'a plumbing company with 3 trucks', scenes: ['under a sink finishing a repair', 'driving to an emergency call', 'loading the truck in the morning'] }),
  business({ type: 'electrical contractor', name: 'Brightline Electric', detail: 'an electrical contractor with 4 electricians' }),
  business({
    type: 'hvac company',
    name: 'Northside Heating & Air',
    detail: 'a heating and cooling company with 2 crews',
    toolsConcern: { angle: 'tools', reason: 'You already use a scheduling app and are not sure this would work with it.' },
  }),
  business({
    type: 'roofing company',
    name: 'Ridgeway Roofing',
    detail: 'a roofing company with 2 crews',
    fit: 'partial',
    fitConcern: { angle: 'how_customers_find', reason: 'Most of your jobs come from insurance adjusters and storm canvassing, not phone calls.' },
  }),
  // Every setup is in-house: this owner can never be loyal to an outside vendor.
  business({
    type: 'landscaping company',
    name: 'Greenway Landscaping',
    detail: 'a landscaping company with 6 seasonal workers',
    setups: [
      { text: 'your wife answers the business line from home', weakness: "she can't quote jobs, so callers wait days for an answer", outside: false },
      { text: 'calls forward to your cell phone', weakness: "you can't hear it over the mowers", outside: false },
    ],
  }),
  // Only customer problems: this owner can never be fully booked.
  business({
    type: 'painting company',
    name: 'Fresh Coat Painting',
    detail: 'a painting company with 5 painters',
    problems: [
      { area: 'customers', text: 'misses calls from homeowners asking for quotes' },
      { area: 'customers', text: 'loses spring jobs to companies that call back faster' },
    ],
  }),
]

export const SAMPLE_CONTEXT: OfferContext = { businesses: SAMPLE_BUSINESSES }
