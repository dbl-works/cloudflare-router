import { Config } from '../config'

const MEDIA_FILE_EXTENSIONS = 'css gif ico jpg js otf jpeg png svg ttf webp woff woff2 csv json'.split(' ')
const hasMediaFileExtension = (path: string): boolean => {
  const ext = path.split('.').pop()?.toLowerCase()
  return ext ? MEDIA_FILE_EXTENSIONS.includes(ext) : false
}

export default function normalizeRequest(request: Request, routes: Config['routes'], isS3Site: boolean = true): { request: Request, cache: boolean } {
  const originalUrl = request.url
  const originalUrlWithoutScheme = originalUrl.replace(/^https?:\/\//, '')
  const path = originalUrlWithoutScheme.replace(/^.*?\//gi, '')

  for (const [key, value] of Object.entries(routes)) {
    let url = originalUrl
    let newUrl = value
    if (url.indexOf(key) !== -1) {

      if (originalUrlWithoutScheme.startsWith(key) === false && key.startsWith('/') === false) {
        break
      }

      const singlePageApp = isS3Site ? newUrl.indexOf('s3://') === 0 : true
      console.log('singlePageApp', singlePageApp)
      const isMediaFile = hasMediaFileExtension(originalUrl)
      if (singlePageApp && isS3Site) {
        newUrl = newUrl.replace(new RegExp('s3://([^.]+).([^/]+)(/?)(.*)'), 'https://s3.$1.amazonaws.com/$2$3$4')
      }

      const lastChar = newUrl[newUrl.length - 1]
      url = originalUrlWithoutScheme.replace(key, newUrl)
      if (singlePageApp && !isMediaFile) {
        url = newUrl + '/index.html'
      }
      if (lastChar === '/') {
        url = url + path
      }
      if (url.indexOf('https://') !== 0) {
        url = 'https://' + url
      }

      console.log('URL', url)
      // Make sure we only cache requests from the stated routes
      return { request: new Request(url), cache: true }
    }
  }

  return { request, cache: false }
}
