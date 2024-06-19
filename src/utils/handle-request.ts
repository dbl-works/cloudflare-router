import { Headers } from './../types'

export default async function handleRequest(request: Request, edgeCacheTtl: number, headers: Headers) {
  const cf = edgeCacheTtl && edgeCacheTtl > 0 ? {
    // Requests proxied through Cloudflare are cached even without Workers according to a zone’s default
    // or configured behavior. Setting Cloudflare cache rules to further customised the behavior
    // NOTE: cf is Enterprise only feature
    // This is equivalent to setting two Page Rules:
    // - Edge Cache TTL and
    // - Cache Level (to Cache Everything).
    // Edge Cache TTL (Time to Live) specifies how long to cache a resource in the Cloudflare edge network
    // The value must be zero or a positive number.
    // A value of 0 indicates that the cache asset expires immediately.
    // This option applies to GET and HEAD request methods only.
    cacheTtlByStatus: { '200-299': edgeCacheTtl, '404': 1, '500-599': 0 },
    // The Cloudflare CDN does not cache HTML by default without setting cacheEverything to true.
    cacheEverything: true,
    cacheKey: request.url
  } : {}

  //@ts-ignore
  const originalResponse = await fetch(request, { cf, headers });

  // Reconstruct the Response object to make its headers mutable.
  const response = new Response(originalResponse.body, originalResponse);
  response.headers.set('edge-cache-ttl', `${edgeCacheTtl}`)

  return response;
}

