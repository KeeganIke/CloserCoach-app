// Prints sample practice owners in plain English, for reviewing the owner lists.
//   npx tsx scripts/sample-owners.ts          (5 random owners)
//   npx tsx scripts/sample-owners.ts 482913   (one specific scenario number)
// Uses the sample contractor businesses in sampleBusinesses.ts.
import { TRAIT_NAMES, TRAITS } from '../amplify/functions/session-token/owners'
import { SAMPLE_CONTEXT } from '../amplify/functions/session-token/sampleBusinesses'
import { buildScenario, pickScenario, type Scenario } from '../amplify/functions/session-token/scenario'

function describe(s: Scenario) {
  const lines = [
    `#${s.id}  ${s.owner.name}, ${s.owner.business} (${s.owner.detail})`,
    `  Personality: ${s.personality.label}. ${TRAITS.map((t) => `${TRAIT_NAMES[t]} ${s.traits[t]}`).join(', ')}`,
    `  When you call: ${s.scene}`,
    `  ${s.situation === 'has_setup' ? 'Has a setup' : 'No solution yet'}: ${s.setup.text}, but ${s.setup.weakness}`,
    `  Facts: ${s.facts.map((f) => f.text).join(' ')}`,
    `  Problems to find: ${s.problems.join('; ')}`,
    `  Wants: ${s.motivation.join(' ')}`,
    `  Needs before a yes: ${s.needs.join(' ')}`,
    `  Concerns:`,
    ...s.concerns.map(
      (c) =>
        `    - ${c.major ? 'MAJOR' : 'minor'} ${c.typeLabel} (${c.angleLabel}), from ${c.source}\n` +
        `      Reason: ${c.reason}\n      Underneath: ${c.worry}\n      Resolves it: ${c.resolve}`,
    ),
  ]
  return lines.join('\n')
}

const arg = Number(process.argv[2])
const list = arg ? [buildScenario(arg, SAMPLE_CONTEXT)] : Array.from({ length: 5 }, () => pickScenario({ offer: SAMPLE_CONTEXT }))
console.log(list.map(describe).join('\n\n'))
