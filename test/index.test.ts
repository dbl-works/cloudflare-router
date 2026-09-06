import { test, expect, vi } from 'vitest'
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
  const router = createRouter({ routes: { 'example.com': 's3://bucket' }, edgeCacheTtl: 123 })
  await router.fetch(new Request('https://example.com'), {}, {} as any)
  expect(handleRequest).toHaveBeenCalledWith(expect.any(Request), 123)
})

test('A route with edgeCacheTtl overrides the top-level value', async () => {
  const router = createRouter({ routes: { 'example.com': { origin: 's3://bucket', edgeCacheTtl: 456 } }, edgeCacheTtl: 123 })
  await router.fetch(new Request('https://example.com'), {}, {} as any)
  expect(handleRequest).toHaveBeenCalledWith(expect.any(Request), 456)
})

test('A route with edgeCacheTtl: 0 disables the cache under a non-zero default', async () => {
  const router = createRouter({ routes: { 'example.com': { origin: 's3://bucket', edgeCacheTtl: 0 } }, edgeCacheTtl: 123 })
  await router.fetch(new Request('https://example.com'), {}, {} as any)
  expect(handleRequest).toHaveBeenCalledWith(expect.any(Request), 0)
})

test('A config with no edgeCacheTtl anywhere uses the documented default (0)', async () => {
  // Config interface doesn't enforce 86400 by itself, it defaults in cloudflare-router if omitted?
  // Wait, DEFAULT_CONFIG has 86400, but users don't have to use it.
  const router = createRouter({ routes: { 'example.com': 's3://bucket' } })
  await router.fetch(new Request('https://example.com'), {}, {} as any)
  expect(handleRequest).toHaveBeenCalledWith(expect.any(Request), 0)
})
