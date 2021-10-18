import { Config } from "../config"

export default function normalizeRequest(request: Request, routes: Config['routes']): Request {
  const originalUrl = request.url
  const originalUrlWithoutScheme = originalUrl.replace(/^https?:\/\//, '')
  const path = originalUrlWithoutScheme.replace(/^.*?\//gi, '')

  for (const [key, value] of Object.entries(routes)) {
    const lastChar = value[value.length - 1]
    let url = originalUrl
    if (url.indexOf(key) !== -1) {
      url = originalUrlWithoutScheme.replace(key, value)
      if (lastChar === '/') {
        url = url + path
      }
      if (url.indexOf('https://') !== 0) {
        url = 'https://' + url
      }
      return new Request(url)
    }
  }

  return request
}
