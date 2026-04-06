import { ExecutionContext } from '@cloudflare/workers-types'
import { Config } from './config'
import handleRequest from './utils/handle-request'
import normalizeRequest from './utils/normalize-request'
import { withAuth } from './utils/with-auth'

export const createRouter = (config: Config) => {
  return {
    async fetch(request: Request, env: Record<string, unknown>, ctx: ExecutionContext): Promise<Response> {
      return withAuth(request, config, async () => {
        const { request: normalizedReq, cache } = normalizeRequest(request, config.routes, config.isS3Site)
        const edgeCacheTtl = cache && config.edgeCacheTtl ? config.edgeCacheTtl : 0
        return handleRequest(normalizedReq, edgeCacheTtl)
      })
    }
  }
}
