import { test, expect } from 'vitest'
import { compileRoutes, matchRoute, parseOrigin } from '../../src/utils/compile-routes'
import { canonicalPath, joinPath } from '../../src/utils/paths'
import fc from 'fast-check'

const basic = { type: 'basic', username: 'u', password: 'p' } as const
const ip = { type: 'ip', allow: ['192.168.1.1'] } as const
const S3 = 's3://eu-central-1.bucket/app'

const one = (routes: Parameters<typeof compileRoutes>[0]['routes'], config: Omit<Parameters<typeof compileRoutes>[0], 'routes'> = {}) =>
  compileRoutes({ routes, ...config })[0]

// --- One resolution rule ---

test('a route without auth, edgeCacheTtl, spa or cors takes the defaults', () => {
  const route = one({ 'app.example.com': S3 })
  expect(route.auth).toEqual([])
  expect(route.edgeCacheTtl).toBe(0)
  expect(route.spa).toBe(true)
  expect(route.cors).toBe(true)
})

test('an application origin forwards no unauthenticated preflight by default', () => {
  expect(one({ 'api.example.com': 'https://backend.example' }).cors).toBe(false)
})

test('cors resolves like the other keys', () => {
  expect(one({ 'api.example.com': 'https://backend.example' }, { cors: true }).cors).toBe(true)
  expect(one({ 'app.example.com': { origin: S3, cors: false } }, { cors: true }).cors).toBe(false)
})

test('a route without a value takes the config value', () => {
  const route = one({ 'app.example.com': 'https://origin.example' }, { auth: [ip], edgeCacheTtl: 0, spa: true })
  expect(route.auth).toEqual([ip])
  expect(route.spa).toBe(true)
})

test('a route value wins over the config value', () => {
  const route = one({ 'app.example.com': { origin: S3, auth: [], edgeCacheTtl: 5, spa: false } }, { auth: [basic], edgeCacheTtl: 60, spa: true })
  expect(route.auth).toEqual([])
  expect(route.edgeCacheTtl).toBe(5)
  expect(route.spa).toBe(false)
})

test('an https origin is not an SPA by default', () => {
  expect(one({ 'api.example.com': 'https://backend.example' }).spa).toBe(false)
})

// --- Basic credentials are stripped per host ---

test('every route on a host strips Basic credentials when one route on it uses Basic auth', () => {
  const routes = compileRoutes({ routes: {
    'example.com': 'https://origin.example/pub',
    'example.com/admin': { origin: S3, auth: [basic] },
    'other.example.com': 'https://origin.example/other',
  } })
  const byKey = Object.fromEntries(routes.map((route) => [route.key, route.stripBasicCredentials]))
  expect(byKey).toEqual({ 'example.com': true, 'example.com/admin': true, 'other.example.com': false })
})

test('an IP-only host keeps Basic credentials', () => {
  expect(one({ 'example.com': { origin: 'https://origin.example', auth: [ip] } }).stripBasicCredentials).toBe(false)
})

// --- Canonical paths ---

test('canonicalPath decodes for matching and keeps the raw segments', () => {
  expect(canonicalPath('/%61dmin/file%20name.js')).toEqual({ decoded: ['admin', 'file name.js'], raw: ['%61dmin', 'file%20name.js'], trailingSlash: false })
})

test('canonicalPath collapses repeated slashes and records a trailing slash', () => {
  expect(canonicalPath('//admin///users/')).toEqual({ decoded: ['admin', 'users'], raw: ['admin', 'users'], trailingSlash: true })
})

test('canonicalPath rejects an encoded slash, backslash, dot segment, control character or malformed escape', () => {
  for (const pathname of ['/admin%2Fsecret', '/admin%5Csecret', '/%2e%2e', '/a%00b', '/%zz', '/%E0%A4%A']) {
    expect(canonicalPath(pathname), pathname).toBeUndefined()
  }
})

// --- Matching ---

const routes = compileRoutes({ routes: {
  'example.com': 'https://origin.example/pub',
  'example.com/admin': { origin: 'https://origin.example/admin', auth: [basic] },
  'example.com/admin/reports': 'https://origin.example/reports',
} })

test('an encoded path matches the protected route it decodes to', () => {
  const match = matchRoute(routes, 'example.com', '/%61dmin/secret')
  expect(match?.route.key).toBe('example.com/admin')
  expect(match?.remainder).toBe('/secret')
})

test('the raw remainder is forwarded, so origin-bound encoding is unchanged', () => {
  expect(matchRoute(routes, 'example.com', '/admin/file%20name.js')?.remainder).toBe('/file%20name.js')
})

test('repeated slashes do not reach a public sibling', () => {
  expect(matchRoute(routes, 'example.com', '//admin/secret')?.route.key).toBe('example.com/admin')
})

test('an encoded slash matches no route', () => {
  expect(matchRoute(routes, 'example.com', '/admin%2Fsecret')).toBeUndefined()
})

test('the deepest key wins', () => {
  expect(matchRoute(routes, 'example.com', '/admin/reports/q1')?.route.key).toBe('example.com/admin/reports')
  expect(matchRoute(routes, 'example.com', '/admin-panel')?.route.key).toBe('example.com')
})

test('remainders keep the request shape', () => {
  expect(matchRoute(routes, 'example.com', '/')?.remainder).toBe('/')
  expect(matchRoute(routes, 'example.com', '/admin')?.remainder).toBe('')
  expect(matchRoute(routes, 'example.com', '/admin/')?.remainder).toBe('/')
  expect(matchRoute(routes, 'example.com', '/admin/x/')?.remainder).toBe('/x/')
})

// --- Cycles ---

// --- Runtime configuration validation ---

test.each([
  ['an unknown config key', { routes: {}, edgeCacheTTL: 5 }, /Unknown key "edgeCacheTTL" in the configuration/],
  ['a removed config key', { routes: {}, deployments: [] }, /"deployments" key is removed in v3. Use "auth"/],
  ['the removed isS3Site key', { routes: {}, isS3Site: false }, /"isS3Site" key is removed in v3. Use "spa"/],
  ['routes that are not an object', { routes: [] }, /"routes" must be a plain object/],
  ['a route value that is a number', { routes: { 'a.example.com': 5 } }, /origin string or a plain route object/],
  ['an unknown route key', { routes: { 'a.example.com': { origin: S3, ttl: 5 } } }, /Unknown key "ttl" in route "a.example.com"/],
  ['a string spa on a route', { routes: { 'a.example.com': { origin: S3, spa: 'false' } } }, /"spa" in route "a.example.com" must be true or false/],
  ['a string cors at the top level', { cors: 'false', routes: { 'a.example.com': S3 } }, /"cors" in the configuration must be true or false/],
  ['a numeric spa at the top level', { spa: 1, routes: { 'a.example.com': S3 } }, /"spa" in the configuration must be true or false/],
  ['a string edgeCacheTtl', { routes: { 'a.example.com': { origin: S3, edgeCacheTtl: '60' } } }, /"edgeCacheTtl" in route "a.example.com" must be a whole number/],
  ['a fractional edgeCacheTtl', { edgeCacheTtl: 1.5, routes: { 'a.example.com': S3 } }, /whole number/],
  ['auth that is not a list', { auth: {}, routes: { 'a.example.com': S3 } }, /"auth" in the configuration must be a list/],
  ['a rule without a type', { auth: [{ username: 'u', password: 'p' }], routes: { 'a.example.com': S3 } }, /without a type of "basic" or "ip"/],
  ['a rule with an unknown type', { auth: [{ type: 'bearer' }], routes: { 'a.example.com': S3 } }, /without a type of "basic" or "ip"/],
  ['a rule with an unknown key', { auth: [{ type: 'ip', allow: ['1.1.1.1'], deny: [] }], routes: { 'a.example.com': S3 } }, /Unknown key "deny" in a ip rule/],
  ['a basic rule with an empty password', { auth: [{ type: 'basic', username: 'u', password: '' }], routes: { 'a.example.com': S3 } }, /non-empty username and password/],
  ['an ip rule with no addresses', { auth: [{ type: 'ip', allow: [] }], routes: { 'a.example.com': S3 } }, /at least one address/],
  ['an ip rule with a CIDR range', { auth: [{ type: 'ip', allow: ['10.0.0.0/8'] }], routes: { 'a.example.com': S3 } }, /"10.0.0.0\/8", which is not one IP address. CIDR/],
  ['an ip rule with a hostname', { auth: [{ type: 'ip', allow: ['vpn.example.com'] }], routes: { 'a.example.com': S3 } }, /not one IP address/],
  ['an ip rule with an out-of-range octet', { auth: [{ type: 'ip', allow: ['256.1.1.1'] }], routes: { 'a.example.com': S3 } }, /not one IP address/],
])('compileRoutes rejects %s', (_name, config, message) => {
  expect(() => compileRoutes(config)).toThrow(message)
})

test('inherited route fields never count as configuration', () => {
  const inherited = Object.create({ origin: 'https://origin.example', auth: [] })
  expect(() => compileRoutes({ auth: [basic], routes: { 'admin.example.com': inherited } })).toThrow(/plain route object/)
  const partly = Object.assign(Object.create({ auth: [] }), { origin: 'https://origin.example' })
  expect(() => compileRoutes({ auth: [basic], routes: { 'admin.example.com': partly } })).toThrow(/plain route object/)
})

test('a null-prototype route object is accepted and read by own fields', () => {
  const route = Object.assign(Object.create(null), { origin: S3, auth: [] })
  expect(one({ 'a.example.com': route }, { auth: [basic] }).auth).toEqual([])
})

test.each([
  ['a Map as routes', { routes: new Map() }, /"routes" must be a plain object/],
  ['a Date as a route', { routes: { 'a.example.com': new Date() } }, /plain route object/],
  ['a class instance as the config', Object.assign(Object.create({ routes: {} }), {}), /must be a plain object/],
  ['a rule with a prototype', { auth: [Object.create({ type: 'ip', allow: ['1.1.1.1'] })], routes: { 'a.example.com': S3 } }, /rule that is not an object/],
  ['a sparse auth list', { auth: new Array(1), routes: { 'a.example.com': S3 } }, /rule that is not an object/],
  ['a sparse allow list', { auth: [{ type: 'ip', allow: Object.assign(new Array(2), { 0: '1.1.1.1' }) }], routes: { 'a.example.com': S3 } }, /not one IP address/],
])('compileRoutes rejects %s', (_name, config, message) => {
  expect(() => compileRoutes(config)).toThrow(message)
})

test('a non-enumerable top-level auth still protects every route', () => {
  const config = { routes: { 'a.example.com': 'https://origin.example' } }
  Object.defineProperty(config, 'auth', { value: [basic], enumerable: false })
  expect(compileRoutes(config)[0].auth).toEqual([basic])
})

test('a non-enumerable unknown key is still rejected', () => {
  const config = { routes: {} }
  Object.defineProperty(config, 'edgeCacheTTL', { value: 5, enumerable: false })
  expect(() => compileRoutes(config)).toThrow(/Unknown key "edgeCacheTTL"/)
})

test.each([
  ['a getter on the config', Object.defineProperty({ routes: {} }, 'auth', { get: () => [], enumerable: true }), /"auth" in the configuration is an accessor/],
  ['a getter on a route', { routes: { 'a.example.com': Object.defineProperty({ origin: S3 }, 'auth', { get: () => [] }) } }, /"auth" in route "a.example.com" is an accessor/],
  ['a symbol key on a route', { routes: { 'a.example.com': { origin: S3, [Symbol('x')]: 1 } } }, /has a symbol key/],
  ['an own __proto__ key', { routes: { 'a.example.com': JSON.parse('{"origin":"https://origin.example","__proto__":{"auth":[]}}') } }, /Unknown key "__proto__" in route/],
  ['a key named constructor', { routes: {}, constructor: 1 }, /Unknown key "constructor" in the configuration/],
  ['an auth list with a swapped prototype', { auth: Object.setPrototypeOf([{ type: 'ip', allow: ['1.1.1.1'] }], { [Symbol.iterator]: function* () {} }), routes: { 'a.example.com': S3 } }, /must be a plain array/],
  ['an allow list with an accessor element', { auth: [{ type: 'ip', allow: Object.defineProperty([], 0, { get: () => '1.1.1.1', enumerable: true }) }], routes: { 'a.example.com': S3 } }, /accessor element/],
])('compileRoutes rejects %s', (_name, config, message) => {
  expect(() => compileRoutes(config)).toThrow(message)
})

test('IPv6 addresses in rules are canonicalized', () => {
  const route = one({ 'a.example.com': { origin: S3, auth: [{ type: 'ip', allow: ['2001:DB8::1', '2001:db8:0:0:0:0:0:2', '::FFFF:1.2.3.4'] }] } })
  expect(route.auth).toEqual([{ type: 'ip', allow: ['2001:db8::1', '2001:db8::2', '::ffff:102:304'] }])
})

// --- Origins ---

test.each([
  ['s3://eu-central-1.bucket/app', { kind: 'url', storage: true, host: 'bucket.s3.eu-central-1.amazonaws.com', port: '', segments: ['app'] }],
  ['https://origin.example/base/', { kind: 'url', storage: false, host: 'origin.example', port: '', segments: ['base'] }],
  ['https://Origin.Example:8443', { kind: 'url', storage: false, host: 'origin.example', port: '8443', segments: [] }],
  ['origin.example/base', { kind: 'url', storage: false, host: 'origin.example', port: '', segments: ['base'] }],
  ['/new-path/x', { kind: 'path', segments: ['new-path', 'x'] }],
])('parseOrigin accepts %s', (origin, parsed) => {
  expect(parseOrigin('k', origin)).toEqual(parsed)
})

test.each([
  ['an empty origin', '', /non-empty string/],
  ['a non-string origin', 5, /non-empty string/],
  ['a query', 'https://origin.example/base?tenant=1', /query or fragment/],
  ['a fragment', 's3://eu-central-1.bucket/app#x', /query or fragment/],
  ['an http scheme', 'http://origin.example', /must be an https:\/\/ URL/],
  ['credentials', 'https://user:pass@origin.example', /credentials/],
  ['a port out of range', 'https://origin.example:70000', /port "70000" is out of range/],
  ['a wildcard host', 'https://*.origin.example', /not a valid hostname/],
  ['a backslash in a path origin', '/foo\\../app', /origin path contains a backslash/],
  ['a backslash in a URL path', 'https://origin.example/foo\\bar', /origin path contains a backslash/],
  ['a backslash in the host', 'https://origin\\example.com', /not a valid hostname/],
  ['an encoded dot segment', 'https://origin.example/%2e%2e/x', /origin path is percent-encoded/],
  ['a mixed-case encoded dot segment', 'https://origin.example/%2E./x', /origin path is percent-encoded/],
  ['an encoded slash', 'https://origin.example/a%2Fb', /origin path is percent-encoded/],
  ['a dot segment', 'https://origin.example/base/../x', /"\." or "\.\." segment/],
  ['a dot segment in a path origin', '/foo/../app', /"\." or "\.\." segment/],
  ['an empty segment in a path origin', '/foo//app', /empty segment/],
  ['a space', 'https://origin.example/my app', /not allowed in a URL path/],
  ['an invalid s3 shorthand', 's3://bucket/app', /the s3:\/\/ origin has no region.*Write s3:\/\/REGION\.BUCKET/],
])('parseOrigin rejects %s', (_name, origin, message) => {
  expect(() => parseOrigin('k', origin)).toThrow(message)
})

const nastyPiece = fc.constantFrom('/', '//', '\\', '%2F', '%5C', '.', '..', '%2e', '%2e%2e', '%00', '%', 'app', 'a-b.c', '~', '@', ':', '?', '#', ' ', 'é', '..\\')
const nastyPath = fc.array(nastyPiece, { maxLength: 6 }).map((pieces) => pieces.join(''))
const origins = fc.oneof(
  nastyPath.map((path) => `/${path}`),
  nastyPath.map((path) => `https://origin.example/${path}`),
  nastyPath.map((path) => `origin.example/${path}`),
  nastyPath.map((path) => `s3://eu-central-1.bucket/${path}`),
)

test('property: every accepted origin resolves to a URL whose path the URL parser leaves unchanged', () => {
  fc.assert(fc.property(origins, (origin) => {
    let parsed: ReturnType<typeof parseOrigin>
    try {
      parsed = parseOrigin('k', origin)
    } catch {
      return true
    }
    const path = joinPath(parsed.segments)
    const host = parsed.kind === 'path' ? 'example.com' : parsed.host
    const url = new URL(`https://${host}${path}`)
    return url.pathname === (parsed.segments.length === 0 ? '/' : path)
      && url.hostname === host
      && parsed.segments.every((segment) => segment !== '.' && segment !== '..' && !segment.includes('\\') && !segment.includes('%'))
  }), { numRuns: 2000 })
})

test('a more specific route on the target host breaks a cycle', () => {
  // a → b/legacy → a/v2 → S3. The /v2 route always wins on a for /v2, so the host route is not reachable.
  expect(() => compileRoutes({ routes: {
    'a.example.com': 'https://b.example.com/',
    'b.example.com/legacy': 'https://a.example.com/v2',
    'a.example.com/v2': S3,
  } })).not.toThrow()
})

test('a deeper route that wins for its own path is reachable', () => {
  // a → b/ , b/legacy → a. A request a/legacy/x lands on b/legacy, then back on a.
  expect(() => compileRoutes({ routes: {
    'a.example.com': 'https://b.example.com/',
    'b.example.com/legacy': 'https://a.example.com',
  } })).toThrow(/fetches itself/)
})

test('an origin whose path cannot be canonicalized is rejected, not treated as root', () => {
  expect(() => compileRoutes({ routes: {
    'a.example.com': 'https://b.example.com/%2Floop',
    'b.example.com': 'https://a.example.com',
  } })).toThrow(/percent-encoded/)
})

test('a deeper route that never wins is not reachable', () => {
  // a → b/. On b, /legacy is shadowed by /legacy/... no: b/legacy/deep wins for /legacy/deep only, and it points to S3.
  expect(() => compileRoutes({ routes: {
    'a.example.com': 'https://b.example.com/',
    'b.example.com/legacy': 'https://c.example.com',
    'b.example.com/legacy/deep': 'https://a.example.com',
  } })).toThrow(/"b.example.com\/legacy\/deep"/)
})
