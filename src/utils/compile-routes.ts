import { AuthMethods } from '../config'
import { providerFor } from './providers'
import { CanonicalPath, canonicalPath, isPrefix, joinPath, parseHostname, plainPath } from './paths'
import { canonicalIp } from './ip'

/**
 * A route with every default resolved. `auth`, `edgeCacheTtl`, `spa` and
 * `cors` follow one rule: the route value, then the config value, then the
 * default.
 */
export interface CompiledRoute {
  key: string
  /** Canonical hostname. */
  host: string
  /** Path segments of the key. Empty for a host-only key. */
  path: string[]
  origin: string
  /** Rules with canonical IP addresses. */
  auth: AuthMethods[]
  edgeCacheTtl: number
  spa: boolean
  cors: boolean
  /** Remove Basic credentials before the origin fetch. True when any route on this host uses Basic auth. */
  stripBasicCredentials: boolean
}

export type { CanonicalPath }
export { canonicalPath }

const invalid = (key: string, reason: string): Error =>
  new Error(`Invalid route "${key}": ${reason}`)

/**
 * A plain object: a normal or null prototype, so no inherited field can pose
 * as configuration. A Map, a Date or an Object.create(...) value is not one.
 */
const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null) return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/** Own fields only. Together with `isPlainObject` this is the only way configuration is read. */
const ownFields = (value: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(value))

/** Every index of a list, holes included, so a sparse array cannot hide an undefined rule. */
const everyIndex = (value: unknown[]): unknown[] => Array.from(value)

// ---------------------------------------------------------------------------
// Configuration shape. Every value is checked at runtime, because a
// JavaScript consumer has no types, and a truthy string must not open a
// bypass.
// ---------------------------------------------------------------------------

const CONFIG_KEYS = ['routes', 'auth', 'edgeCacheTtl', 'spa', 'cors']
const ROUTE_KEYS = ['origin', 'auth', 'edgeCacheTtl', 'spa', 'cors']
const RULE_KEYS: Record<string, string[]> = { basic: ['type', 'username', 'password'], ip: ['type', 'allow'] }
const REMOVED_KEYS: Record<string, string> = {
  deployments: 'The "deployments" key is removed in v3. Use "auth" per route or at the top level instead.',
  isS3Site: 'The "isS3Site" key is removed in v3. Use "spa" per route or at the top level instead.',
}

function rejectUnknownKeys(where: string, value: Record<string, unknown>, allowed: string[]): void {
  for (const name of Object.keys(value)) {
    if (allowed.includes(name)) continue
    if (name in REMOVED_KEYS) throw new Error(REMOVED_KEYS[name])
    throw new Error(`Unknown key "${name}" in ${where}. Allowed keys: ${allowed.join(', ')}.`)
  }
}

/** Validates an explicit flag. Undefined means "not set". */
function checkFlag(where: string, name: string, value: unknown): boolean | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'boolean') throw new Error(`"${name}" in ${where} must be true or false.`)
  return value
}

function checkTtl(where: string, value: unknown): number | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new Error(`"edgeCacheTtl" in ${where} must be a whole number of seconds, 0 or more.`)
  return value
}

/** Validates auth rules and canonicalizes their IP addresses. Undefined means "not set". */
function checkAuth(where: string, value: unknown): AuthMethods[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new Error(`"auth" in ${where} must be a list of rules.`)
  return everyIndex(value).map((entry): AuthMethods => {
    if (!isPlainObject(entry)) throw new Error(`"auth" in ${where} has a rule that is not an object.`)
    const rule = ownFields(entry)
    if (typeof rule.type !== 'string' || !Object.hasOwn(RULE_KEYS, rule.type)) {
      throw new Error(`"auth" in ${where} has a rule without a type of "basic" or "ip".`)
    }
    rejectUnknownKeys(`a ${rule.type} rule of ${where}`, rule, RULE_KEYS[rule.type])
    if (rule.type === 'basic') {
      if (typeof rule.username !== 'string' || rule.username === '' || typeof rule.password !== 'string' || rule.password === '') {
        throw new Error(`a basic rule of ${where} needs a non-empty username and password.`)
      }
      return { type: 'basic', username: rule.username, password: rule.password }
    }
    if (!Array.isArray(rule.allow) || rule.allow.length === 0) throw new Error(`an ip rule of ${where} needs at least one address in "allow".`)
    const allow = everyIndex(rule.allow).map((address) => {
      const canonical = typeof address === 'string' ? canonicalIp(address) : undefined
      if (canonical === undefined) throw new Error(`an ip rule of ${where} lists "${String(address)}", which is not one IP address. CIDR ranges are not supported.`)
      return canonical
    })
    return { type: 'ip', allow }
  })
}

// ---------------------------------------------------------------------------
// Keys and origins. Every path goes through `plainPath`, so the URL parser
// can never change a configured value after validation.
// ---------------------------------------------------------------------------

/**
 * Splits a route key into a canonical host and path segments.
 *
 *   'admin.example.com'  → host 'admin.example.com', path []
 *   'example.com/admin/' → host 'example.com',       path ['admin']
 */
export function parseRouteKey(key: string): { host: string, path: string[] } {
  if (key === '') throw invalid(key, 'a key must not be empty.')
  if (key.includes('://')) throw invalid(key, 'a key must not contain a scheme. Write "example.com" or "example.com/path".')
  if (key.startsWith('/')) throw invalid(key, 'a key must name a host. Write "example.com/path" instead of "/path".')

  const slash = key.indexOf('/')
  const hostPart = slash === -1 ? key : key.slice(0, slash)
  const pathPart = slash === -1 ? '' : key.slice(slash)

  if (/[?#]/.test(key)) throw invalid(key, 'a key must not contain a query or fragment. Routes match the host and path only.')
  if (hostPart.includes(':')) throw invalid(key, 'a key must not contain a port.')
  if (hostPart.includes('*')) throw invalid(key, 'wildcards are not supported. List every host.')
  const host = parseHostname(hostPart)
  if (host === undefined) throw invalid(key, `"${hostPart}" is not a valid hostname.`)
  const path = plainPath(pathPart)
  if ('error' in path) throw invalid(key, `the key path ${path.error}.`)
  return { host, path: path.segments }
}

/** Where a route sends requests. A path origin stays on the request host. */
type ParsedOrigin =
  | { kind: 'path', segments: string[] }
  | { kind: 'url', storage: boolean, host: string, port: string, segments: string[] }

/**
 * Validates an origin and splits it into its target. Accepts a storage
 * shorthand, an https:// URL, a bare host with an optional path, or a path.
 */
export function parseOrigin(key: string, origin: unknown): ParsedOrigin {
  if (typeof origin !== 'string' || origin === '') throw invalid(key, 'the origin must be a non-empty string.')
  if (/[?#]/.test(origin)) throw invalid(key, 'the origin must not contain a query or fragment. The request path is appended to it.')

  const provider = providerFor(origin)
  if (provider) {
    const parsed = provider.parse(origin)
    if ('error' in parsed) throw invalid(key, `the ${provider.scheme}:// origin ${parsed.error}. Write ${provider.usage}.`)
    const url = new URL(parsed.url)
    const path = canonicalPath(url.pathname)
    if (!path) throw invalid(key, `the ${provider.scheme}:// origin resolves to an unsafe path.`)
    return { kind: 'url', storage: true, host: url.hostname, port: url.port, segments: path.decoded }
  }

  if (origin.startsWith('/')) {
    const path = plainPath(origin)
    if ('error' in path) throw invalid(key, `the origin path ${path.error}.`)
    return { kind: 'path', segments: path.segments }
  }

  let rest = origin
  if (origin.includes('://')) {
    if (!origin.startsWith('https://')) throw invalid(key, 'the origin must be an https:// URL, a storage shorthand such as s3://, a host, or a path.')
    rest = origin.slice('https://'.length)
  }
  const slash = rest.indexOf('/')
  const authority = slash === -1 ? rest : rest.slice(0, slash)
  const pathPart = slash === -1 ? '' : rest.slice(slash)

  if (authority.includes('@')) throw invalid(key, 'the origin must not contain credentials.')
  const portMatch = authority.match(/^(.*?)(?::(\d{1,5}))?$/)
  const hostPart = portMatch?.[1] ?? authority
  const port = portMatch?.[2] ?? ''
  if (port !== '' && (Number(port) < 1 || Number(port) > 65535)) throw invalid(key, `the origin port "${port}" is out of range.`)
  const host = parseHostname(hostPart)
  if (host === undefined) throw invalid(key, `the origin host "${hostPart}" is not a valid hostname.`)
  const path = plainPath(pathPart)
  if ('error' in path) throw invalid(key, `the origin path ${path.error}.`)
  return { kind: 'url', storage: false, host, port, segments: path.segments }
}

// ---------------------------------------------------------------------------
// Matching.
// ---------------------------------------------------------------------------

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
    const remainder = (rest.length === 0 ? '' : joinPath(rest)) + (path.trailingSlash ? '/' : '')
    return { route, remainder, path }
  }
  return undefined
}

/** Longer paths first, so the most specific route on a host wins. */
const bySpecificity = (a: CompiledRoute, b: CompiledRoute): number =>
  a.host.localeCompare(b.host)
  || b.path.length - a.path.length
  || b.key.length - a.key.length

// ---------------------------------------------------------------------------
// Self-fetch detection.
// ---------------------------------------------------------------------------

/** The host and path a route sends requests to. */
function targetOf(route: CompiledRoute): { host: string, path: string[] } {
  const origin = parseOrigin(route.key, route.origin)
  return origin.kind === 'path'
    ? { host: route.host, path: origin.segments }
    : { host: origin.host, path: origin.segments }
}

/**
 * The routes that a request to `target` can land on. The worker serves
 * exactly the hosts named in the keys, so a target on any other host is
 * external and ends the chain. On a served host the request lands on the
 * route that wins for the target path itself, or on a deeper route that wins
 * for its own path, because the request path is appended to the target.
 */
function nextRoutes(routes: CompiledRoute[], target: { host: string, path: string[] }): CompiledRoute[] {
  const next = new Set<CompiledRoute>()
  const winner = matchRoute(routes, target.host, joinPath(target.path))
  if (winner) next.add(winner.route)
  for (const route of routes) {
    if (route.host !== target.host || route.path.length <= target.path.length || !isPrefix(target.path, route.path)) continue
    if (matchRoute(routes, route.host, joinPath(route.path))?.route === route) next.add(route)
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

// ---------------------------------------------------------------------------
// Compilation.
// ---------------------------------------------------------------------------

/**
 * Validates the configuration, resolves every default, and orders the
 * routes. Throws on the first defect, so a bad configuration fails at
 * startup instead of on a request. Compile once and reuse the result.
 */
export function compileRoutes(input: unknown): CompiledRoute[] {
  if (!isPlainObject(input)) throw new Error('The configuration must be a plain object.')
  const config = ownFields(input)
  rejectUnknownKeys('the configuration', config, CONFIG_KEYS)
  if (!isPlainObject(config.routes)) throw new Error('"routes" must be a plain object that maps a key to an origin or a route.')

  const defaults = {
    auth: checkAuth('the configuration', config.auth),
    edgeCacheTtl: checkTtl('the configuration', config.edgeCacheTtl),
    spa: checkFlag('the configuration', 'spa', config.spa),
    cors: checkFlag('the configuration', 'cors', config.cors),
  }

  const compiled: CompiledRoute[] = Object.entries(ownFields(config.routes)).map(([key, value]) => {
    const where = `route "${key}"`
    if (typeof value !== 'string' && !isPlainObject(value)) throw invalid(key, 'the value must be an origin string or a plain route object.')
    const route: Record<string, unknown> = typeof value === 'string' ? { origin: value } : ownFields(value)
    rejectUnknownKeys(where, route, ROUTE_KEYS)

    const { host, path } = parseRouteKey(key)
    const origin = parseOrigin(key, route.origin)
    const auth = checkAuth(where, route.auth) ?? defaults.auth ?? []
    const edgeCacheTtl = checkTtl(where, route.edgeCacheTtl) ?? defaults.edgeCacheTtl ?? 0
    const storage = origin.kind === 'url' && origin.storage
    const spa = checkFlag(where, 'spa', route.spa) ?? defaults.spa ?? storage
    const cors = checkFlag(where, 'cors', route.cors) ?? defaults.cors ?? storage

    if (edgeCacheTtl > 0 && auth.length > 0 && !storage) {
      throw invalid(key, 'a protected route caches only a storage origin. The edge cache key is the URL, so a cached response from an application origin would be served to every authorized user. Set "edgeCacheTtl: 0" on this route.')
    }

    return { key, host, path, origin: route.origin as string, auth, edgeCacheTtl, spa, cors, stripBasicCredentials: false }
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
