import { Config, Deployment } from '../../src/config'
import { deploymentForRequest } from '../../src/utils/deployment-for-request'

const MOCK_DEPLOYMENT_1: Deployment = {
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

test('it finds a deployment for matching request', () => {
  const request = new Request('https://example.com/explore')
  const config: Config = {
    deployments: [
      MOCK_DEPLOYMENT_1,
    ],
    routes: {},
  }

  const deployment = deploymentForRequest(request, config)
  expect(deployment).toEqual(MOCK_DEPLOYMENT_1)
})

test('it returns undefined when there is no matching request', () => {
  const request = new Request('https://example.co.uk/explore')
  const config: Config = {
    deployments: [
      MOCK_DEPLOYMENT_1,
    ],
    routes: {},
  }

  const deployment = deploymentForRequest(request, config)
  expect(deployment).toEqual(undefined)
})
