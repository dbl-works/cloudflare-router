import { test, expect, vi } from 'vitest'
import { ExecutionContext } from '@cloudflare/workers-types'
import { createRouter } from '../src/cloudflare-router'
import { Config } from '../src/config'
import handleRequest from '../src/utils/handle-request'

vi.mock('../src/utils/handle-request', () => {
  return {
    default: vi.fn().mockResolvedValue(new Response('mocked'))
  }
})

const TEST_CONFIG: Config = {
  routes: {},
  edgeCacheTtl: 360
}

test('it works without deployments key', () => {
  const router = createRouter(TEST_CONFIG)
  expect(router.fetch).toBeDefined()
})

test('it throws if deployments key is present', () => {
  expect(() => {
    // @ts-expect-error intentionally passing invalid config
    createRouter({ deployments: [], routes: {} })
  }).toThrow(/auth/)
})

test('A route without edgeCacheTtl uses the top-level value', async () => {
  const router = createRouter({ routes: { 'example.com': 's3://eu-central-1.bucket' }, edgeCacheTtl: 123 })
  await router.fetch(new Request('https://example.com'), {}, {} as ExecutionContext)
  expect(handleRequest).toHaveBeenCalledWith(expect.any(Request), 123)
})

test('A route with edgeCacheTtl overrides the top-level value', async () => {
  const router = createRouter({ routes: { 'example.com': { origin: 's3://eu-central-1.bucket', edgeCacheTtl: 456 } }, edgeCacheTtl: 123 })
  await router.fetch(new Request('https://example.com'), {}, {} as ExecutionContext)
  expect(handleRequest).toHaveBeenCalledWith(expect.any(Request), 456)
})

test('A route with edgeCacheTtl: 0 disables the cache under a non-zero default', async () => {
  const router = createRouter({ routes: { 'example.com': { origin: 's3://eu-central-1.bucket', edgeCacheTtl: 0 } }, edgeCacheTtl: 123 })
  await router.fetch(new Request('https://example.com'), {}, {} as ExecutionContext)
  expect(handleRequest).toHaveBeenCalledWith(expect.any(Request), 0)
})

test('A config with no edgeCacheTtl anywhere does not cache (v2 behavior)', async () => {
  const router = createRouter({ routes: { 'example.com': 's3://eu-central-1.bucket' } })
  await router.fetch(new Request('https://example.com'), {}, {} as ExecutionContext)
  expect(handleRequest).toHaveBeenCalledWith(expect.any(Request), 0)
})

// --- Startup validation: a malformed route throws in createRouter, not on a request ---

const invalidRoutes: [string, Config['routes'], RegExp][] = [
  ['an empty key', { '': 's3://eu-central-1.bucket' }, /must not be empty/],
  ['a key with a scheme', { 'https://example.com': 's3://eu-central-1.bucket' }, /scheme/],
  ['a key with a port', { 'example.com:443': 's3://eu-central-1.bucket' }, /port/],
  ['a wildcard key', { '*.example.com': 's3://eu-central-1.bucket' }, /wildcard/i],
  ['a key with whitespace', { 'exam ple.com': 's3://eu-central-1.bucket' }, /not a valid hostname/],
  ['a key with a backslash', { 'example.com/foo\\bar': 's3://eu-central-1.bucket' }, /key path contains a backslash/],
  ['a key with a query', { 'example.com?preview=1': 's3://eu-central-1.bucket' }, /query or fragment/],
  ['a key with a fragment', { 'example.com#top': 's3://eu-central-1.bucket' }, /query or fragment/],
  ['a path-only key', { '/app': 's3://eu-central-1.bucket' }, /must name a host/],
  ['a key with a dot segment', { 'example.com/foo/../app': 's3://eu-central-1.bucket' }, /key path contains a "\." or "\.\." segment/],
  ['a key with an empty segment', { 'example.com/foo//app': 's3://eu-central-1.bucket' }, /key path contains an empty segment/],
  ['a percent-encoded key path', { 'example.com/%61pp': 's3://eu-central-1.bucket' }, /key path is percent-encoded/],
  ['two keys that differ by a trailing slash', { 'example.com/admin': 's3://eu-central-1.bucket/a', 'example.com/admin/': 's3://eu-central-1.bucket/b' }, /same route/],
  ['two keys that differ by case', { 'Example.com': 's3://eu-central-1.bucket/a', 'example.com': 's3://eu-central-1.bucket/b' }, /same route/],
  ['an s3 origin without a region', { 'example.com': 's3://bucket/app' }, /s3:\/\/REGION\.BUCKET/],
  ['an s3 origin with a space', { 'example.com': 's3://eu-central-1.my bucket/app' }, /s3:\/\/REGION\.BUCKET/],
  ['an s3 bucket shorter than 3 characters', { 'example.com': 's3://eu-central-1.a/app' }, /3 to 63/],
  ['an s3 origin with an encoded dot segment', { 'example.com': 's3://eu-central-1.assets.example/%2e%2e/private' }, /prefix is percent-encoded/],
  ['an s3 origin with a backslash', { 'example.com': 's3://eu-central-1.bucket/foo\\bar' }, /prefix contains a backslash/],
  ['an http origin', { 'example.com': 'http://origin.example' }, /https:\/\//],
  ['an origin with credentials', { 'example.com': 'https://user:pass@origin.example' }, /credentials/],
  ['an origin with a query', { 'example.com': 'https://origin.example/base?tenant=1' }, /query or fragment/],
  ['an origin with a fragment', { 'example.com': 's3://eu-central-1.bucket/app#x' }, /query or fragment/],
  ['an https origin with an encoded dot segment', { 'example.com': 'https://origin.example/%2e%2e/x' }, /origin path is percent-encoded/],
  ['a path origin with a backslash', { 'example.com/app': '/foo\\../app' }, /origin path contains a backslash/],
  ['a path origin with a dot segment that normalizes back onto the key', { 'example.com/app': '/foo/../app' }, /origin path contains a "\." or "\.\." segment/],
  ['an origin equal to the route host', { 'example.com': 'example.com' }, /fetches itself/],
  ['an https origin on the route host', { 'example.com': 'https://example.com/other' }, /fetches itself/],
  ['a path origin on a host-only key', { 'example.com': '/index.html' }, /fetches itself/],
  ['a path origin under the key path', { 'example.com/old': '/old/v2' }, /fetches itself/],
  ['a two-host cycle', { 'a.example.com': 'https://b.example.com', 'b.example.com': 'https://a.example.com' }, /leads back to this route through "b.example.com"/],
  ['a cycle through a path route', { 'a.example.com': 'https://b.example.com/', 'b.example.com/legacy': 'https://a.example.com' }, /fetches itself/],
  ['a basic rule without a password', { 'example.com': { origin: 's3://eu-central-1.bucket', auth: [{ type: 'basic', username: 'u', password: '' }] } }, /username and password/],
  ['an ip rule without addresses', { 'example.com': { origin: 's3://eu-central-1.bucket', auth: [{ type: 'ip', allow: [] }] } }, /at least one address/],
  ['a negative edgeCacheTtl', { 'example.com': { origin: 's3://eu-central-1.bucket', edgeCacheTtl: -1 } }, /whole number/],
  ['a protected application origin with a cache', { 'example.com': { origin: 'https://backend.example', auth: [{ type: 'ip', allow: ['1.1.1.1'] }], edgeCacheTtl: 60 } }, /caches only a storage origin/],
  // @ts-expect-error intentionally passing a string
  ['a string cors value on a route', { 'example.com': { origin: 'https://origin.example', cors: 'false' } }, /"cors" in route "example.com" must be true or false/],
]

for (const [name, routes, message] of invalidRoutes) {
  test(`createRouter rejects ${name}`, () => {
    expect(() => createRouter({ routes })).toThrow(message)
  })
}

test('createRouter accepts every documented key and origin form', () => {
  expect(() => createRouter({
    routes: {
      'www.example.com': 's3://eu-central-1.bucket/www',
      'example.com/admin': { origin: 'https://origin.example/admin/', auth: [] },
      'www.example.com/old-path': '/new-path',
      'api.example.com': 'backend.example/base',
      'Sovereign.example.com': 's3://eusc-de-east-1.bucket',
    },
  })).not.toThrow()
})

test('createRouter rejects a string cors or spa value at the top level', () => {
  // @ts-expect-error intentionally passing a string
  expect(() => createRouter({ cors: 'false', routes: { 'example.com': 's3://eu-central-1.bucket' } })).toThrow(/"cors" in the configuration must be true or false/)
  // @ts-expect-error intentionally passing a string
  expect(() => createRouter({ spa: 1, routes: { 'example.com': 's3://eu-central-1.bucket' } })).toThrow(/"spa" in the configuration must be true or false/)
})

test('createRouter accepts a bucket of exactly 3 and 63 characters', () => {
  expect(() => createRouter({ routes: { 'a.example.com': 's3://eu-central-1.abc/app', 'b.example.com': `s3://eu-central-1.${'a'.repeat(63)}` } })).not.toThrow()
})

test('createRouter rejects a protected application origin with a top-level cache', () => {
  expect(() => createRouter({
    edgeCacheTtl: 60,
    auth: [{ type: 'basic', username: 'u', password: 'p' }],
    routes: { 'app.example.com': 'https://backend.example' },
  })).toThrow(/caches only a storage origin/)
})

test('createRouter accepts a protected storage origin with a cache', () => {
  expect(() => createRouter({
    edgeCacheTtl: 60,
    auth: [{ type: 'basic', username: 'u', password: 'p' }],
    routes: { 'app.example.com': 's3://eu-central-1.bucket/app' },
  })).not.toThrow()
})

test('createRouter accepts a chain that ends at a storage origin', () => {
  // a → b/legacy → a/v2 → S3. The /v2 route is more specific than the host route, so no cycle.
  expect(() => createRouter({
    routes: {
      'a.example.com': 'https://b.example.com/',
      'b.example.com/legacy': 'https://a.example.com/v2',
      'a.example.com/v2': 's3://eu-central-1.bucket/v2',
    },
  })).not.toThrow()
})

test('createRouter compiles the routes once', async () => {
  const router = createRouter({ routes: { 'example.com': 's3://eu-central-1.bucket' } })
  const compile = vi.spyOn(await import('../src/utils/compile-routes'), 'compileRoutes')
  await router.fetch(new Request('https://example.com/a'), {}, {} as ExecutionContext)
  await router.fetch(new Request('https://example.com/b'), {}, {} as ExecutionContext)
  expect(compile).not.toHaveBeenCalled()
})

test('it throws if isS3Site key is present', () => {
  expect(() => {
    // @ts-expect-error intentionally passing invalid config
    createRouter({ isS3Site: false, routes: {} })
  }).toThrow(/spa/)
})
