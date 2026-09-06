import { AuthMethods } from '../config'
import { CompiledRoute } from './compile-routes'
import { canonicalIp } from './ip'

// RFC 7235: the authentication scheme is case-insensitive.
const BASIC_CREDENTIALS = /^basic\s+(\S+)\s*$/i

const hasBasicScheme = (header: string | null): header is string =>
  header !== null && /^basic(\s|$)/i.test(header)

const getCredentialsFromAuthorizationHeader = (authorizationHeader: string | null) => {
  const match = authorizationHeader?.match(BASIC_CREDENTIALS)
  if (!match) {
    return null
  }
  try {
    const buffer = Uint8Array.from(atob(match[1]), (character) =>
      character.charCodeAt(0)
    )
    const decoded = new TextDecoder().decode(buffer).normalize()
    const separatorIndex = decoded.indexOf(':')

    if (separatorIndex === -1) {
      return { username: decoded, password: '' }
    }

    return {
      username: decoded.slice(0, separatorIndex),
      password: decoded.slice(separatorIndex + 1),
    }
  } catch {
    return null
  }
}

async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const aBuffer = encoder.encode(a)
  const bBuffer = encoder.encode(b)

  const aHash = await crypto.subtle.digest('SHA-256', aBuffer)
  const bHash = await crypto.subtle.digest('SHA-256', bBuffer)

  const aArray = new Uint8Array(aHash)
  const bArray = new Uint8Array(bHash)

  if (aArray.length !== bArray.length) return false

  let result = 0
  for (let i = 0; i < aArray.length; i++) {
    result |= aArray[i] ^ bArray[i]
  }
  return result === 0
}

const matchesRule = async (rule: AuthMethods, request: Request): Promise<boolean> => {
  if (rule.type === 'ip') {
    // Cloudflare sets this header on every request it proxies. Without it there is no client to allow.
    // Both sides are canonical, so 2001:DB8::1 and 2001:db8:0:0:0:0:0:1 compare equal.
    const clientIp = canonicalIp(request.headers.get('CF-Connecting-IP') ?? '')
    return clientIp !== undefined && rule.allow.includes(clientIp)
  }

  const attempt = getCredentialsFromAuthorizationHeader(request.headers.get('Authorization'))
  if (!attempt) return false
  // The attempt is NFC-normalized, so the rule must be too.
  const userMatch = await timingSafeEqual(rule.username.normalize(), attempt.username)
  const passMatch = await timingSafeEqual(rule.password.normalize(), attempt.password)
  return userMatch && passMatch
}

/**
 * Removes Basic credentials from a request. Edge credentials must never
 * reach the origin.
 */
const withoutBasicCredentials = (request: Request): Request => {
  if (!hasBasicScheme(request.headers.get('Authorization'))) return request
  const stripped = new Request(request)
  stripped.headers.delete('Authorization')
  return stripped
}

/**
 * A CORS preflight, as a browser sends it: OPTIONS with an Origin and the
 * method it asks about, and no body. Any client can forge these headers, so
 * the shape alone never grants access. The route must opt in with `cors`.
 */
const isCorsPreflight = (request: Request): boolean =>
  request.method === 'OPTIONS'
  && request.headers.has('Origin')
  && request.headers.has('Access-Control-Request-Method')
  && request.body === null

/**
 * Gates a request with the resolved auth rules of its route. An empty list
 * means public. An unknown route is a 404. On a route with `cors`, a CORS
 * preflight passes so a browser can read the CORS headers of the origin.
 *
 * A failed request gets a Basic challenge only when the route has a Basic
 * rule. A browser must never collect credentials for a route that cannot
 * use them, because it would re-send them across the host.
 *
 * When any route on the host uses Basic auth, the Authorization header
 * belongs to the edge and is removed before the callback runs. Otherwise the
 * header may belong to the origin and is kept.
 */
export const authorize = async (request: Request, route: Pick<CompiledRoute, 'auth' | 'cors' | 'stripBasicCredentials'> | undefined, callback: (request: Request) => Promise<Response> | Response): Promise<Response> => {
  if (route === undefined) {
    return new Response('Unknown host', { status: 404 })
  }

  const forward = (req: Request) => callback(route.stripBasicCredentials ? withoutBasicCredentials(req) : req)

  if (route.auth.length === 0 || (route.cors && isCorsPreflight(request))) {
    return forward(request)
  }

  for (const rule of route.auth) {
    if (await matchesRule(rule, request)) {
      return forward(request)
    }
  }

  if (route.auth.some((rule) => rule.type === 'basic')) {
    return new Response('Unauthorized.', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Cloudflare Router", charset="UTF-8"',
      },
    })
  }
  return new Response('Forbidden.', { status: 403 })
}
