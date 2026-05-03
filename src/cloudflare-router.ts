import { ExecutionContext } from '@cloudflare/workers-types'
import { Config } from './config'
import handleRequest from './utils/handle-request'
import normalizeRequest from './utils/normalize-request'
import { withAuth } from './utils/with-auth'
import { compileDeployments } from './utils/deployment-for-request'

export const createRouter = (config: Config) => {
  // Pre-compile URLPattern instances once at creation time
  const compiledDeployments = compileDeployments(config.deployments ?? [])

  return {
    async fetch(request: Request, _env: Record<string, unknown>, _ctx: ExecutionContext): Promise<Response> {
      return withAuth(request, config, compiledDeployments, async () => {
        const { request: normalizedReq, cache } = normalizeRequest(request, config.routes, config.isS3Site)
        const edgeCacheTtl = cache && config.edgeCacheTtl ? config.edgeCacheTtl : 0
        return handleRequest(normalizedReq, edgeCacheTtl)
      })
    }
  }
}
