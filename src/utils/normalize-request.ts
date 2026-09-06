import { Routes, Route } from '../config'
import { compileRoutes } from './compile-routes'
import { resolveOrigin } from './resolve-origin'
import { providerFor } from './providers'

const MEDIA_FILE_EXTENSIONS = [
  'css', 'csv', 'gif', 'ico', 'jpeg', 'jpg', 'js', 'json', 'map',
  'otf', 'pdf', 'png', 'svg', 'ttf', 'webp', 'woff', 'woff2',
  'webmanifest', 'xml',
]

/**
 * Reports whether the last path segment has a media file extension.
 * Only the pathname is inspected, so a query string never changes the result.
 */
const isMediaFile = (pathname: string): boolean => {
  const fileName = pathname.slice(pathname.lastIndexOf('/') + 1)
  const dot = fileName.lastIndexOf('.')
  if (dot === -1) return false
  return MEDIA_FILE_EXTENSIONS.includes(fileName.slice(dot + 1).toLowerCase())
}

/**
 * Returns the rest of `pathname` after `prefix`, or undefined when `prefix`
 * does not match on a segment boundary. '/admin' matches '/admin' and
 * '/admin/x', but not '/admin-panel'.
 */
function matchPath(pathname: string, prefix: string): string | undefined {
  if (prefix === '') return pathname
  if (pathname === prefix) return ''
  if (pathname.startsWith(prefix + '/')) return pathname.slice(prefix.length)
  return undefined
}

/**
 * Resolves a request against the routes and returns the origin-bound request
 * together with the matched route. The most specific key wins. When no key
 * matches, the request is returned unchanged and the route is undefined.
 *
 * `spa` is the config default. A route value wins over it. Without either,
 * a route is an SPA when its origin is a storage shorthand such as s3://.
 */
export default function normalizeRequest(request: Request, routes: Routes, spa?: boolean): { request: Request, route: Route | undefined } {
  const url = new URL(request.url)
  for (const { host, path, route } of compileRoutes(routes)) {
    if (host !== undefined && host !== url.hostname) continue

    const remainder = matchPath(url.pathname, path)
    if (remainder === undefined) continue

    const base = resolveOrigin(route.origin, url)
    const singlePageApp = route.spa ?? spa ?? providerFor(route.origin) !== undefined

    // An SPA serves index.html for every navigation. Assets keep their path and query.
    const target = singlePageApp && !isMediaFile(url.pathname)
      ? `${base}/index.html`
      : `${base}${remainder}${url.search}`

    return { request: new Request(target, request), route }
  }

  return { request, route: undefined }
}
