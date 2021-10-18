import CloudflareRouter from '../src/cloudflare-router'

test('assigns a default, empty, config', () => {
  const router = new CloudflareRouter({})
  expect(router.config).toEqual({
    deployments: [],
    routes: {},
  })
})

test('it can call .listen()', () => {
  const router = new CloudflareRouter({})
  expect(router.listen).toBeDefined()
})
