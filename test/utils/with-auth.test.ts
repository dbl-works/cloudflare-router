import { withAuth } from '../../src/utils/with-auth'
import { Config, Deployment } from '../../src/config'

const MOCK_DEPLOYMENT_WITH_AUTH: Deployment = {
  accountId: '12345',
  zoneId: '12345',
  routes: [
    '*example.com/*',
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
    '*example.com/*',
  ],
}

test('it calls the callback when no deployments are defined', () => {
  const callback = jest.fn()
  const event = new FetchEvent('fetch', {
    request: new Request('https://example.com/secrets')
  })
  const config: Config = {
    deployments: [],
    routes: {},
  }
  withAuth(event, config, callback)
  expect(callback).toHaveBeenCalled()
})

test('it calls the callback when request method is options', () => {
  const callback = jest.fn()
  const event = new FetchEvent('fetch', {
    request: new Request('https://example.com/secrets', {
      method: 'OPTIONS',
    })
  })
  const config: Config = {
    deployments: [
      MOCK_DEPLOYMENT_WITH_AUTH,
    ],
    routes: {},
  }
  withAuth(event, config, callback)
  expect(callback).toHaveBeenCalled()
})

test('it calls the callback when a deployment is matched without auth', () => {
  const callback = jest.fn()
  const event = new FetchEvent('fetch', {
    request: new Request('https://example.com/secrets')
  })
  const config: Config = {
    deployments: [
      MOCK_DEPLOYMENT_WITHOUT_AUTH,
    ],
    routes: {},
  }
  withAuth(event, config, callback)
  expect(callback).toHaveBeenCalled()
})

test('it does not call callback when there is no matching deployment', async () => {
  const callback = jest.fn()
  const event = new FetchEvent('fetch', {
    request: new Request('https://example.com/secrets')
  })
  const config: Config = {
    deployments: [
      MOCK_DEPLOYMENT_WITH_AUTH,
    ],
    routes: {},
  }
  const { response } = await withAuth(event, config, callback)
  expect(response.status).toBe(401)
  expect(response.headers.get('WWW-Authenticate')).toBe('Basic realm="Reveneo Platform", charset="UTF-8"')
  expect(callback).not.toHaveBeenCalled()
})

test('it does not call the callback when auth is required but missing', async () => {
  const callback = jest.fn()
  const event = new FetchEvent('fetch', {
    request: new Request('https://example.com/secrets')
  })
  const config: Config = {
    deployments: [
      MOCK_DEPLOYMENT_WITH_AUTH,
    ],
    routes: {},
  }
  const { response } = await withAuth(event, config, callback)
  expect(response.status).toBe(401)
  expect(response.headers.get('WWW-Authenticate')).toBe('Basic realm="Reveneo Platform", charset="UTF-8"')
  expect(callback).not.toHaveBeenCalled()
})

test('it does not call the callback when auth is required but username is incorrect', async () => {
  const callback = jest.fn()
  const event = new FetchEvent('fetch', {
    request: new Request('https://example.com/secrets', {
      headers: {
        'Authorization': 'Basic dGVzdGVyOmxldG1laW4=', // tester:letmein
      }
    })
  })
  const config: Config = {
    deployments: [
      MOCK_DEPLOYMENT_WITH_AUTH,
    ],
    routes: {},
  }
  const { response } = await withAuth(event, config, callback)
  expect(response.status).toBe(401)
  expect(response.headers.get('WWW-Authenticate')).toBe('Basic realm="Reveneo Platform", charset="UTF-8"')
  expect(callback).not.toHaveBeenCalled()
})

test('it does not call the callback when auth is required but password is incorrect', async () => {
  const callback = jest.fn()
  const event = new FetchEvent('fetch', {
    request: new Request('https://example.com/secrets', {
      headers: {
        'Authorization': 'Basic dGVzdDpsZXRtZW91dA==', // test:letmeout
      }
    })
  })
  const config: Config = {
    deployments: [
      MOCK_DEPLOYMENT_WITH_AUTH,
    ],
    routes: {},
  }
  const { response } = await withAuth(event, config, callback)
  expect(response.status).toBe(401)
  expect(response.headers.get('WWW-Authenticate')).toBe('Basic realm="Reveneo Platform", charset="UTF-8"')
  expect(callback).not.toHaveBeenCalled()
})

test('it calls callback when auth is required and valid', () => {
  const callback = jest.fn()
  const event = new FetchEvent('fetch', {
    request: new Request('https://example.com/secrets', {
      headers: {
        'Authorization': 'Basic dGVzdDpsZXRtZWlu', // test:letmein
      }
    })
  })
  const config: Config = {
    deployments: [
      MOCK_DEPLOYMENT_WITH_AUTH,
    ],
    routes: {},
  }
  withAuth(event, config, callback)
  expect(callback).toHaveBeenCalled()
})
