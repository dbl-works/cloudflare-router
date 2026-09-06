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

const invalid = (key: string, reason: string): Error =>
  new Error(`Invalid route "${key}": ${reason}`)

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

  const slash = key.indexOf('/')
  const hostPart = slash === -1 ? key : key.slice(0, slash)
  const path = slash === -1 ? '' : key.slice(slash).replace(/\/+$/, '')
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
  return { host, path }
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
 * Rejects origins that can never be fetched or that fetch the worker itself.
 */
function validateOrigin(compiled: CompiledRoute): void {
  const { key, host, path, route } = compiled
  const origin = route.origin
  if (typeof origin !== 'string' || origin === '') throw invalid(key, 'the origin must be a non-empty string.')

  const provider = providerFor(origin)
  if (provider && !provider.shorthand.test(origin)) throw invalid(key, `a ${provider.scheme}:// origin must have the form ${provider.usage}.`)
  if (!provider && origin.includes('://') && !origin.startsWith('https://')) throw invalid(key, 'an origin must be an https:// URL, a storage shorthand such as s3://, a host, or a path.')

  if (origin.startsWith('/')) {
    if (path === '') throw invalid(key, 'a path origin rewrites the same host, so the key needs a path part. Otherwise the worker fetches itself.')
    const target = origin.replace(/\/+$/, '')
    if (target === path || target.startsWith(`${path}/`)) throw invalid(key, 'a path origin must not be under the key path. Otherwise the worker fetches itself.')
    return
  }

  let base: URL
  try {
    base = new URL(resolveOrigin(origin, new URL(`https://${host ?? 'example.invalid'}/`)))
  } catch {
    throw invalid(key, `"${origin}" does not resolve to a valid URL.`)
  }
  if (host !== undefined && base.hostname === host) throw invalid(key, 'the origin points at the route host, so the worker fetches itself.')
}

/**
 * Parses, validates and orders the routes. Throws on the first invalid
 * route, so a bad configuration fails at startup instead of on a request.
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

  return compiled.sort(bySpecificity)
}
