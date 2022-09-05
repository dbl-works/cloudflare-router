import { Config } from './config'
import handleRequest from './utils/handle-request'
import normalizeRequest from './utils/normalize-request'
import { withAuth } from './utils/with-auth'

export const startWorker = (config: Config) => {
  addEventListener('fetch', (event: any) => {
    withAuth(event, config, async () => {
      const { request, cache }= normalizeRequest(event.request, config.routes)
      const edgeCacheTtl = cache ? config.edgeCacheTtl : 0
      return handleRequest(request, edgeCacheTtl)
    })
  })
}
