import { Config, DEFAULT_CONFIG } from './config'
import normalizeRequest from './utils/normalize-request'

export const startWorker = (config: Partial<Config>) => {
  addEventListener('fetch', (event: any) => {
    const request = normalizeRequest(event.request, config.routes)
    event.respondWith(fetch(request))
  })
}
