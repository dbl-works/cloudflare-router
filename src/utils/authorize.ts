import { Route, AuthMethods } from '../config'

const getCredentialsFromAuthorizationHeader = (authorizationHeader: string | undefined | null) => {
  if (!authorizationHeader || !authorizationHeader.startsWith('Basic ')) {
    return null;
  }
  try {
    const encoded = authorizationHeader.slice(6)
    const buffer = Uint8Array.from(atob(encoded), (character) =>
      character.charCodeAt(0)
    );
    const decoded = new TextDecoder().decode(buffer).normalize();
    const separatorIndex = decoded.indexOf(':');

    if (separatorIndex === -1) {
      return { username: decoded, password: '' };
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    }
  } catch {
    return null;
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
export const authorize = async (request: Request, route: Route | undefined, configAuth: AuthMethods[] | undefined, callback: (request: Request) => Promise<Response> | Response): Promise<Response> => {
  if (route === undefined) {
    return new Response('Unknown host', { status: 404 })
  }

  const forward = (req: Request) => {
    const authHeader = req.headers.get('Authorization')
    if (authHeader && authHeader.startsWith('Basic ')) {
      const newReq = new Request(req)
      newReq.headers.delete('Authorization')
      return callback(newReq)
    }
    return callback(req)
  }

  if (request.method === 'OPTIONS') {
    return forward(request)
  }

  const authRules = route.auth ?? configAuth

  if (authRules && authRules.length > 0) {
    let authorized = false;

    for (const authConfig of authRules) {
      if (authConfig.type === 'ip') {
        const clientIp = request.headers.get('CF-Connecting-IP') || '0.0.0.0/0'
        if (authConfig.allow.includes(clientIp)) {
          authorized = true;
          break;
        }
      } else if (authConfig.type === 'basic') {
        const attemptedAuth = getCredentialsFromAuthorizationHeader(request.headers.get('Authorization'))
        if (attemptedAuth) {
          const userMatch = await timingSafeEqual(authConfig.username, attemptedAuth.username);
          const passMatch = await timingSafeEqual(authConfig.password, attemptedAuth.password);

          if (userMatch && passMatch) {
            authorized = true;
            break;
          }
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

  return forward(request)
}
