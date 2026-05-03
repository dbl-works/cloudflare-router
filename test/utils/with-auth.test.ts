import { test, expect, vi } from 'vitest'
import { withAuth } from '../../src/utils/with-auth'
import { Deployment } from '../../src/config'
import { compileDeployments } from '../../src/utils/deployment-for-request'

const MOCK_DEPLOYMENT_WITH_AUTH: Deployment = {
  accountId: '12345',
  zoneId: '12345',
  routes: [
    'https://*.example.com/*',
  ],
  auth: [
    {
      type: 'basic',
      username: 'test',
      password: 'letmein',
    },
  ],
}
const MOCK_DEPLOYMENT_WITHOUT_AUTH: Deployment = {
  accountId: '12345',
  zoneId: '12345',
  routes: [
    'https://*.example.com/*',
  ],
}

test('it calls the callback when no deployments are defined', async () => {
  const callback = vi.fn().mockReturnValue(new Response('ok'))
  const request = new Request('https://app.example.com/secrets')

  await withAuth(request, compileDeployments([]), callback)
  expect(callback).toHaveBeenCalled()
})

test('it calls the callback when request method is options', async () => {
  const callback = vi.fn().mockReturnValue(new Response('ok'))
  const request = new Request('https://app.example.com/secrets', {
    method: 'OPTIONS',
  })
  await withAuth(request, compileDeployments([MOCK_DEPLOYMENT_WITH_AUTH]), callback)
  expect(callback).toHaveBeenCalled()
})

test('it calls the callback when a deployment is matched without auth', async () => {
  const callback = vi.fn().mockReturnValue(new Response('ok'))
  const request = new Request('https://app.example.com/secrets')
  await withAuth(request, compileDeployments([MOCK_DEPLOYMENT_WITHOUT_AUTH]), callback)
  expect(callback).toHaveBeenCalled()
})

test('it does not call callback when there is no matching deployment', async () => {
  const callback = vi.fn().mockReturnValue(new Response('ok'))
  const request = new Request('https://app.example.co.uk/secrets')
  const response = await withAuth(request, compileDeployments([MOCK_DEPLOYMENT_WITH_AUTH]), callback)
  expect(response.status).toBe(404)
  expect(callback).not.toHaveBeenCalled()
})

test('it does not call the callback when auth is required but missing', async () => {
  const callback = vi.fn().mockReturnValue(new Response('ok'))
  const request = new Request('https://app.example.com/secrets')
  const response = await withAuth(request, compileDeployments([MOCK_DEPLOYMENT_WITH_AUTH]), callback)
  expect(response.status).toBe(401)
  expect(response.headers.get('WWW-Authenticate')).toBe('Basic realm="Cloudflare Router", charset="UTF-8"')
  expect(callback).not.toHaveBeenCalled()
})

test('it does not call the callback when auth is required but username is incorrect', async () => {
  const callback = vi.fn().mockReturnValue(new Response('ok'))
  const request = new Request('https://app.example.com/secrets', {
    headers: {
      'Authorization': 'Basic dGVzdGVyOmxldG1laW4=', // tester:letmein
    }
  })
  const response = await withAuth(request, compileDeployments([MOCK_DEPLOYMENT_WITH_AUTH]), callback)
  expect(response.status).toBe(401)
  expect(response.headers.get('WWW-Authenticate')).toBe('Basic realm="Cloudflare Router", charset="UTF-8"')
  expect(callback).not.toHaveBeenCalled()
})

test('it does not call the callback when auth is required but password is incorrect', async () => {
  const callback = vi.fn().mockReturnValue(new Response('ok'))
  const request = new Request('https://app.example.com/secrets', {
    headers: {
      'Authorization': 'Basic dGVzdDpsZXRtZW91dA==', // test:letmeout
    }
  })
  const response = await withAuth(request, compileDeployments([MOCK_DEPLOYMENT_WITH_AUTH]), callback)
  expect(response.status).toBe(401)
  expect(response.headers.get('WWW-Authenticate')).toBe('Basic realm="Cloudflare Router", charset="UTF-8"')
  expect(callback).not.toHaveBeenCalled()
})

test('it calls callback when auth is required and valid', async () => {
  const callback = vi.fn().mockReturnValue(new Response('ok'))
  const request = new Request('https://app.example.com/secrets', {
    headers: {
      'Authorization': 'Basic dGVzdDpsZXRtZWlu', // test:letmein
    }
  })
  await withAuth(request, compileDeployments([MOCK_DEPLOYMENT_WITH_AUTH]), callback)
  expect(callback).toHaveBeenCalled()
})

// --- Password with colons (RFC 7617 allows colons in passwords) ---

test('it authenticates when password contains colons', async () => {
  const deployment = {
    ...MOCK_DEPLOYMENT_WITH_AUTH,
    auth: [{ type: 'basic' as const, username: 'test', password: 'pass:word' }],
  }
  const callback = vi.fn().mockReturnValue(new Response('ok'))
  const request = new Request('https://app.example.com/secrets', {
    headers: {
      'Authorization': 'Basic dGVzdDpwYXNzOndvcmQ=', // test:pass:word
    }
  })
  await withAuth(request, compileDeployments([deployment]), callback)
  expect(callback).toHaveBeenCalled()
})

test('it rejects when password with colons does not match', async () => {
  const deployment = {
    ...MOCK_DEPLOYMENT_WITH_AUTH,
    auth: [{ type: 'basic' as const, username: 'test', password: 'pass:word' }],
  }
  const callback = vi.fn().mockReturnValue(new Response('ok'))
  const request = new Request('https://app.example.com/secrets', {
    headers: {
      'Authorization': 'Basic dGVzdDpsZXRtZWlu', // test:letmein (wrong password)
    }
  })
  const response = await withAuth(request, compileDeployments([deployment]), callback)
  expect(response.status).toBe(401)
  expect(callback).not.toHaveBeenCalled()
})

// --- IP-based authentication ---

const MOCK_DEPLOYMENT_WITH_IP_AUTH: Deployment = {
  accountId: '12345',
  zoneId: '12345',
  routes: [
    'https://*.example.com/*',
  ],
  auth: [
    {
      type: 'ip',
      allow: ['192.168.1.1', '10.0.0.1'],
    },
  ],
}

test('it calls callback when IP matches allow list', async () => {
  const callback = vi.fn().mockReturnValue(new Response('ok'))
  const request = new Request('https://app.example.com/secrets', {
    headers: { 'CF-Connecting-IP': '192.168.1.1' },
  })
  await withAuth(request, compileDeployments([MOCK_DEPLOYMENT_WITH_IP_AUTH]), callback)
  expect(callback).toHaveBeenCalled()
})

test('it rejects when IP does not match allow list', async () => {
  const callback = vi.fn().mockReturnValue(new Response('ok'))
  const request = new Request('https://app.example.com/secrets', {
    headers: { 'CF-Connecting-IP': '172.16.0.1' },
  })
  const response = await withAuth(request, compileDeployments([MOCK_DEPLOYMENT_WITH_IP_AUTH]), callback)
  expect(response.status).toBe(401)
  expect(callback).not.toHaveBeenCalled()
})

test('it rejects when CF-Connecting-IP header is missing', async () => {
  const callback = vi.fn().mockReturnValue(new Response('ok'))
  const request = new Request('https://app.example.com/secrets')
  const response = await withAuth(request, compileDeployments([MOCK_DEPLOYMENT_WITH_IP_AUTH]), callback)
  expect(response.status).toBe(401)
  expect(callback).not.toHaveBeenCalled()
})

// --- Mixed auth (IP + Basic) ---

const MOCK_DEPLOYMENT_WITH_MIXED_AUTH: Deployment = {
  accountId: '12345',
  zoneId: '12345',
  routes: ['https://*.example.com/*'],
  auth: [
    { type: 'ip', allow: ['192.168.1.1'] },
    { type: 'basic', username: 'test', password: 'letmein' },
  ],
}

test('it authorizes via IP when mixed auth config and IP matches', async () => {
  const callback = vi.fn().mockReturnValue(new Response('ok'))
  const request = new Request('https://app.example.com/secrets', {
    headers: { 'CF-Connecting-IP': '192.168.1.1' },
  })
  await withAuth(request, compileDeployments([MOCK_DEPLOYMENT_WITH_MIXED_AUTH]), callback)
  expect(callback).toHaveBeenCalled()
})

test('it authorizes via basic auth when mixed auth config and IP does not match', async () => {
  const callback = vi.fn().mockReturnValue(new Response('ok'))
  const request = new Request('https://app.example.com/secrets', {
    headers: {
      'CF-Connecting-IP': '172.16.0.1',
      'Authorization': 'Basic dGVzdDpsZXRtZWlu', // test:letmein
    },
  })
  await withAuth(request, compileDeployments([MOCK_DEPLOYMENT_WITH_MIXED_AUTH]), callback)
  expect(callback).toHaveBeenCalled()
})
