import { test, expect, vi } from 'vitest'
import { authorize } from '../../src/utils/authorize'
import { AuthMethods } from '../../src/config'

const mockCallback = vi.fn().mockResolvedValue(new Response('ok'))

const basicAuthMethod = { type: 'basic', username: 'test', password: 'letmein' } as const
const ipAuthMethod = { type: 'ip', allow: ['192.168.1.1'] } as const
const basicAuthHeader = 'Basic ' + btoa('test:letmein')

/** A compiled route with resolved rules. Stripping defaults to what compileRoutes derives for a single-route host. */
const route = (auth: AuthMethods[] = [], stripBasicCredentials = auth.some((rule) => rule.type === 'basic'), cors = false) =>
  ({ auth, cors, stripBasicCredentials })

const request = (method = 'GET', headers: Record<string, string> = {}, body?: string) =>
  new Request('https://example.com', { method, headers, body })

const authed = (method = 'GET', authHeader?: string, ip = '1.1.1.1') =>
  request(method, authHeader ? { Authorization: authHeader, 'CF-Connecting-IP': ip } : { 'CF-Connecting-IP': ip })

/** Runs authorize and returns the request the callback received, or undefined. */
const forwarded = async (req: Request, compiled: ReturnType<typeof route>) => {
  let seen: Request | undefined
  await authorize(req, compiled, async (r) => { seen = r; return new Response('ok') })
  return seen
}

test('A public route passes through', async () => {
  expect((await authorize(authed(), route(), mockCallback)).status).toBe(200)
})

test('A protected route returns 401 without credentials', async () => {
  const res = await authorize(authed(), route([basicAuthMethod]), mockCallback)
  expect(res.status).toBe(401)
  expect(res.headers.get('WWW-Authenticate')).toMatch(/^Basic /)
})

test('A protected route passes through with correct credentials', async () => {
  expect((await authorize(authed('GET', basicAuthHeader), route([basicAuthMethod]), mockCallback)).status).toBe(200)
})

test('Wrong credentials return 401', async () => {
  expect((await authorize(authed('GET', 'Basic ' + btoa('test:wrong')), route([basicAuthMethod]), mockCallback)).status).toBe(401)
})

test('An IP rule grants access from an allowed address only', async () => {
  expect((await authorize(authed('GET', undefined, '192.168.1.1'), route([ipAuthMethod]), mockCallback)).status).toBe(200)
  expect((await authorize(authed('GET', undefined, '2.2.2.2'), route([ipAuthMethod]), mockCallback)).status).toBe(403)
})

test('An IP-only failure is a 403 without a Basic challenge', async () => {
  const res = await authorize(authed('GET', undefined, '2.2.2.2'), route([ipAuthMethod]), mockCallback)
  expect(res.status).toBe(403)
  expect(res.headers.get('WWW-Authenticate')).toBeNull()
})

test('A failure on a route with a Basic rule is a 401 with a challenge', async () => {
  const res = await authorize(authed('GET', undefined, '2.2.2.2'), route([basicAuthMethod, ipAuthMethod]), mockCallback)
  expect(res.status).toBe(401)
  expect(res.headers.get('WWW-Authenticate')).toMatch(/^Basic /)
})

test('An IP rule and a basic rule on one route both grant access', async () => {
  const compiled = route([basicAuthMethod, ipAuthMethod])
  expect((await authorize(authed('GET', undefined, '2.2.2.2'), compiled, mockCallback)).status).toBe(401)
  expect((await authorize(authed('GET', basicAuthHeader, '2.2.2.2'), compiled, mockCallback)).status).toBe(200)
  expect((await authorize(authed('GET', undefined, '192.168.1.1'), compiled, mockCallback)).status).toBe(200)
})

test('An unknown host returns 404', async () => {
  const res = await authorize(authed(), undefined, mockCallback)
  expect(res.status).toBe(404)
  expect(await res.text()).toBe('Unknown host')
})

test('An OPTIONS request to an unknown host returns 404', async () => {
  expect((await authorize(authed('OPTIONS'), undefined, mockCallback)).status).toBe(404)
})

// --- OPTIONS: only a CORS preflight on a route with cors skips authentication ---

const preflightHeaders = { Origin: 'https://app.example.com', 'Access-Control-Request-Method': 'PUT' }
const corsRoute = route([basicAuthMethod], true, true)

test('A CORS preflight to a protected route with cors passes through', async () => {
  expect((await authorize(request('OPTIONS', preflightHeaders), corsRoute, mockCallback)).status).toBe(200)
})

test('A CORS preflight to a protected route without cors needs credentials', async () => {
  expect((await authorize(request('OPTIONS', preflightHeaders), route([basicAuthMethod]), mockCallback)).status).toBe(401)
  expect((await authorize(request('OPTIONS', preflightHeaders), route([ipAuthMethod]), mockCallback)).status).toBe(403)
})

test('A plain OPTIONS request to a protected route needs credentials even with cors', async () => {
  expect((await authorize(request('OPTIONS'), corsRoute, mockCallback)).status).toBe(401)
  expect((await authorize(request('OPTIONS', { Origin: 'https://app.example.com' }), corsRoute, mockCallback)).status).toBe(401)
  expect((await authorize(request('OPTIONS', { 'Access-Control-Request-Method': 'PUT' }), corsRoute, mockCallback)).status).toBe(401)
})

test('An OPTIONS request with a body is not a preflight', async () => {
  expect((await authorize(request('OPTIONS', preflightHeaders, 'payload'), corsRoute, mockCallback)).status).toBe(401)
})

test('An authenticated OPTIONS request passes through', async () => {
  expect((await authorize(request('OPTIONS', { Authorization: basicAuthHeader }), route([basicAuthMethod]), mockCallback)).status).toBe(200)
})

// --- Basic scheme is case-insensitive (RFC 7235) ---

test('accepts a lowercase basic scheme', async () => {
  expect((await authorize(authed('GET', 'basic ' + btoa('test:letmein')), route([basicAuthMethod]), mockCallback)).status).toBe(200)
})

// --- Stripping follows the host, not the route ---

test('Strips Basic credentials on a Basic-protected route', async () => {
  const seen = await forwarded(authed('GET', basicAuthHeader), route([basicAuthMethod]))
  expect(seen?.headers.get('Authorization')).toBeNull()
})

test('Strips lowercase basic credentials', async () => {
  const seen = await forwarded(authed('GET', 'basic ' + btoa('x:y'), '192.168.1.1'), route([basicAuthMethod, ipAuthMethod]))
  expect(seen?.headers.get('Authorization')).toBeNull()
})

test('Strips Basic credentials on a preflight', async () => {
  const seen = await forwarded(request('OPTIONS', { ...preflightHeaders, Authorization: basicAuthHeader }), corsRoute)
  expect(seen?.headers.get('Authorization')).toBeNull()
})

test('Strips Basic credentials on a public sibling route of a Basic-protected host', async () => {
  const seen = await forwarded(authed('GET', basicAuthHeader), route([], true))
  expect(seen?.headers.get('Authorization')).toBeNull()
})

test('Keeps Basic credentials on a host without Basic auth', async () => {
  expect((await forwarded(authed('GET', basicAuthHeader), route()))?.headers.get('Authorization')).toBe(basicAuthHeader)
  expect((await forwarded(authed('GET', basicAuthHeader, '192.168.1.1'), route([ipAuthMethod])))?.headers.get('Authorization')).toBe(basicAuthHeader)
})

test('Keeps a Bearer token when the IP rule grants access on a Basic host', async () => {
  const seen = await forwarded(authed('GET', 'Bearer token123', '192.168.1.1'), route([basicAuthMethod, ipAuthMethod]))
  expect(seen?.headers.get('Authorization')).toBe('Bearer token123')
})

// --- IP rules ---

test('A missing CF-Connecting-IP header never satisfies an IP rule', async () => {
  expect((await authorize(request(), route([{ type: 'ip', allow: ['0.0.0.0/0'] }]), mockCallback)).status).toBe(403)
})

test('IPv6 client addresses compare in canonical form', async () => {
  const compiled = route([{ type: 'ip', allow: ['2001:db8::1'] }])
  expect((await authorize(authed('GET', undefined, '2001:DB8:0:0:0:0:0:1'), compiled, mockCallback)).status).toBe(200)
  expect((await authorize(authed('GET', undefined, '[2001:db8::1]'), compiled, mockCallback)).status).toBe(403)
  expect((await authorize(authed('GET', undefined, '2001:db8::2'), compiled, mockCallback)).status).toBe(403)
})

// --- Unicode credentials ---

test('A credential stored in NFD authenticates a client that sends NFC', async () => {
  const header = 'Basic ' + btoa(String.fromCharCode(...new TextEncoder().encode('u:\u00e9')))
  expect((await authorize(authed('GET', header), route([{ type: 'basic', username: 'u', password: 'e\u0301' }]), mockCallback)).status).toBe(200)
})
