import { Config } from './config'
import normalizeRequest from './utils/normalize-request'
import { withAuth } from './utils/with-auth'

async function handleRequest(request: Request) {
  let response = await fetch(request, {
    // Requests proxied through Cloudflare are cached even without Workers according to a zone’s default
    // or configured behavior. Setting Cloudflare cache rules to further customised the behavior
    //@ts-ignore
    cf: {
      // NOTE: cf is Enterprise only feature
      // This is equivalent to setting two Page Rules: Edge Cache TTL and Cache Level (to Cache Everything).
      // The value must be zero or a positive number.
      // A value of 0 indicates that the cache asset expires immediately.
      // This option applies to GET and HEAD request methods only.
      cacheTtlByStatus: { '200-299': 86400, '404': 1, '500-599': 0 },
      // The Cloudflare CDN does not cache HTML by default.
      // WARNING: This is dangerous and might leak unwanted information to unauthorised user
      // Just for the testing purpose on staging
      cacheEverything: true,
      cacheKey: request.url
    }
  });

  // Reconstruct the Response object to make its headers mutable.
  response = new Response(response.body, response);
  response.headers.set('Cache-Control', 'public, max-age=86400')
  response.headers.set('squake-router-version', '0.2.17')
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
