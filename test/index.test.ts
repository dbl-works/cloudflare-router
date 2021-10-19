import { startWorker } from '../src/cloudflare-router'
import { Config } from '../src/config'

const TEST_CONFIG: Config = {
  deployments: [],
  routes: {},
}

// Figure out how to mock the request
test('it works', () => {
  const response = startWorker(TEST_CONFIG)
  expect(response).not.toBeNull()
})
