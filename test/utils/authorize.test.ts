import { test, expect, vi } from 'vitest'
import { authorize } from '../../src/utils/authorize'
import { Route } from '../../src/config'

const mockCallback = vi.fn().mockResolvedValue(new Response('ok'))

const basicAuthMethod = { type: 'basic', username: 'test', password: 'letmein' } as const
const ipAuthMethod = { type: 'ip', allow: ['192.168.1.1'] } as const

const createAuthRequest = (method = 'GET', authHeader?: string, ip = '1.1.1.1') => {
  const req = new Request('https://example.com', {
    method,
    headers: authHeader ? { 'Authorization': authHeader, 'CF-Connecting-IP': ip } : { 'CF-Connecting-IP': ip }
  })
  return req
}

const basicAuthHeader = 'Basic ' + btoa('test:letmein')

test('A public route passes through', async () => {
  const route: Route = { origin: 's3://bucket' }
  const res = await authorize(createAuthRequest(), route, undefined, mockCallback)
  expect(res.status).toBe(200)
})

test('A route with auth returns 401 without credentials', async () => {
  const route: Route = { origin: 's3://bucket', auth: [basicAuthMethod] }
  const res = await authorize(createAuthRequest(), route, undefined, mockCallback)
  expect(res.status).toBe(401)
})

test('A route with auth passes through with correct credentials', async () => {
  const route: Route = { origin: 's3://bucket', auth: [basicAuthMethod] }
  const res = await authorize(createAuthRequest('GET', basicAuthHeader), route, undefined, mockCallback)
  expect(res.status).toBe(200)
})

test('A route with auth: [] ignores the top-level auth', async () => {
  const route: Route = { origin: 's3://bucket', auth: [] }
  const res = await authorize(createAuthRequest(), route, [basicAuthMethod], mockCallback)
  expect(res.status).toBe(200)
})

test('A route without auth applies the top-level auth', async () => {
  const route: Route = { origin: 's3://bucket' }
  const res = await authorize(createAuthRequest(), route, [basicAuthMethod], mockCallback)
  expect(res.status).toBe(401)

  const res2 = await authorize(createAuthRequest('GET', basicAuthHeader), route, [basicAuthMethod], mockCallback)
  expect(res2.status).toBe(200)
})

test('A route with auth overrides the top-level auth', async () => {
  const route: Route = { origin: 's3://bucket', auth: [ipAuthMethod] }
  // Top-level expects basic, but route expects IP. IP should be checked.
  const res = await authorize(createAuthRequest('GET', basicAuthHeader, '2.2.2.2'), route, [basicAuthMethod], mockCallback)
  expect(res.status).toBe(401)

  const res2 = await authorize(createAuthRequest('GET', undefined, '192.168.1.1'), route, [basicAuthMethod], mockCallback)
  expect(res2.status).toBe(200)
})

test('An IP rule and a basic rule on one route both grant access', async () => {
  const route: Route = { origin: 's3://bucket', auth: [basicAuthMethod, ipAuthMethod] }
  // Fails both
  const res = await authorize(createAuthRequest('GET', undefined, '2.2.2.2'), route, undefined, mockCallback)
  expect(res.status).toBe(401)

  // Passes basic
  const res2 = await authorize(createAuthRequest('GET', basicAuthHeader, '2.2.2.2'), route, undefined, mockCallback)
  expect(res2.status).toBe(200)

  // Passes IP
  const res3 = await authorize(createAuthRequest('GET', undefined, '192.168.1.1'), route, undefined, mockCallback)
  expect(res3.status).toBe(200)
})

test('An unknown host returns 404', async () => {
  const res = await authorize(createAuthRequest(), undefined, undefined, mockCallback)
  expect(res.status).toBe(404)
  expect(await res.text()).toBe('Unknown host')
})

test('An OPTIONS request to a protected route passes through', async () => {
  const route: Route = { origin: 's3://bucket', auth: [basicAuthMethod] }
  const res = await authorize(createAuthRequest('OPTIONS'), route, undefined, mockCallback)
  expect(res.status).toBe(200)
})

test('An OPTIONS request to an unknown host returns 404', async () => {
  const res = await authorize(createAuthRequest('OPTIONS'), undefined, undefined, mockCallback)
  expect(res.status).toBe(404)
})
