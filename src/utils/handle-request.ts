export default async function handleRequest(request: Request, edgeCacheTtl: number): Promise<Response> {
  // https://developers.cloudflare.com/workers/runtime-apis/request/#requestinitcfproperties
  const cfOptions = edgeCacheTtl > 0 ? {
    cf: {
      cacheTtlByStatus: { '200-299': edgeCacheTtl, '404': 1, '500-599': 0 },
      cacheEverything: true,
      cacheKey: request.url
    }
  } : {}

  //@ts-ignore
  let response = new Response(await fetch(request, cfOptions));

  if (edgeCacheTtl > 0) { // Only set the header if edgeCacheTtl is set
    response.headers.set('edge-cache-ttl', `${edgeCacheTtl}`);
  }
  
  return response;
}