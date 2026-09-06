import { Route, Routes } from '../config'
import { resolveOrigin } from './resolve-origin'
import { providerFor } from './providers'

export interface CompiledRoute {
  key: string
  /** Canonical hostname, or undefined for a path-only key. */
  host: string | undefined
  /** Path prefix without a trailing slash, or '' for a host-only key. */
  path: string
  route: Route
}

/** A hostname that no route key can name. Stands for "any other host". */
const UNKNOWN_HOST = 'unknown.invalid'

const invalid = (key: string, reason: string): Error =>
  new Error(`Invalid route "${key}": ${reason}`)

const stripTrailingSlashes = (path: string): string => path.replace(/\/+$/, '')

/**
 * Splits a route key into a canonical host part and a path part.
 *
 *   'admin.example.com'  → host 'admin.example.com', path ''
 *   'example.com/admin/' → host 'example.com',       path '/admin'
 *   '/old-path'          → host undefined,           path '/old-path'
 *
 * The host is canonicalized the way a browser does it: lowercase and
 * punycode. A trailing slash on the path part has no meaning.
 */
export function parseRouteKey(key: string): { host: string | undefined, path: string } {
  if (key === '' || /\s/.test(key)) throw invalid(key, 'a key must not be empty or contain whitespace.')
  if (key.includes('://')) throw invalid(key, 'a key must not contain a scheme. Write "example.com" or "example.com/path".')
  if (/[?#]/.test(key)) throw invalid(key, 'a key must not contain a query or fragment. Routes match the host and path only.')

  const slash = key.indexOf('/')
  const hostPart = slash === -1 ? key : key.slice(0, slash)
  const path = slash === -1 ? '' : stripTrailingSlashes(key.slice(slash))
  if (slash === 0) return { host: undefined, path }

  if (hostPart.includes(':')) throw invalid(key, 'a key must not contain a port.')
  if (hostPart.includes('*')) throw invalid(key, 'wildcards are not supported. List every host.')
  let host: string
  try {
    const url = new URL(`https://${hostPart}`)
    if (url.host !== url.hostname || url.pathname !== '/' || url.username !== '') throw new Error()
    host = url.hostname
  } catch {
    throw invalid(key, `"${hostPart}" is not a valid hostname.`)
  }
  if (host === UNKNOWN_HOST) throw invalid(key, `"${hostPart}" is reserved.`)
  return { host, path }
}

/**
 * Returns the rest of `pathname` after `prefix`, or undefined when `prefix`
 * does not match on a segment boundary. '/admin' matches '/admin' and
 * '/admin/x', but not '/admin-panel'.
 */
export function matchPath(pathname: string, prefix: string): string | undefined {
  if (prefix === '') return pathname
  if (pathname === prefix) return ''
  if (pathname.startsWith(prefix + '/')) return pathname.slice(prefix.length)
  return undefined
}

/**
 * Finds the route for a hostname and pathname. The routes must be in
 * specificity order, so the first match is the most specific one.
 */
export function matchRoute(routes: CompiledRoute[], hostname: string, pathname: string): { route: CompiledRoute, remainder: string } | undefined {
  for (const route of routes) {
    if (route.host !== undefined && route.host !== hostname) continue
    const remainder = matchPath(pathname, route.path)
    if (remainder !== undefined) return { route, remainder }
  }
  return undefined
}

/**
 * Orders routes from most to least specific:
 * host and path, then host only, then path only. Within one group the longer
 * path wins, then the longer key.
 */
const specificity = (route: CompiledRoute): number =>
  (route.host !== undefined ? 2 : 0) + (route.path !== '' ? 1 : 0)

const bySpecificity = (a: CompiledRoute, b: CompiledRoute): number =>
  specificity(b) - specificity(a)
  || b.path.length - a.path.length
  || b.key.length - a.key.length

/**
 * Rejects origins that can never be fetched safely.
 */
function validateOrigin({ key, route }: CompiledRoute): void {
  const origin = route.origin
  if (typeof origin !== 'string' || origin === '') throw invalid(key, 'the origin must be a non-empty string.')
  if (/[?#]/.test(origin)) throw invalid(key, 'an origin must not contain a query or fragment. The request path is appended to it.')

  const provider = providerFor(origin)
  if (provider && !provider.shorthand.test(origin)) throw invalid(key, `a ${provider.scheme}:// origin must have the form ${provider.usage}.`)
  if (!provider && origin.includes('://') && !origin.startsWith('https://')) throw invalid(key, 'an origin must be an https:// URL, a storage shorthand such as s3://, a host, or a path.')
  if (origin.startsWith('/')) return

  let url: URL
  try {
    url = new URL(resolveOrigin(origin, new URL(`https://${UNKNOWN_HOST}/`)))
  } catch {
    throw invalid(key, `"${origin}" does not resolve to a valid URL.`)
  }
  if (url.username !== '' || url.password !== '') throw invalid(key, 'an origin must not contain credentials.')
}

/**
 * The host and path prefix a route sends requests to. The host is undefined
 * when a path-only key rewrites the path on whatever host the request had.
 */
function targetOf({ host, route }: CompiledRoute): { host: string | undefined, path: string } {
  if (route.origin.startsWith('/')) {
    return { host, path: stripTrailingSlashes(route.origin) }
  }
  const url = new URL(resolveOrigin(route.origin, new URL(`https://${UNKNOWN_HOST}/`)))
  return { host: url.hostname, path: stripTrailingSlashes(url.pathname) }
}

/**
 * The routes that a request to `target` can land on. The hosts this worker
 * serves are the hosts named in the keys, so a target on any other host is
 * external and ends the chain. A same-host target from a path-only key can
 * be on any served host, or on a host no key names.
 *
 * On a served host the request lands on the route that wins for the target
 * path itself, or on any route with a path under it, because the request
 * path is appended to the target.
 */
function nextRoutes(routes: CompiledRoute[], target: { host: string | undefined, path: string }): CompiledRoute[] {
  const served = new Set(routes.flatMap((route) => route.host === undefined ? [] : [route.host]))
  let hosts: string[]
  if (target.host === undefined) {
    hosts = [...served, UNKNOWN_HOST]
  } else if (served.has(target.host)) {
    hosts = [target.host]
  } else {
    return []
  }

  const next = new Set<CompiledRoute>()
  for (const host of hosts) {
    const winner = matchRoute(routes, host, target.path || '/')
    if (winner) next.add(winner.route)
    for (const route of routes) {
      if (route.host !== undefined && route.host !== host) continue
      if (route.path !== '' && matchPath(route.path, target.path) !== undefined) next.add(route)
    }
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
 * Parses, validates and orders the routes. Throws on the first invalid
 * route, so a bad configuration fails at startup instead of on a request.
 * Compile once and reuse the result for every request.
 */
export function compileRoutes(routes: Routes): CompiledRoute[] {
  const compiled: CompiledRoute[] = Object.entries(routes).map(([key, value]) => ({
    key,
    ...parseRouteKey(key),
    route: typeof value === 'string' ? { origin: value } : value,
  }))

  const seen = new Map<string, string>()
  for (const item of compiled) {
    const canonical = `${item.host ?? ''}${item.path}`
    const other = seen.get(canonical)
    if (other !== undefined) throw invalid(item.key, `it is the same route as "${other}". Keep one.`)
    seen.set(canonical, item.key)
    validateOrigin(item)
  }

  compiled.sort(bySpecificity)
  rejectCycles(compiled)
  return compiled
}
