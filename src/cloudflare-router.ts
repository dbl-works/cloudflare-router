import { Config, DEFAULT_CONFIG } from './config'
import normalizeRequest from './utils/normalize-request'
import { withAuth } from './utils/with-auth'

export const startWorker = (config: Partial<Config>) => {
  addEventListener('fetch', (event: any) => {
    withAuth(event, config, () => {
      const request = normalizeRequest(event.request, config.routes)
      event.respondWith(fetch(request))
    })
  })
}
