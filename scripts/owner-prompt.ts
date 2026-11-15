// Prints the full owner instructions for a scenario, for reviewing what the
// voice model is told. Uses the sample contractor businesses.
//   npx tsx scripts/owner-prompt.ts           (one random scenario)
//   npx tsx scripts/owner-prompt.ts 482913    (one specific scenario number)
import { buildOwnerInstructions } from '../amplify/functions/session-token/ownerPrompt'
import { SAMPLE_CONTEXT } from '../amplify/functions/session-token/sampleBusinesses'
import { buildScenario, pickScenario } from '../amplify/functions/session-token/scenario'

export const SAMPLE_OFFER = `What I sell: Missed-call text-back: every missed call gets an instant text so the customer doesn't call someone else
Who I sell to: Contractors: plumbers, electricians, roofers
Price: $97/month
Terms: No contract, 14-day free trial`

const arg = Number(process.argv[2])
const s = arg ? buildScenario(arg, SAMPLE_CONTEXT) : pickScenario({ offer: SAMPLE_CONTEXT })
console.log(`Scenario #${s.id}: ${s.owner.name}, ${s.personality.label}, ${s.situation}\n`)
console.log(buildOwnerInstructions(s, SAMPLE_OFFER))
