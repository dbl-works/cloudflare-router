import { Config, DEFAULT_CONFIG } from './config'

export default class CloudflareRouter {
  config: Config

  constructor(config: Partial<Config>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    }
  }

  listen() {
    addEventListener('fetch', (event) => {
      event.respondWith(this.handleRequest(event.request))
    })
  }

  private handleRequest(request: Request) {
    return fetch(request)
  }
}
