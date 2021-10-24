import { withAuth } from '../../src/utils/with-auth'
import { Config } from '../../src/config'

test('it calls the callback when there is no auth required', () => {
  const callback = jest.fn()
  const event = {
    request: new Request('https://example.com/secrets')
  }
  const config: Config = {
    deployments: [],
    routes: {},
  }
  withAuth(event, config, callback)
  expect(callback).toHaveBeenCalled()
})

test('it does not call the callback when auth is required', () => {
  const callback = jest.fn()
  const event = {
    request: new Request('https://example.com/secrets')
  }
  const config: Config = {
    deployments: [
      {
        accountId: '12345',
        zoneId: '12345',
        paths: ['/secrets'],
        auth: [
          {
            type: 'basic',
            username: 'test',
            password: 'letmein',
          },
        ],
      },
    ],
    routes: {},
  }
  withAuth(event, config, callback)
  expect(callback).not.toHaveBeenCalled()
})
