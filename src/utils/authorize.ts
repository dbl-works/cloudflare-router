import { AuthMethods } from '../config'
import { CompiledRoute } from './compile-routes'

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
    const clientIp = request.headers.get('CF-Connecting-IP')
    return clientIp !== null && rule.allow.includes(clientIp)
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
 * method it asks about, and no body. Any other OPTIONS request is an
 * ordinary request.
 */
const isCorsPreflight = (request: Request): boolean =>
  request.method === 'OPTIONS'
  && request.headers.has('Origin')
  && request.headers.has('Access-Control-Request-Method')
  && request.body === null

/**
 * Gates a request with the resolved auth rules of its route. An empty list
 * means public. An unknown route is a 404. A CORS preflight passes, so a
 * browser can read the CORS headers of the origin.
 *
 * When any route on the host uses Basic auth, the Authorization header
 * belongs to the edge and is removed before the callback runs. Otherwise the
 * header may belong to the origin and is kept.
 */
export const authorize = async (request: Request, route: Pick<CompiledRoute, 'auth' | 'stripBasicCredentials'> | undefined, callback: (request: Request) => Promise<Response> | Response): Promise<Response> => {
  if (route === undefined) {
    return new Response('Unknown host', { status: 404 })
  }

  const forward = (req: Request) => callback(route.stripBasicCredentials ? withoutBasicCredentials(req) : req)

  if (route.auth.length === 0 || isCorsPreflight(request)) {
    return forward(request)
  }

  for (const rule of route.auth) {
    if (await matchesRule(rule, request)) {
      return forward(request)
    }
  }

  return new Response('Unauthorized.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Cloudflare Router", charset="UTF-8"',
    },
  })
}
