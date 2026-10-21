import { defineBackend } from '@aws-amplify/backend'
import { FunctionUrlAuthType, HttpMethod } from 'aws-cdk-lib/aws-lambda'
import { sessionToken } from './functions/session-token/resource'

const backend = defineBackend({ sessionToken })

// Public HTTPS URL for the function. The access code check inside the
// handler is what keeps strangers out.
const url = backend.sessionToken.resources.lambda.addFunctionUrl({
  authType: FunctionUrlAuthType.NONE,
  cors: {
    allowedOrigins: ['https://main.d35wias2tzhiw9.amplifyapp.com', 'http://localhost:5173'],
    allowedMethods: [HttpMethod.POST],
    allowedHeaders: ['content-type'],
  },
})

// Written to amplify_outputs.json so the frontend can find the URL.
backend.addOutput({ custom: { sessionTokenUrl: url.url } })
