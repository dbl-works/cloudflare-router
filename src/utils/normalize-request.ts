import { Config, Route } from '../config'

const MEDIA_FILE_EXTENSIONS = [
  'css', 'csv', 'gif', 'ico', 'jpeg', 'jpg', 'js', 'json', 'map',
  'otf', 'pdf', 'png', 'svg', 'ttf', 'webp', 'woff', 'woff2',
  'webmanifest', 'xml',
]
const hasMediaFileExtension = (path: string): boolean => {
  const ext = path.split('.').pop()?.toLowerCase()
  return ext ? MEDIA_FILE_EXTENSIONS.includes(ext) : false
}

/**
 * Resolves the AWS domain suffix based on the S3 region.
 * EU Sovereign Cloud regions (eusc-*) use amazonaws.eu.
 */
function resolveS3Domain(region: string): string {
  if (region.startsWith('eusc-')) {
    return 'amazonaws.eu'
  }
  return 'amazonaws.com'
}

/**
 * Converts an s3:// shorthand to an HTTPS URL.
 * Shorthand format: s3://REGION.BUCKET(/PREFIX)
 *
 * Uses virtual-hosted style for buckets without dots (recommended by AWS):
 *   s3://eu-central-1.dbl-works-assets/app → https://dbl-works-assets.s3.eu-central-1.amazonaws.com/app
 *
 * Falls back to path-style for buckets with dots (required for HTTPS wildcard cert compatibility):
 *   s3://eu-central-1.assets.dbl.works/app → https://s3.eu-central-1.amazonaws.com/assets.dbl.works/app
 */
function resolveS3Url(shorthand: string): string {
  const match = shorthand.match(/^s3:\/\/([^.]+)\.([^/]+)(\/?.*)$/)
  if (!match) return shorthand

  const [, region, bucket, pathSuffix] = match
  const domain = resolveS3Domain(region)

  if (bucket.includes('.')) {
    // Path-style: required when bucket name contains dots (HTTPS cert wildcard limitation)
    return `https://s3.${region}.${domain}/${bucket}${pathSuffix}`
  }

  // Virtual-hosted style: recommended by AWS for all new buckets
  return `https://${bucket}.s3.${region}.${domain}${pathSuffix}`
}

export default function normalizeRequest(request: Request, routes: Config['routes'], isS3Site: boolean = true): { request: Request, route: Route | undefined } {
  const originalUrl = request.url
  const originalUrlWithoutScheme = originalUrl.replace(/^https?:\/\//, '')
  const path = originalUrlWithoutScheme.replace(/^.*?\//gi, '')

  const sortedRoutes = Object.entries(routes).sort((a, b) => b[0].length - a[0].length)

  for (const [key, value] of sortedRoutes) {
    let url = originalUrl
    let newUrl = typeof value === 'string' ? value : value.origin
    const route = typeof value === 'string' ? { origin: value } : value
    const parsedUrl = new URL(originalUrl)
    
    if (url.includes(key)) {
      if (key.startsWith('/')) {
        if (!parsedUrl.pathname.startsWith(key)) {
          continue
        }
        const nextChar = parsedUrl.pathname[key.length]
        if (!key.endsWith('/') && nextChar !== undefined && nextChar !== '/') {
          continue
        }
      } else {
        if (!originalUrlWithoutScheme.startsWith(key)) {
          continue
        }
        const nextChar = originalUrlWithoutScheme[key.length]
        if (!key.endsWith('/') && nextChar !== undefined && nextChar !== '/' && nextChar !== ':' && nextChar !== '?' && nextChar !== '#') {
          continue
        }
      }

      const singlePageApp = isS3Site ? newUrl.startsWith('s3://') : true
      const isMediaFile = hasMediaFileExtension(originalUrl)
      if (singlePageApp && isS3Site) {
        newUrl = resolveS3Url(newUrl)
      }

      const lastChar = newUrl[newUrl.length - 1]
      url = originalUrlWithoutScheme.replace(key, newUrl)
      if (singlePageApp && !isMediaFile) {
        url = newUrl + '/index.html'
      }
      if (lastChar === '/') {
        url = url + path
      }
      if (!url.startsWith('https://')) {
        url = 'https://' + url
      }

      return { request: new Request(url, request), route }
    }
  }

  return { request, route: undefined }
}
