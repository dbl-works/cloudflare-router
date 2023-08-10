import { Config } from '../config'
import { deploymentForRequest } from './deployment-for-request'

type AsyncResponse = Response | Promise<Response>
type RespondWithResponse = Promise<{ response: Response }>

const getCredentialsFromAuthorizationHeader = (authorizationHeader: string | undefined | null) => {
  const encoded = (authorizationHeader || '').replace('Basic ', '')
  const decoded = atob(encoded).toString().split(':')
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
  // We also allow options requests here to get cors headers from origin
  if (config.deployments.length === 0 || event.request.method === 'OPTIONS') {
    return respondWith(callback(event))
  }

  // Look for a deployment to ensure we have a valid config
  const deployment = deploymentForRequest(event.request, config)
  if (deployment === undefined) {
    return respondWith(new Response('Unknown deployment'))
  }

  // If auth is defined, then let's check it
  // NOTE: Assuming basic auth since that is the only optional configurable
  if (deployment.auth && Array.isArray(deployment.auth)) {
    for (const authConfig of deployment.auth) {
      if (authConfig.type === 'ip') {
        const clientIp = event.request.headers.get('CF-Connecting-IP') || '0.0.0.0/0'
        console.log('Checking IP address.', authConfig.allow, 'includes', clientIp)
        // TODO: Add support for ip ranges
        if (authConfig.allow.includes(clientIp)) {
          return respondWith(callback(event))//, { headers: { 'X-Auth-Method': authConfig.type } })
        }
      } else if (authConfig.type === 'basic') {
        const expectedAuth = { username: authConfig.username, password: authConfig.password }
        const attemptedAuth = getCredentialsFromAuthorizationHeader(event.request.headers.get('Authorization'))
        if (expectedAuth.username !== attemptedAuth.username || expectedAuth.password !== attemptedAuth.password) {
          return respondWith(new Response("Unauthorized.", {
            status: 401,
            headers: {
              "WWW-Authenticate": 'Basic realm="Cloudflare Router", charset="UTF-8"',
            },
          }))
        }
      }
    }
  }

  return respondWith(callback(event))
}
