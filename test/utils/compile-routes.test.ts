import { test, expect } from 'vitest'
import { compileRoutes, matchRoute, canonicalPath } from '../../src/utils/compile-routes'

const basic = { type: 'basic', username: 'u', password: 'p' } as const
const ip = { type: 'ip', allow: ['192.168.1.1'] } as const
const S3 = 's3://eu-central-1.bucket/app'

const one = (routes: Parameters<typeof compileRoutes>[0]['routes'], config: Omit<Parameters<typeof compileRoutes>[0], 'routes'> = {}) =>
  compileRoutes({ routes, ...config })[0]

// --- One resolution rule ---

test('a route without auth, edgeCacheTtl or spa takes the defaults', () => {
  const route = one({ 'app.example.com': S3 })
  expect(route.auth).toEqual([])
  expect(route.edgeCacheTtl).toBe(0)
  expect(route.spa).toBe(true)
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

test('a deeper route that never wins is not reachable', () => {
  // a → b/. On b, /legacy is shadowed by /legacy/... no: b/legacy/deep wins for /legacy/deep only, and it points to S3.
  expect(() => compileRoutes({ routes: {
    'a.example.com': 'https://b.example.com/',
    'b.example.com/legacy': 'https://c.example.com',
    'b.example.com/legacy/deep': 'https://a.example.com',
  } })).toThrow(/"b.example.com\/legacy\/deep"/)
})
