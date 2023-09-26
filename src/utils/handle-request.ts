export default async function handleRequest(request: Request, edgeCacheTtl: number): Promise<Response> {
  // https://developers.cloudflare.com/workers/runtime-apis/request/#requestinitcfproperties
  const cfOptions = edgeCacheTtl > 0 ? {
    cf: {
      cacheTtlByStatus: { '200-299': edgeCacheTtl, '404': 1, '500-599': 0 },
      cacheEverything: true,
      cacheKey: request.url
    }
  } : {}

  const fetchResponse = await fetch(request, cfOptions);
  const responseBodyBlob = await fetchResponse.blob();

  const response = new Response(responseBodyBlob, {
    status: fetchResponse.status,
    statusText: fetchResponse.statusText,
    headers: fetchResponse.headers,
  });

  if (edgeCacheTtl > 0) { // Only set the header if edgeCacheTtl is set
    response.headers.set('edge-cache-ttl', `${edgeCacheTtl}`);
  }
  
  return response;
}