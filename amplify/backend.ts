import { defineBackend } from '@aws-amplify/backend'
import { FunctionUrlAuthType, HttpMethod, type IFunction } from 'aws-cdk-lib/aws-lambda'
import { coachReport } from './functions/coach-report/resource'
import { sessionToken } from './functions/session-token/resource'

const backend = defineBackend({ sessionToken, coachReport })

// Public HTTPS URL for a function. The access code check inside each
// handler is what keeps strangers out.
function publicUrl(fn: IFunction) {
  return fn.addFunctionUrl({
    authType: FunctionUrlAuthType.NONE,
    cors: {
      allowedOrigins: ['https://main.d35wias2tzhiw9.amplifyapp.com', 'http://localhost:5173'],
      allowedMethods: [HttpMethod.POST],
      allowedHeaders: ['content-type'],
    },
  }).url
}

// Written to amplify_outputs.json so the frontend can find the URLs.
backend.addOutput({
  custom: {
    sessionTokenUrl: publicUrl(backend.sessionToken.resources.lambda),
    coachReportUrl: publicUrl(backend.coachReport.resources.lambda),
  },
})
