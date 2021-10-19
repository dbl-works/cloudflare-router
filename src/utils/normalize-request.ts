import { Config } from '../config'

const MEDIA_FILE_EXTENSIONS = 'js css jpg png gif woff'.split(' ')
const hasMediaFileExtension = (path: string): boolean => {
  const ext = path.split('.').pop().toLowerCase()
  return MEDIA_FILE_EXTENSIONS.includes(ext)
}

export default function normalizeRequest(request: Request, routes: Config['routes']): Request {
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

      const singlePageApp = newUrl.indexOf('s3://') === 0
      const isMediaFile = hasMediaFileExtension(originalUrl)
      if (singlePageApp) {
        newUrl = newUrl.replace(new RegExp('s3://([^.]+).([^/]+)(/?)(.*)'), 'https://s3.$1.amazonaws.com/$2$3$4')
      }

      const lastChar = newUrl[newUrl.length - 1]
      url = originalUrlWithoutScheme.replace(key, newUrl)
      // console.log(path, { singlePageApp, isMediaFile })
      if (singlePageApp && !isMediaFile) {
        url = newUrl + '/index.html'
      }
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
