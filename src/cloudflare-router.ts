import { Caches } from './binding'
import { Config } from './config'
import normalizeRequest from './utils/normalize-request'
import { withAuth } from './utils/with-auth'

declare let caches: Caches

export const startWorker = (config: Config) => {
  addEventListener('fetch', (event: any) => {
    withAuth(event, config, async () => {
      const request = normalizeRequest(event.request, config.routes)
      // The same cache shared with fetch requests.
      // Useful when needing to override content that is already cached, after receiving the response.
      const cache = (caches as Caches).default
      let response = await cache.match(request.url)


      if (!response) {
        response = await fetch(request)
        const headers = {
          ...response.headers,
          'request-url': request.url,
          'peep-body': JSON.stringify(response.body),
          'peep-status': response.status,
          'peep-headers': JSON.stringify(response.headers),
          'squake-router-version': '0.2.4',
          'squake-response': 'false',
          'cache-control': 'public, max-age=86400',
        }
        response = new Response(response.body, { ...response, headers })
        event.waitUntil(cache.put(request.url, response.clone()))
      } else {
        const headers = {
          ...response.headers,
          'request-url': request.url,
          'peep-body': JSON.stringify(response.body),
          'peep-status': response.status,
          'peep-headers': JSON.stringify(response.headers),
          'squake-router-version': '0.2.4',
          'squake-response': 'true',
        }
        response = new Response(response.body, { ...response, headers })
      }

      return response
    })
  })
}
