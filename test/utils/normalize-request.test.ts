import { test, expect } from 'vitest'
import normalize from '../../src/utils/normalize-request'
import { compileRoutes } from '../../src/utils/compile-routes'
import { Routes } from '../../src/config'

const normalizeRequest = (request: Request, routes: Routes, spa?: boolean) =>
  normalize(request, compileRoutes({ routes, spa }))

const TEST_ROUTES = {
  'admin.example.com': 'https://s3.eu-central-1.amazonaws.com/assets.example.com/admin',
  'example.com/admin': 'https://s3.eu-central-1.amazonaws.com/assets.example.com/admin',
  'dashboard.example.com': 's3://eu-central-1.assets.example.com/dashboard',
  'fonts.example.com': 's3://us-east-1.fonts.example.com',
  'cdn.example.com': 's3://eu-central-1.bucket-name/public',
  'example.com/old-path': '/new-path',
  'object.example.com': { origin: 's3://eu-central-1.bucket-name/object', edgeCacheTtl: 123 },
}

test('returns the original input if no matching routes', () => {
  const { request, route } = normalizeRequest(new Request('https://example.com/'), TEST_ROUTES)
  expect(request.url).toEqual('https://example.com/')
  expect(route).toBeUndefined()
})

test('maps root js file to s3 bucket subpath', () => {
  const { request, route } = normalizeRequest(new Request('https://admin.example.com/some/file.js'), TEST_ROUTES)
  expect(request.url).toEqual('https://s3.eu-central-1.amazonaws.com/assets.example.com/admin/some/file.js')
  expect(route?.origin).toEqual(TEST_ROUTES['admin.example.com'])
})

test('maps root path to s3 bucket subpath', () => {
  const { request, route } = normalizeRequest(new Request('https://admin.example.com/'), TEST_ROUTES)
  expect(request.url).toEqual('https://s3.eu-central-1.amazonaws.com/assets.example.com/admin/')
  expect(route).toBeDefined()
})

test('maps subpath js file to s3 bucket subpath', () => {
  const { request, route } = normalizeRequest(new Request('https://example.com/admin/some/file.js'), TEST_ROUTES)
  expect(request.url).toEqual('https://s3.eu-central-1.amazonaws.com/assets.example.com/admin/some/file.js')
  expect(route).toBeDefined()
})

test('maps js to s3 bucket root (virtual-hosted style for dot-free bucket)', () => {
  const { request, route } = normalizeRequest(new Request('https://cdn.example.com/some/file.js'), TEST_ROUTES)
  expect(request.url).toEqual('https://bucket-name.s3.eu-central-1.amazonaws.com/public/some/file.js')
  expect(route).toBeDefined()
})

test('maps SPA root path to s3 bucket index (path-style for dotted bucket)', () => {
  const { request, route } = normalizeRequest(new Request('https://dashboard.example.com/'), TEST_ROUTES)
  expect(request.url).toEqual('https://s3.eu-central-1.amazonaws.com/assets.example.com/dashboard/index.html')
  expect(route).toBeDefined()
})

test('maps SPA sub path to s3 bucket index', () => {
  const { request, route } = normalizeRequest(new Request('https://dashboard.example.com/users/'), TEST_ROUTES)
  expect(request.url).toEqual('https://s3.eu-central-1.amazonaws.com/assets.example.com/dashboard/index.html')
  expect(route).toBeDefined()
})

test('maps SPA JS FILE to s3 bucket location', () => {
  const { request, route } = normalizeRequest(new Request('https://dashboard.example.com/some/file.js'), TEST_ROUTES)
  expect(request.url).toEqual('https://s3.eu-central-1.amazonaws.com/assets.example.com/dashboard/some/file.js')
  expect(route).toBeDefined()
})

test('maps SPA root to s3 bucket root without subpath (path-style for dotted bucket)', () => {
  const { request, route } = normalizeRequest(new Request('https://fonts.example.com/'), TEST_ROUTES)
  expect(request.url).toEqual('https://s3.us-east-1.amazonaws.com/fonts.example.com/index.html')
  expect(route).toBeDefined()
})

test('forwards original request when domain is not exact match', () => {
  const { request, route } = normalizeRequest(new Request('https://api.fonts.example.com/test/'), TEST_ROUTES)
  expect(request.url).toEqual('https://api.fonts.example.com/test/')
  expect(route).toBeUndefined()
})

test('simple path replace', () => {
  const { request, route } = normalizeRequest(new Request('https://example.com/old-path'), TEST_ROUTES)
  expect(request.url).toEqual('https://example.com/new-path')
  expect(route).toBeDefined()
})

test('maps pdf to s3 bucket location (virtual-hosted style for dot-free bucket)', () => {
  const { request, route } = normalizeRequest(new Request('https://cdn.example.com/some/file.pdf'), TEST_ROUTES)
  expect(request.url).toEqual('https://bucket-name.s3.eu-central-1.amazonaws.com/public/some/file.pdf')
  expect(route).toBeDefined()
})

test('maps object route value origin', () => {
  const { request, route } = normalizeRequest(new Request('https://object.example.com/some/file.pdf'), TEST_ROUTES)
  expect(request.url).toEqual('https://bucket-name.s3.eu-central-1.amazonaws.com/object/some/file.pdf')
  expect(route?.origin).toEqual('s3://eu-central-1.bucket-name/object')
  expect(route?.edgeCacheTtl).toBe(123)
})

// --- EU Sovereign Cloud ---

test('maps to amazonaws.eu for EU Sovereign Cloud region (eusc-*)', () => {
  const routes = { 'sovereign.example.com': 's3://eusc-de-east-1.my-bucket/assets' }
  const { request, route } = normalizeRequest(new Request('https://sovereign.example.com/file.js'), routes)
  expect(request.url).toEqual('https://my-bucket.s3.eusc-de-east-1.amazonaws.eu/assets/file.js')
  expect(route).toBeDefined()
})

test('maps SPA to amazonaws.eu for EU Sovereign Cloud region', () => {
  const routes = { 'sovereign.example.com': 's3://eusc-de-east-1.my-app' }
  const { request, route } = normalizeRequest(new Request('https://sovereign.example.com/dashboard'), routes)
  expect(request.url).toEqual('https://my-app.s3.eusc-de-east-1.amazonaws.eu/index.html')
  expect(route).toBeDefined()
})

// --- Guard: bucket named "eusc-*" in standard AWS must NOT trigger .amazonaws.eu ---

test('does NOT use amazonaws.eu when bucket name starts with eusc but region is standard', () => {
  const routes = { 'edge.example.com': 's3://eu-central-1.eusc-named-bucket/public' }
  const { request, route } = normalizeRequest(new Request('https://edge.example.com/file.js'), routes)
  expect(request.url).toEqual('https://eusc-named-bucket.s3.eu-central-1.amazonaws.com/public/file.js')
  expect(route).toBeDefined()
})

// --- Account Regional namespace buckets ---

test('works with Account Regional namespace bucket names', () => {
  const routes = { 'app.example.com': 's3://eu-central-1.my-app-123456789012-eu-central-1-an/assets' }
  const { request, route } = normalizeRequest(new Request('https://app.example.com/file.js'), routes)
  expect(request.url).toEqual('https://my-app-123456789012-eu-central-1-an.s3.eu-central-1.amazonaws.com/assets/file.js')
  expect(route).toBeDefined()
})

// --- Request property preservation ---

test('preserves HTTP method on matched route', () => {
  const routes = { 'api.example.com': 'https://backend.example.com' }
  const original = new Request('https://api.example.com/data', { method: 'POST' })
  const { request } = normalizeRequest(original, routes)
  expect(request.method).toEqual('POST')
})

test('preserves request headers on matched route', () => {
  const routes = { 'api.example.com': 'https://backend.example.com' }
  const original = new Request('https://api.example.com/data', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer token123' },
  })
  const { request } = normalizeRequest(original, routes)
  expect(request.headers.get('Content-Type')).toEqual('application/json')
  expect(request.headers.get('Authorization')).toEqual('Bearer token123')
})

test('preserves request body on matched route', async () => {
  const routes = { 'api.example.com': 'https://backend.example.com' }
  const body = JSON.stringify({ key: 'value' })
  const original = new Request('https://api.example.com/data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
  const { request } = normalizeRequest(original, routes)
  const text = await request.text()
  expect(text).toEqual(body)
})

// --- Route fallthrough (break vs continue) ---

test('matches a later route when an earlier route is a partial substring match', () => {
  const routes = {
    'example.com': 'https://frontend.example.com',
    'api.example.com': 'https://backend.example.com',
  }
  const { request, route } = normalizeRequest(new Request('https://api.example.com/data'), routes, true)
  expect(request.url).toEqual('https://backend.example.com/index.html')
  expect(route).toBeDefined()
})

// --- spa flag ---

test('a storage origin is an SPA by default', () => {
  const routes = { 'app.example.com': 's3://eu-central-1.bucket/app' }
  const { request } = normalizeRequest(new Request('https://app.example.com/users'), routes)
  expect(request.url).toEqual('https://bucket.s3.eu-central-1.amazonaws.com/app/index.html')
})

test('an https origin is a plain proxy by default', () => {
  const routes = { 'api.example.com': 'https://backend.example.com' }
  const { request } = normalizeRequest(new Request('https://api.example.com/v1/users?page=2'), routes)
  expect(request.url).toEqual('https://backend.example.com/v1/users?page=2')
})

test('a config spa default turns an https origin into an SPA', () => {
  const routes = { 'app.example.com': 'https://blob.example/app' }
  const { request } = normalizeRequest(new Request('https://app.example.com/users'), routes, true)
  expect(request.url).toEqual('https://blob.example/app/index.html')
})

test('a route spa value wins over the config default', () => {
  const routes = {
    'api.example.com': { origin: 'https://backend.example.com', spa: false },
    'files.example.com': { origin: 's3://eu-central-1.bucket/files', spa: false },
  }
  expect(normalizeRequest(new Request('https://api.example.com/v1/users'), routes, true).request.url)
    .toEqual('https://backend.example.com/v1/users')
  expect(normalizeRequest(new Request('https://files.example.com/reports/2026'), routes).request.url)
    .toEqual('https://bucket.s3.eu-central-1.amazonaws.com/files/reports/2026')
})

// --- Path keys ---

test('does not match query strings for path routes', () => {
  const routes = { 'example.com/public': 's3://eu-central-1.bucket/public' }
  const { route } = normalizeRequest(new Request('https://example.com/?next=/public'), routes)
  expect(route).toBeUndefined()
})

test('path keys match on a segment boundary only', () => {
  const routes = { 'example.com/admin': 's3://eu-central-1.bucket/admin' }
  const { route } = normalizeRequest(new Request('https://example.com/admin-panel/file.js'), routes)
  expect(route).toBeUndefined()
})

test('trailing slash keys match descendants for host paths', () => {
  const routes = { 'example.com/admin/': 's3://eu-central-1.bucket/admin' }
  const { request, route } = normalizeRequest(new Request('https://example.com/admin/file.js'), routes)
  expect(request.url).toEqual('https://bucket.s3.eu-central-1.amazonaws.com/admin/file.js')
  expect(route).toBeDefined()
})

test('trailing slash keys match the bare path', () => {
  const routes = { 'example.com/admin/': 's3://eu-central-1.bucket/admin' }
  const { request } = normalizeRequest(new Request('https://example.com/admin'), routes)
  expect(request.url).toEqual('https://bucket.s3.eu-central-1.amazonaws.com/admin/index.html')
})

test('path key rewrites deep paths to a path origin on the same host', () => {
  const routes = { 'example.com/old-path': '/new-path' }
  const { request } = normalizeRequest(new Request('https://example.com/old-path/a/b.js?x=1'), routes)
  expect(request.url).toEqual('https://example.com/new-path/a/b.js?x=1')
})

// --- Host keys ---

test('host keys match the hostname only, never a suffix or prefix', () => {
  const routes = { 'example.com': 'https://origin.example/base' }
  expect(normalizeRequest(new Request('https://example.com.evil.test/'), routes).route).toBeUndefined()
  expect(normalizeRequest(new Request('https://evil-example.com/'), routes).route).toBeUndefined()
})

test('host keys match case-insensitively', () => {
  const routes = { 'App.Example.com': 'https://origin.example/base' }
  const { request } = normalizeRequest(new Request('https://app.example.com/a.js'), routes)
  expect(request.url).toEqual('https://origin.example/base/a.js')
})

test('an incoming port never reaches the origin', () => {
  const routes = { 'app.example.com': 'https://origin.example/base' }
  const { request } = normalizeRequest(new Request('https://app.example.com:8443/a.js'), routes)
  expect(request.url).toEqual('https://origin.example/base/a.js')
})

// --- Query strings ---

test('assets keep their query string on SPA routes', () => {
  const routes = { 'app.example.com': 's3://eu-central-1.bucket/app' }
  const { request } = normalizeRequest(new Request('https://app.example.com/file.js?v=1'), routes)
  expect(request.url).toEqual('https://bucket.s3.eu-central-1.amazonaws.com/app/file.js?v=1')
})

test('navigations drop their query string on SPA routes', () => {
  const routes = { 'app.example.com': 's3://eu-central-1.bucket/app' }
  const { request } = normalizeRequest(new Request('https://app.example.com/users?page=2'), routes)
  expect(request.url).toEqual('https://bucket.s3.eu-central-1.amazonaws.com/app/index.html')
})

test('proxied routes keep their query string', () => {
  const routes = { 'api.example.com': 'https://backend.example.com' }
  const { request } = normalizeRequest(new Request('https://api.example.com/data?page=2'), routes)
  expect(request.url).toEqual('https://backend.example.com/data?page=2')
})

// --- Origins with a trailing slash ---

test('an origin with a trailing slash produces a clean SPA path', () => {
  const routes = { 'app.example.com': 's3://eu-central-1.bucket/app/' }
  const { request } = normalizeRequest(new Request('https://app.example.com/dashboard'), routes)
  expect(request.url).toEqual('https://bucket.s3.eu-central-1.amazonaws.com/app/index.html')
})

test('an origin with a trailing slash produces a clean asset path', () => {
  const routes = { 'app.example.com': 'https://origin.example/base/' }
  const { request } = normalizeRequest(new Request('https://app.example.com/a.js'), routes)
  expect(request.url).toEqual('https://origin.example/base/a.js')
})

// --- Precedence ---

test('a host and path key beats a host key', () => {
  const routes = {
    'example.com': 's3://eu-central-1.bucket/www',
    'example.com/admin': 's3://eu-central-1.bucket/admin',
  }
  const { request } = normalizeRequest(new Request('https://example.com/admin/a.js'), routes)
  expect(request.url).toEqual('https://bucket.s3.eu-central-1.amazonaws.com/admin/a.js')
})

test('among path keys the longer path wins', () => {
  const routes = {
    'docs.example.com/docs': 's3://eu-central-1.bucket/docs',
    'docs.example.com/docs/api': 's3://eu-central-1.bucket/api',
  }
  const { request } = normalizeRequest(new Request('https://docs.example.com/docs/api/a.js'), routes)
  expect(request.url).toEqual('https://bucket.s3.eu-central-1.amazonaws.com/api/a.js')
})

// --- Encoded paths ---

test('an encoded path resolves to the route it decodes to and forwards the raw remainder', () => {
  const routes = {
    'example.com': 'https://origin.example/pub',
    'example.com/admin': { origin: 'https://origin.example/admin', auth: [{ type: 'basic', username: 'u', password: 'p' }] as const },
  }
  const { request, route } = normalizeRequest(new Request('https://example.com/%61dmin/sec%20ret'), routes)
  expect(route?.key).toBe('example.com/admin')
  expect(request.url).toEqual('https://origin.example/admin/sec%20ret')
})

test('a path with an encoded slash or a malformed escape matches no route', () => {
  const routes = { 'example.com': 'https://origin.example/pub' }
  expect(normalizeRequest(new Request('https://example.com/a%2Fb'), routes).route).toBeUndefined()
  expect(normalizeRequest(new Request('https://example.com/%zz'), routes).route).toBeUndefined()
})

test('an encoded asset name still counts as an asset', () => {
  const routes = { 'app.example.com': 's3://eu-central-1.bucket/app' }
  const { request } = normalizeRequest(new Request('https://app.example.com/my%20file.js'), routes)
  expect(request.url).toEqual('https://bucket.s3.eu-central-1.amazonaws.com/app/my%20file.js')
})

test('a Unicode host key matches its punycode hostname', () => {
  const routes = { 'exämple.com': 'https://origin.example/base' }
  const { request } = normalizeRequest(new Request('https://exämple.com/a.js'), routes)
  expect(request.url).toEqual('https://origin.example/base/a.js')
})

test('a path origin never carries the request port', () => {
  const routes = { 'example.com/old': '/new' }
  const { request } = normalizeRequest(new Request('https://example.com:8443/old/a.js'), routes)
  expect(request.url).toEqual('https://example.com/new/a.js')
})
