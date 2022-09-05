import { Config } from './config'
import normalizeRequest from './utils/normalize-request'
import { withAuth } from './utils/with-auth'

async function handleRequest(request: Request, edgeCacheTtl: number) {
  const cfOptions = edgeCacheTtl > 0 ? {
    // Requests proxied through Cloudflare are cached even without Workers according to a zone’s default
    // or configured behavior. Setting Cloudflare cache rules to further customised the behavior
    cf: {
      // NOTE: cf is Enterprise only feature
      // This is equivalent to setting two Page Rules: Edge Cache TTL and Cache Level (to Cache Everything).
      // Edge Cache TTL (Time to Live) specifies how long to cache a resource in the Cloudflare edge network
      // The value must be zero or a positive number.
      // A value of 0 indicates that the cache asset expires immediately.
      // This option applies to GET and HEAD request methods only.
      cacheTtlByStatus: { '200-299': edgeCacheTtl, '404': 1, '500-599': 0 },
      // The Cloudflare CDN does not cache HTML by default without setting cacheEverything to true.
      // See here to understand the risk of setting cacheEverything to true
      cacheEverything: true,
      cacheKey: request.url
    }
  } : {}

  //@ts-ignore
  let response = await fetch(request, cfOptions);

  // Reconstruct the Response object to make its headers mutable.
  response = new Response(response.body, response);
  response.headers.set('squake-router-version', '0.2.19')
  return response;
}


export const startWorker = (config: Config) => {
  addEventListener('fetch', (event: any) => {
    withAuth(event, config, async () => {
      const { request, cache }= normalizeRequest(event.request, config.routes)
      const edgeCacheTtl = cache ? config.edgeCacheTtl : 0
      return handleRequest(request, edgeCacheTtl)
    })
  })
}
