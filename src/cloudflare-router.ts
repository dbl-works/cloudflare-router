import { Caches } from './binding'
import { Config } from './config'
import normalizeRequest from './utils/normalize-request'
import { withAuth } from './utils/with-auth'

declare let caches: Caches

export const startWorker = (config: Config) => {
  addEventListener('fetch', (event: any) => {
    withAuth(event, config, async () => {
      const request = normalizeRequest(event.request, config.routes)
      const cache = caches.default
      let response = await cache.match(request.url)

      if (!response) {
        response = await fetch(request)
        const headers = { 'cache-control': 'public, max-age=14400' }
        response = new Response(response.body, { ...response, headers })
        event.waitUntil(cache.put(request.url, response.clone()))
      }
      return response
    })
  })
}
