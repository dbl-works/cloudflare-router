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
  ['an empty key', { '': 's3://eu-central-1.bucket' }, /empty/],
  ['a key with a scheme', { 'https://example.com': 's3://eu-central-1.bucket' }, /scheme/],
  ['a key with a port', { 'example.com:443': 's3://eu-central-1.bucket' }, /port/],
  ['a wildcard key', { '*.example.com': 's3://eu-central-1.bucket' }, /wildcard/i],
  ['two keys that differ by a trailing slash', { 'example.com/admin': 's3://eu-central-1.bucket/a', 'example.com/admin/': 's3://eu-central-1.bucket/b' }, /same route/],
  ['two keys that differ by case', { 'Example.com': 's3://eu-central-1.bucket/a', 'example.com': 's3://eu-central-1.bucket/b' }, /same route/],
  ['an s3 origin without a region', { 'example.com': 's3://bucket/app' }, /s3:\/\/REGION\.BUCKET/],
  ['an s3 origin with a space', { 'example.com': 's3://eu-central-1.my bucket/app' }, /s3:\/\/REGION\.BUCKET/],
  ['an http origin', { 'example.com': 'http://origin.example' }, /https:\/\//],
  ['an origin equal to the route host', { 'example.com': 'example.com' }, /fetches itself/],
  ['an https origin on the route host', { 'example.com': 'https://example.com/other' }, /fetches itself/],
  ['a path origin on a host-only key', { 'example.com': '/index.html' }, /fetches itself/],
  ['a path origin under the key path', { '/old': '/old/v2' }, /fetches itself/],
  ['a path-only key whose origin path matches the key again on a served host', { '/app': 'https://app.example.com/app', 'app.example.com/other': 's3://eu-central-1.bucket' }, /fetches itself/],
  ['a two-host cycle', { 'a.example.com': 'https://b.example.com', 'b.example.com': 'https://a.example.com' }, /leads back to this route through "b.example.com"/],
  ['a cycle through a path route', { 'a.example.com': 'https://b.example.com/', 'b.example.com/legacy': 'https://a.example.com' }, /fetches itself/],
  ['a key with a query', { 'example.com?preview=1': 's3://eu-central-1.bucket' }, /query or fragment/],
  ['a key with a fragment', { 'example.com#top': 's3://eu-central-1.bucket' }, /query or fragment/],
  ['an origin with credentials', { 'example.com': 'https://user:pass@origin.example' }, /credentials/],
  ['an origin with a query', { 'example.com': 'https://origin.example/base?tenant=1' }, /query or fragment/],
  ['an origin with a fragment', { 'example.com': 's3://eu-central-1.bucket/app#x' }, /query or fragment/],
  ['an s3 origin with a slash in the region', { 'example.com': 's3://eu-central-1/foo.bucket' }, /s3:\/\/REGION\.BUCKET/],
  ['an s3 origin with uppercase', { 'example.com': 's3://eu-central-1.MyBucket' }, /s3:\/\/REGION\.BUCKET/],
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
      '/old-path': '/new-path',
      'api.example.com': 'backend.example/base',
      'Sovereign.example.com': 's3://eusc-de-east-1.bucket',
    },
  })).not.toThrow()
})

test('createRouter treats a host that no key names as external', () => {
  // The worker cannot know that it serves app.example.com, so this passes. See README.
  expect(() => createRouter({ routes: { '/app': 'https://app.example.com/app' } })).not.toThrow()
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
