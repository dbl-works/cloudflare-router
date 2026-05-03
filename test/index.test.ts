import { test, expect } from 'vitest'
import { createRouter } from '../src/cloudflare-router'
import { Config } from '../src/config'

const TEST_CONFIG: Config = {
  deployments: [],
  routes: {},
  edgeCacheTtl: 360
}

test('it works', () => {
  const router = createRouter(TEST_CONFIG)
  expect(router.fetch).toBeDefined()
})

test('it works without deployments key', () => {
  const router = createRouter({ routes: {}, edgeCacheTtl: 360 })
  expect(router.fetch).toBeDefined()
})
