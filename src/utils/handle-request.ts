export default async function handleRequest(request: Request, edgeCacheTtl: number): Promise<Response> {
  const cfOptions = edgeCacheTtl > 0 ? {
    cf: {
      // Edge Cache TTL specifies how long to cache a resource in the Cloudflare edge network.
      // A value of 0 indicates the cache asset expires immediately.
      // Applies to GET and HEAD request methods only.
      cacheTtlByStatus: { '200-299': edgeCacheTtl, '404': 1, '500-599': 0 },
      cacheEverything: true,
      cacheKey: request.url,
    },
  } : {}

  // @ts-expect-error — `cf` is a Cloudflare-specific RequestInit extension not present in standard lib types
  let response = await fetch(request, cfOptions)

  // Reconstruct the Response object to make its headers mutable.
  response = new Response(response.body, response)
  response.headers.set('edge-cache-ttl', `${edgeCacheTtl}`)
  return response
}
