import { AuthMethods, Config, Route } from '../config'
import { resolveOrigin } from './resolve-origin'
import { providerFor } from './providers'

/**
 * A route with every default resolved. `auth`, `edgeCacheTtl` and `spa`
 * follow one rule: the route value, then the config value, then the default.
 */
export interface CompiledRoute {
  key: string
  /** Canonical hostname. */
  host: string
  /** Path segments of the key. Empty for a host-only key. */
  path: string[]
  origin: string
  auth: AuthMethods[]
  edgeCacheTtl: number
  spa: boolean
  /** Remove Basic credentials before the origin fetch. True when any route on this host uses Basic auth. */
  stripBasicCredentials: boolean
}

/** The request path, split for matching and for forwarding. */
export interface CanonicalPath {
  /** Percent-decoded segments, for matching. */
  decoded: string[]
  /** Segments as the client sent them, for forwarding. */
  raw: string[]
  trailingSlash: boolean
}

const invalid = (key: string, reason: string): Error =>
  new Error(`Invalid route "${key}": ${reason}`)

const stripTrailingSlashes = (path: string): string => path.replace(/\/+$/, '')

/**
 * Splits a configured path into segments. A configured path is plain: no
 * empty segments, no dot segments, no percent-encoding.
 */
function parseSegments(path: string, key: string): string[] {
  const trimmed = stripTrailingSlashes(path)
  if (trimmed === '') return []
  const segments = trimmed.split('/').slice(1)
  for (const segment of segments) {
    if (segment === '') throw invalid(key, `"${path}" must not contain empty segments.`)
    if (segment === '.' || segment === '..') throw invalid(key, `"${path}" must not contain "." or ".." segments.`)
    if (segment.includes('%')) throw invalid(key, `"${path}" must not be percent-encoded.`)
  }
  return segments
}

/**
 * Splits a route key into a canonical host and path segments.
 *
 *   'admin.example.com'  → host 'admin.example.com', path []
 *   'example.com/admin/' → host 'example.com',       path ['admin']
 *
 * The host is canonicalized the way a browser does it: lowercase and
 * punycode. A trailing slash on the path has no meaning.
 */
export function parseRouteKey(key: string): { host: string, path: string[] } {
  if (key === '' || /\s/.test(key)) throw invalid(key, 'a key must not be empty or contain whitespace.')
  if (key.includes('://')) throw invalid(key, 'a key must not contain a scheme. Write "example.com" or "example.com/path".')
  if (/[?#]/.test(key)) throw invalid(key, 'a key must not contain a query or fragment. Routes match the host and path only.')
  if (key.startsWith('/')) throw invalid(key, 'a key must name a host. Write "example.com/path" instead of "/path".')

  const slash = key.indexOf('/')
  const hostPart = slash === -1 ? key : key.slice(0, slash)
  const path = slash === -1 ? [] : parseSegments(key.slice(slash), key)

  if (hostPart.includes(':')) throw invalid(key, 'a key must not contain a port.')
  if (hostPart.includes('*')) throw invalid(key, 'wildcards are not supported. List every host.')
  try {
    const url = new URL(`https://${hostPart}`)
    if (url.host !== url.hostname || url.pathname !== '/' || url.username !== '') throw new Error()
    return { host: url.hostname, path }
  } catch {
    throw invalid(key, `"${hostPart}" is not a valid hostname.`)
  }
}

// A decoded segment must not smuggle a path separator, a dot segment or a control character.
const UNSAFE_SEGMENT = /[/\\\p{Cc}]/u

/**
 * Splits a request pathname into decoded segments for matching and raw
 * segments for forwarding. Repeated slashes collapse. Returns undefined when
 * a segment cannot be decoded, decodes to a path separator or a dot segment,
 * or contains a control character. Such a request matches no route.
 */
export function canonicalPath(pathname: string): CanonicalPath | undefined {
  const raw = pathname.split('/').filter((segment) => segment !== '')
  const decoded: string[] = []
  for (const segment of raw) {
    let plain: string
    try {
      plain = decodeURIComponent(segment)
    } catch {
      return undefined
    }
    if (UNSAFE_SEGMENT.test(plain) || plain === '.' || plain === '..') return undefined
    decoded.push(plain)
  }
  return { decoded, raw, trailingSlash: pathname.endsWith('/') }
}

const isPrefix = (prefix: string[], path: string[]): boolean =>
  prefix.length <= path.length && prefix.every((segment, i) => segment === path[i])

/**
 * Finds the route for a hostname and pathname. The routes must be in
 * specificity order, so the first match is the most specific one. The
 * remainder is the raw request path after the key path.
 */
export function matchRoute(routes: CompiledRoute[], hostname: string, pathname: string): { route: CompiledRoute, remainder: string, path: CanonicalPath } | undefined {
  const path = canonicalPath(pathname)
  if (!path) return undefined

  for (const route of routes) {
    if (route.host !== hostname || !isPrefix(route.path, path.decoded)) continue
    const rest = path.raw.slice(route.path.length)
    const remainder = (rest.length === 0 ? '' : `/${rest.join('/')}`) + (path.trailingSlash ? '/' : '')
    return { route, remainder, path }
  }
  return undefined
}

/** Longer paths first, so the most specific route on a host wins. */
const bySpecificity = (a: CompiledRoute, b: CompiledRoute): number =>
  a.host.localeCompare(b.host)
  || b.path.length - a.path.length
  || b.key.length - a.key.length

function validateAuth(key: string, auth: AuthMethods[]): void {
  if (!Array.isArray(auth)) throw invalid(key, '"auth" must be a list of rules.')
  for (const rule of auth) {
    if (rule.type === 'basic') {
      if (!rule.username || !rule.password) throw invalid(key, 'a basic rule needs a username and a password.')
    } else if (rule.type === 'ip') {
      if (!Array.isArray(rule.allow) || rule.allow.length === 0) throw invalid(key, 'an ip rule needs at least one address in "allow".')
    } else {
      throw invalid(key, `unknown auth rule type "${(rule as { type: string }).type}".`)
    }
  }
}

/**
 * Rejects origins that can never be fetched safely.
 */
function validateOrigin(key: string, origin: string): void {
  if (typeof origin !== 'string' || origin === '') throw invalid(key, 'the origin must be a non-empty string.')
  if (/[?#\s]/.test(origin)) throw invalid(key, 'an origin must not contain whitespace, a query or a fragment. The request path is appended to it.')

  const provider = providerFor(origin)
  if (provider && !provider.shorthand.test(origin)) throw invalid(key, `a ${provider.scheme}:// origin must have the form ${provider.usage}.`)
  if (!provider && origin.includes('://') && !origin.startsWith('https://')) throw invalid(key, 'an origin must be an https:// URL, a storage shorthand such as s3://, a host, or a path.')
  if (origin.startsWith('/')) {
    parseSegments(origin, key)
    return
  }

  let url: URL
  try {
    url = new URL(resolveOrigin(origin, new URL('https://unknown.invalid/')))
  } catch {
    throw invalid(key, `"${origin}" does not resolve to a valid URL.`)
  }
  if (url.username !== '' || url.password !== '') throw invalid(key, 'an origin must not contain credentials.')
}

/**
 * The host and path a route sends requests to.
 */
function targetOf(route: CompiledRoute): { host: string, path: string[] } {
  if (route.origin.startsWith('/')) {
    return { host: route.host, path: parseSegments(route.origin, route.key) }
  }
  const url = new URL(resolveOrigin(route.origin, new URL('https://unknown.invalid/')))
  const path = canonicalPath(url.pathname)
  return { host: url.hostname, path: path?.decoded ?? [] }
}

/**
 * The routes that a request to `target` can land on. The worker serves
 * exactly the hosts named in the keys, so a target on any other host is
 * external and ends the chain. On a served host the request lands on the
 * route that wins for the target path itself, or on a deeper route that wins
 * for its own path, because the request path is appended to the target.
 */
function nextRoutes(routes: CompiledRoute[], target: { host: string, path: string[] }): CompiledRoute[] {
  const pathOf = (segments: string[]): string => `/${segments.join('/')}`
  const next = new Set<CompiledRoute>()
  const winner = matchRoute(routes, target.host, pathOf(target.path))
  if (winner) next.add(winner.route)
  for (const route of routes) {
    if (route.host !== target.host || route.path.length <= target.path.length || !isPrefix(target.path, route.path)) continue
    if (matchRoute(routes, route.host, pathOf(route.path))?.route === route) next.add(route)
  }
  return [...next]
}

/**
 * Throws when a chain of routes leads back to its start. Such a chain makes
 * the worker fetch itself until Cloudflare aborts the request.
 */
function rejectCycles(routes: CompiledRoute[]): void {
  const done = new Set<CompiledRoute>()
  const trail: CompiledRoute[] = []

  const visit = (route: CompiledRoute): void => {
    if (done.has(route)) return
    const start = trail.indexOf(route)
    if (start !== -1) {
      const others = trail.slice(start + 1).map((item) => `"${item.key}"`)
      const via = others.length > 0 ? ` through ${others.join(' and ')}` : ''
      throw invalid(route.key, `the origin leads back to this route${via}, so the worker fetches itself.`)
    }
    trail.push(route)
    for (const next of nextRoutes(routes, targetOf(route))) visit(next)
    trail.pop()
    done.add(route)
  }

  for (const route of routes) visit(route)
}

/**
 * Parses, resolves, validates and orders the routes. Throws on the first
 * invalid route, so a bad configuration fails at startup instead of on a
 * request. Compile once and reuse the result for every request.
 */
export function compileRoutes(config: Pick<Config, 'routes' | 'auth' | 'edgeCacheTtl' | 'spa'>): CompiledRoute[] {
  const compiled: CompiledRoute[] = Object.entries(config.routes).map(([key, value]) => {
    const route: Route = typeof value === 'string' ? { origin: value } : value
    const auth = route.auth ?? config.auth ?? []
    const edgeCacheTtl = route.edgeCacheTtl ?? config.edgeCacheTtl ?? 0
    const spa = route.spa ?? config.spa ?? providerFor(route.origin) !== undefined

    validateOrigin(key, route.origin)
    validateAuth(key, auth)
    if (!Number.isInteger(edgeCacheTtl) || edgeCacheTtl < 0) throw invalid(key, '"edgeCacheTtl" must be a whole number of seconds, 0 or more.')
    if (edgeCacheTtl > 0 && auth.length > 0 && !providerFor(route.origin)) {
      throw invalid(key, 'a protected route caches only a storage origin. The edge cache key is the URL, so a cached response from an application origin would be served to every authorized user. Set "edgeCacheTtl: 0" on this route.')
    }

    return { key, ...parseRouteKey(key), origin: route.origin, auth, edgeCacheTtl, spa, stripBasicCredentials: false }
  })

  const seen = new Map<string, string>()
  for (const item of compiled) {
    const canonical = [item.host, ...item.path].join('/')
    const other = seen.get(canonical)
    if (other !== undefined) throw invalid(item.key, `it is the same route as "${other}". Keep one.`)
    seen.set(canonical, item.key)
  }

  // A browser re-sends Basic credentials to every path on the host, so no route on that host may forward them.
  const hostsWithBasic = new Set(compiled.filter((item) => item.auth.some((rule) => rule.type === 'basic')).map((item) => item.host))
  for (const item of compiled) item.stripBasicCredentials = hostsWithBasic.has(item.host)

  compiled.sort(bySpecificity)
  rejectCycles(compiled)
  return compiled
}
