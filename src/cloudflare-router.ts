import { ExecutionContext } from '@cloudflare/workers-types'
import { Config } from './config'
import handleRequest from './utils/handle-request'
import normalizeRequest from './utils/normalize-request'
import { compileRoutes } from './utils/compile-routes'
import { authorize } from './utils/authorize'

export const createRouter = (config: Config) => {
  // Validate every value, resolve every default, and fail at startup instead of on the first request.
  const routes = compileRoutes(config)

  return {
    async fetch(request: Request, _env: Record<string, unknown>, _ctx: ExecutionContext): Promise<Response> {
      const { request: normalizedReq, route } = normalizeRequest(request, routes)
      return authorize(normalizedReq, route, (authReq) => handleRequest(authReq, route?.edgeCacheTtl ?? 0))
    }
  }
}
