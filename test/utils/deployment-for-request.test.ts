import { test, expect } from 'vitest'
import { Config, Deployment } from '../../src/config'
import { compileDeployments, deploymentForRequest } from '../../src/utils/deployment-for-request'

const MOCK_DEPLOYMENT_1: Deployment = {
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

test('it finds a deployment for matching request', () => {
  const request = new Request('https://app.example.com/explore')
  const compiled = compileDeployments([MOCK_DEPLOYMENT_1])

  const deployment = deploymentForRequest(request, compiled)
  expect(deployment).toEqual(MOCK_DEPLOYMENT_1)
})

test('it finds a deployment for matching subdomain', () => {
  const request = new Request('https://api.example.com/explore')
  const compiled = compileDeployments([MOCK_DEPLOYMENT_1])

  const deployment = deploymentForRequest(request, compiled)
  expect(deployment).toEqual(MOCK_DEPLOYMENT_1)
})

test('it returns undefined when there is no matching request', () => {
  const request = new Request('https://example.co.uk/explore')
  const compiled = compileDeployments([MOCK_DEPLOYMENT_1])

  const deployment = deploymentForRequest(request, compiled)
  expect(deployment).toEqual(undefined)
})

test('it matches exact hostname pattern', () => {
  const deployment: Deployment = {
    accountId: '1',
    zoneId: '1',
    routes: ['https://exact.example.com/*'],
  }
  const compiled = compileDeployments([deployment])

  expect(deploymentForRequest(new Request('https://exact.example.com/page'), compiled)).toEqual(deployment)
  expect(deploymentForRequest(new Request('https://other.example.com/page'), compiled)).toBeUndefined()
})

test('it selects the correct deployment from multiple deployments', () => {
  const deploymentA: Deployment = {
    accountId: '1',
    zoneId: '1',
    routes: ['https://*.alpha.com/*'],
  }
  const deploymentB: Deployment = {
    accountId: '2',
    zoneId: '2',
    routes: ['https://*.beta.com/*'],
  }
  const compiled = compileDeployments([deploymentA, deploymentB])

  expect(deploymentForRequest(new Request('https://app.alpha.com/dashboard'), compiled)).toEqual(deploymentA)
  expect(deploymentForRequest(new Request('https://app.beta.com/dashboard'), compiled)).toEqual(deploymentB)
  expect(deploymentForRequest(new Request('https://app.gamma.com/dashboard'), compiled)).toBeUndefined()
})
