import { ExecutionContext } from '@cloudflare/workers-types'
import { Config } from './config'
import handleRequest from './utils/handle-request'
import normalizeRequest from './utils/normalize-request'
import { authorize } from './utils/authorize'

export const createRouter = (config: Config) => {
  if ('deployments' in config) {
    throw new Error('The "deployments" key is removed in v3. Use "auth" per route or at the top level instead.')
  }

  return {
    async fetch(request: Request, _env: Record<string, unknown>, _ctx: ExecutionContext): Promise<Response> {
      const { request: normalizedReq, route } = normalizeRequest(request, config.routes, config.isS3Site)
      return authorize(request, route, config.auth, async () => {
        const edgeCacheTtl = route?.edgeCacheTtl ?? config.edgeCacheTtl ?? 0
        return handleRequest(normalizedReq, edgeCacheTtl)
      })
    }
  }
}
