import { Config } from '../config'
import { deploymentForRequest } from './deployment-for-request'

type AsyncResponse = Response | Promise<Response>
type RespondWithResponse = Promise<{ response: Response }>

const getCredentialsFromAuthorizationHeader = (authorizationHeader: string | undefined | null) => {
  const encoded = (authorizationHeader || '').replace('Basic ', '')
  const decoded = Buffer.from(encoded, 'base64').toString().split(':')
  return {
    username: decoded[0],
    password: decoded[1],
  }
}

// Ensures requests are authenticated before executing the callback
export const withAuth = (event: FetchEvent, config: Config, callback: (event: FetchEvent) => AsyncResponse): RespondWithResponse => {
  const respondWith = async (response: AsyncResponse) => {
    event.respondWith(response)
    return {
      response: await response,
    }
  }

  // If no deployments are defined, then just allow all requests to passthrough
  if (config.deployments.length === 0) {
    return respondWith(callback(event))
  }

  // Look for a deployment to ensure we have a valid config
  const deployment = deploymentForRequest(event.request, config)
  if (deployment === undefined) {
    return respondWith(new Response('Unknown deployment'))
  }

  // If auth is defined, then let's check it
  // NOTE: Assuming basic auth since that is the only optional configurable
  if (deployment.auth && deployment.auth[0]) {
    const authConfig = deployment.auth[0]
    const expectedAuth = { username: authConfig.username, password: authConfig.password }
    const attemptedAuth = getCredentialsFromAuthorizationHeader(event.request.headers.get('Authorization'))
    if (expectedAuth.username !== attemptedAuth.username || expectedAuth.password !== attemptedAuth.password) {
      return respondWith(new Response("Unauthorized.", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Reveneo Platform", charset="UTF-8"',
        },
      }))
    }
  }

  return respondWith(callback(event))
}
