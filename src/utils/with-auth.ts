import { Config } from '../config'
import { deploymentForRequest } from './deployment-for-request'

const getCredentialsFromAuthorizationHeader = (authorizationHeader: string | undefined | null) => {
  const encoded = (authorizationHeader || '').replace('Basic ', '')
  const buffer = Uint8Array.from(atob(encoded), (character) =>
    character.charCodeAt(0)
  );
  const decoded = new TextDecoder().decode(buffer).normalize().toString().split(':');

  return {
    username: decoded[0] || '',
    password: decoded[1] || '',
  }
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const aBuffer = encoder.encode(a);
  const bBuffer = encoder.encode(b);
  
  const aHash = await crypto.subtle.digest("SHA-256", aBuffer);
  const bHash = await crypto.subtle.digest("SHA-256", bBuffer);
  
  const aArray = new Uint8Array(aHash);
  const bArray = new Uint8Array(bHash);
  
  if (aArray.length !== bArray.length) return false;
  
  let result = 0;
  for (let i = 0; i < aArray.length; i++) {
    result |= aArray[i] ^ bArray[i];
  }
  return result === 0;
}

// Ensures requests are authenticated before executing the callback
export const withAuth = async (request: Request, config: Config, callback: (request: Request) => Promise<Response> | Response): Promise<Response> => {
  // If no deployments are defined, then just allow all requests to passthrough
  // We also allow options requests here to get cors headers from origin
  if (!config.deployments?.length || request.method === 'OPTIONS') {
    return callback(request)
  }

  // Look for a deployment to ensure we have a valid config
  const deployment = deploymentForRequest(request, config)
  if (deployment === undefined) {
    return new Response('Unknown deployment', { status: 404 })
  }

  // If auth is defined, then let's check it
  if (deployment.auth && deployment.auth.length > 0) {
    let authorized = false;

    for (const authConfig of deployment.auth) {
      if (authConfig.type === 'ip') {
        const clientIp = request.headers.get('CF-Connecting-IP') || '0.0.0.0/0'
        if (authConfig.allow.includes(clientIp)) {
          authorized = true;
          break;
        }
      } else if (authConfig.type === 'basic') {
        const attemptedAuth = getCredentialsFromAuthorizationHeader(request.headers.get('Authorization'))
        const userMatch = await timingSafeEqual(authConfig.username, attemptedAuth.username);
        const passMatch = await timingSafeEqual(authConfig.password, attemptedAuth.password);
        
        if (userMatch && passMatch) {
          authorized = true;
          break;
        }
      }
    }

    if (!authorized) {
      return new Response("Unauthorized.", {
        status: 401,
        headers: {
          "WWW-Authenticate": 'Basic realm="Cloudflare Router", charset="UTF-8"',
        },
      })
    }
  }

  return callback(request)
}
