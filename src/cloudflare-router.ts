import { Caches } from './binding'
import { Config } from './config'
import normalizeRequest from './utils/normalize-request'
import { withAuth } from './utils/with-auth'

declare let caches: Caches

async function handleRequest(request: Request) {
  const url = new URL(request.url);

  // Only use the path for the cache key, removing query strings
  // and always store using HTTPS, for example, https://www.example.com/file-uri-here
  const cacheKey = `https://${url.hostname}${url.pathname}`;

  // cf typescript error: https://github.com/cloudflare/workers-types/issues/187
  let response = await fetch(request, {
    //@ts-ignore
    cf: {
      //Enterprise only feature, see Cache API for other plans
      cacheTtlByStatus: { '200-299': 86400, '404': 1, '500-599': 0 },
      cacheKey
    }
  });
  // Reconstruct the Response object to make its headers mutable.
  response = new Response(response.body, response);

  response.headers.set('Cache-Control', 'max-age=86400');
  return response;
}


export const startWorker = (config: Config) => {
  addEventListener('fetch', (event: any) => {
    withAuth(event, config, async () => {
      const request = normalizeRequest(event.request, config.routes)
      // The same cache shared with fetch requests.
      // Useful when needing to override content that is already cached, after receiving the response.
      // const cache = (caches as Caches).default
      // let response = await cache.match(request.url)

      // if (!response) {
      //   response = await fetch(request)
      //   // Reconstruct the Response object to make its headers mutable.

      //   const headers = {
      //     ...response.headers,
      //     'request-url': request.url,
      //     'peep-body': JSON.stringify(response.body),
      //     'peep-status': response.status,
      //     'peep-headers': JSON.stringify(response.headers),
      //     'squake-router-version': '0.2.7',
      //     'squake-response': 'false',
      //     'cache-control': 'public, max-age=86400',
      //   }
      //   response = new Response(response.body, { ...response, headers })
      //   event.waitUntil(cache.put(request.url, response.clone()))
      // } else {
      //   const headers = {
      //     ...response.headers,
      //     'request-url': request.url,
      //     'peep-body': JSON.stringify(response.body),
      //     'peep-status': response.status,
      //     'peep-headers': JSON.stringify(response.headers),
      //     'squake-router-version': '0.2.4',
      //     'squake-response': 'true',
      //   }
      //   response = new Response(response.body, { ...response, headers })
      // }

      // return response
      return handleRequest(request)
    })
  })
}
