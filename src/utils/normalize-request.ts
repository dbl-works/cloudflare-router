import { CompiledRoute, matchRoute } from './compile-routes'
import { resolveOrigin } from './resolve-origin'

const MEDIA_FILE_EXTENSIONS = [
  'css', 'csv', 'gif', 'ico', 'jpeg', 'jpg', 'js', 'json', 'map',
  'otf', 'pdf', 'png', 'svg', 'ttf', 'webp', 'woff', 'woff2',
  'webmanifest', 'xml',
]

/**
 * Reports whether a file name has a media file extension.
 * Only the last path segment is inspected, so a query string never changes the result.
 */
const isMediaFile = (fileName: string): boolean => {
  const dot = fileName.lastIndexOf('.')
  if (dot === -1) return false
  return MEDIA_FILE_EXTENSIONS.includes(fileName.slice(dot + 1).toLowerCase())
}

/**
 * Resolves a request against the compiled routes and returns the
 * origin-bound request together with the matched route. When no route
 * matches, the request is returned unchanged and the route is undefined.
 */
export default function normalizeRequest(request: Request, routes: CompiledRoute[]): { request: Request, route: CompiledRoute | undefined } {
  const url = new URL(request.url)
  const match = matchRoute(routes, url.hostname, url.pathname)
  if (!match) return { request, route: undefined }

  const { route, remainder, path } = match
  const base = resolveOrigin(route.origin, url)
  const fileName = path.decoded[path.decoded.length - 1] ?? ''

  // An SPA serves index.html for every navigation. Assets keep their path and query.
  const target = route.spa && !isMediaFile(fileName)
    ? `${base}/index.html`
    : `${base}${remainder}${url.search}`

  return { request: new Request(target, request), route }
}
