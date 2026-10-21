import { defineFunction, secret } from '@aws-amplify/backend'

export const sessionToken = defineFunction({
  name: 'session-token',
  entry: './handler.ts',
  runtime: 22,
  timeoutSeconds: 10,
  environment: {
    OPENAI_API_KEY: secret('OPENAI_API_KEY'),
    ACCESS_CODE: secret('ACCESS_CODE'),
  },
})
