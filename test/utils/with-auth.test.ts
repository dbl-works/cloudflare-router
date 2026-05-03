import { test, expect, vi } from 'vitest'
import { withAuth } from '../../src/utils/with-auth'
import { Config, Deployment } from '../../src/config'
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

  const config: Config = {
    deployments: [],
    routes: {},
    edgeCacheTtl: 360
  }
  await withAuth(request, config, compileDeployments([]), callback)
  expect(callback).toHaveBeenCalled()
})

test('it calls the callback when request method is options', async () => {
  const callback = vi.fn().mockReturnValue(new Response('ok'))
  const request = new Request('https://app.example.com/secrets', {
    method: 'OPTIONS',
  })
  const config: Config = {
    deployments: [
      MOCK_DEPLOYMENT_WITH_AUTH,
    ],
    routes: {},
    edgeCacheTtl: 360
  }
  await withAuth(request, config, compileDeployments([MOCK_DEPLOYMENT_WITH_AUTH]), callback)
  expect(callback).toHaveBeenCalled()
})

test('it calls the callback when a deployment is matched without auth', async () => {
  const callback = vi.fn().mockReturnValue(new Response('ok'))
  const request = new Request('https://app.example.com/secrets')
  const config: Config = {
    deployments: [
      MOCK_DEPLOYMENT_WITHOUT_AUTH,
    ],
    routes: {},
    edgeCacheTtl: 360
  }
  await withAuth(request, config, compileDeployments([MOCK_DEPLOYMENT_WITHOUT_AUTH]), callback)
  expect(callback).toHaveBeenCalled()
})

test('it does not call callback when there is no matching deployment', async () => {
  const callback = vi.fn().mockReturnValue(new Response('ok'))
  const request = new Request('https://app.example.co.uk/secrets')
  const config: Config = {
    deployments: [
      MOCK_DEPLOYMENT_WITH_AUTH,
    ],
    routes: {},
    edgeCacheTtl: 360
  }
  const response = await withAuth(request, config, compileDeployments([MOCK_DEPLOYMENT_WITH_AUTH]), callback)
  expect(response.status).toBe(404)
  expect(callback).not.toHaveBeenCalled()
})

test('it does not call the callback when auth is required but missing', async () => {
  const callback = vi.fn().mockReturnValue(new Response('ok'))
  const request = new Request('https://app.example.com/secrets')
  const config: Config = {
    deployments: [
      MOCK_DEPLOYMENT_WITH_AUTH,
    ],
    routes: {},
    edgeCacheTtl: 360
  }
  const response = await withAuth(request, config, compileDeployments([MOCK_DEPLOYMENT_WITH_AUTH]), callback)
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
  const config: Config = {
    deployments: [
      MOCK_DEPLOYMENT_WITH_AUTH,
    ],
    routes: {},
    edgeCacheTtl: 360
  }
  const response = await withAuth(request, config, compileDeployments([MOCK_DEPLOYMENT_WITH_AUTH]), callback)
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
  const config: Config = {
    deployments: [
      MOCK_DEPLOYMENT_WITH_AUTH,
    ],
    routes: {},
    edgeCacheTtl: 360
  }
  const response = await withAuth(request, config, compileDeployments([MOCK_DEPLOYMENT_WITH_AUTH]), callback)
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
  const config: Config = {
    deployments: [
      MOCK_DEPLOYMENT_WITH_AUTH,
    ],
    routes: {},
    edgeCacheTtl: 360
  }
  await withAuth(request, config, compileDeployments([MOCK_DEPLOYMENT_WITH_AUTH]), callback)
  expect(callback).toHaveBeenCalled()
})
