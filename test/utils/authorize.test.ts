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

test('Strips Basic credentials from origin-bound requests (IP grants, route uses Basic)', async () => {
  const route: Route = { origin: 's3://bucket', auth: [basicAuthMethod, ipAuthMethod] }
  let forwardedReq: Request | undefined
  const callback = vi.fn().mockImplementation(async (req) => {
    forwardedReq = req
    return new Response('ok')
  })
  const res = await authorize(createAuthRequest('GET', basicAuthHeader, '192.168.1.1'), route, undefined, callback)
  expect(res.status).toBe(200)
  expect(forwardedReq?.headers.get('Authorization')).toBeNull()
})

test('Strips Basic credentials from origin-bound requests (OPTIONS)', async () => {
  const route: Route = { origin: 's3://bucket', auth: [basicAuthMethod] }
  let forwardedReq: Request | undefined
  const callback = vi.fn().mockImplementation(async (req) => {
    forwardedReq = req
    return new Response('ok')
  })
  const res = await authorize(createAuthRequest('OPTIONS', basicAuthHeader), route, undefined, callback)
  expect(res.status).toBe(200)
  expect(forwardedReq?.headers.get('Authorization')).toBeNull()
})

// --- Authentication scheme is case-insensitive (RFC 7235) ---

test('accepts a lowercase basic scheme', async () => {
  const route: Route = { origin: 's3://bucket', auth: [basicAuthMethod] }
  const res = await authorize(createAuthRequest('GET', 'basic ' + btoa('test:letmein')), route, undefined, mockCallback)
  expect(res.status).toBe(200)
})

test('Strips lowercase basic credentials from origin-bound requests', async () => {
  const route: Route = { origin: 's3://bucket', auth: [basicAuthMethod, ipAuthMethod] }
  let forwardedReq: Request | undefined
  const callback = vi.fn().mockImplementation(async (req) => {
    forwardedReq = req
    return new Response('ok')
  })
  const res = await authorize(createAuthRequest('GET', 'basic ' + btoa('x:y'), '192.168.1.1'), route, undefined, callback)
  expect(res.status).toBe(200)
  expect(forwardedReq?.headers.get('Authorization')).toBeNull()
})

// --- Stripping is scoped to routes that use Basic auth ---

test('Keeps Basic credentials on a public route', async () => {
  const route: Route = { origin: 'https://origin.example', auth: [] }
  let forwardedReq: Request | undefined
  const callback = vi.fn().mockImplementation(async (req) => {
    forwardedReq = req
    return new Response('ok')
  })
  await authorize(createAuthRequest('GET', basicAuthHeader), route, [basicAuthMethod], callback)
  expect(forwardedReq?.headers.get('Authorization')).toBe(basicAuthHeader)
})

test('Keeps Basic credentials on an IP-only route', async () => {
  const route: Route = { origin: 'https://origin.example', auth: [ipAuthMethod] }
  let forwardedReq: Request | undefined
  const callback = vi.fn().mockImplementation(async (req) => {
    forwardedReq = req
    return new Response('ok')
  })
  const res = await authorize(createAuthRequest('GET', basicAuthHeader, '192.168.1.1'), route, undefined, callback)
  expect(res.status).toBe(200)
  expect(forwardedReq?.headers.get('Authorization')).toBe(basicAuthHeader)
})

test('Keeps a Bearer token when the route uses Basic auth and the IP rule grants access', async () => {
  const route: Route = { origin: 'https://origin.example', auth: [basicAuthMethod, ipAuthMethod] }
  let forwardedReq: Request | undefined
  const callback = vi.fn().mockImplementation(async (req) => {
    forwardedReq = req
    return new Response('ok')
  })
  const res = await authorize(createAuthRequest('GET', 'Bearer token123', '192.168.1.1'), route, undefined, callback)
  expect(res.status).toBe(200)
  expect(forwardedReq?.headers.get('Authorization')).toBe('Bearer token123')
})

test('Strips Basic credentials when the top-level auth uses Basic', async () => {
  const route: Route = { origin: 'https://origin.example' }
  let forwardedReq: Request | undefined
  const callback = vi.fn().mockImplementation(async (req) => {
    forwardedReq = req
    return new Response('ok')
  })
  const res = await authorize(createAuthRequest('GET', basicAuthHeader), route, [basicAuthMethod], callback)
  expect(res.status).toBe(200)
  expect(forwardedReq?.headers.get('Authorization')).toBeNull()
})

// --- IP rules ---

test('A missing CF-Connecting-IP header never satisfies an IP rule', async () => {
  const route: Route = { origin: 's3://eu-central-1.bucket', auth: [{ type: 'ip', allow: ['0.0.0.0/0'] }] }
  const res = await authorize(new Request('https://example.com'), route, undefined, mockCallback)
  expect(res.status).toBe(401)
})

// --- Unicode credentials ---

test('A credential stored in NFD authenticates a client that sends NFC', async () => {
  const route: Route = { origin: 's3://eu-central-1.bucket', auth: [{ type: 'basic', username: 'u', password: 'e\u0301' }] }
  const header = 'Basic ' + btoa(String.fromCharCode(...new TextEncoder().encode('u:\u00e9')))
  const res = await authorize(createAuthRequest('GET', header), route, undefined, mockCallback)
  expect(res.status).toBe(200)
})
