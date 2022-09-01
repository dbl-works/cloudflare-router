import { Caches } from './binding'
import { Config } from './config'
import normalizeRequest from './utils/normalize-request'
import { withAuth } from './utils/with-auth'

declare let caches: Caches

async function handleRequest(request: Request) {
  const url = new URL(request.url);
  // Only use the path for the cache key, removing query strings
  // and always store using HTTPS, for example, https://www.example.com/file-uri-here
  const cacheKey = `https://${url.hostname}${url.pathname}`

  let response = await fetch(request, {
    // Requests proxied through Cloudflare are cached even without Workers according to a zone’s default
    // or configured behavior. Setting Cloudflare cache rules to further customised the behavior
    //@ts-ignore
    cf: {
      // cf is Enterprise only feature
      cacheTtlByStatus: { '200-299': 86400, '404': 1, '500-599': 0 },
      cacheKey
    }
  });
  // Reconstruct the Response object to make its headers mutable.
  response = new Response(response.body, response);

  response.headers.set('Cache-Control', 'public, max-age=86400');
  response.headers.set('squake-router-version', '0.2.14');
  return response;
}


export const startWorker = (config: Config) => {
  addEventListener('fetch', (event: any) => {
    withAuth(event, config, async () => {
      const request = normalizeRequest(event.request, config.routes)
      return handleRequest(request)
    })
  })
}
