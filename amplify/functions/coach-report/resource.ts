import { defineFunction, secret } from '@aws-amplify/backend'

export const coachReport = defineFunction({
  name: 'coach-report',
  entry: './handler.ts',
  runtime: 22,
  // Grading with a reasoning model can take 20-40 seconds.
  timeoutSeconds: 240,
  environment: {
    OPENAI_API_KEY: secret('OPENAI_API_KEY'),
    ACCESS_CODE: secret('ACCESS_CODE'),
  },
})
