import { ExecutionContext } from '@cloudflare/workers-types'
import { Config } from './config'
import handleRequest from './utils/handle-request'
import normalizeRequest from './utils/normalize-request'
import { compileRoutes } from './utils/compile-routes'
import { authorize } from './utils/authorize'

export const createRouter = (config: Config) => {
  if ('deployments' in config) {
    throw new Error('The "deployments" key is removed in v3. Use "auth" per route or at the top level instead.')
  }

  if ('isS3Site' in config) {
    throw new Error('The "isS3Site" key is removed in v3. Use "spa" per route or at the top level instead.')
  }

  // Fail at startup, not on the first request, when a route is malformed.
  const routes = compileRoutes(config.routes)

  return {
    async fetch(request: Request, _env: Record<string, unknown>, _ctx: ExecutionContext): Promise<Response> {
      const { request: normalizedReq, route } = normalizeRequest(request, routes, config.spa)
      return authorize(normalizedReq, route, config.auth, async (authReq) => {
        // No cache unless the config asks for one. A route value wins over the config value.
        const edgeCacheTtl = route?.edgeCacheTtl ?? config.edgeCacheTtl ?? 0
        return handleRequest(authReq, edgeCacheTtl)
      })
    }
  }
}
