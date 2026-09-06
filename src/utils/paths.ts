/**
 * One place decides what a path is. Request paths and configured paths both
 * pass through here, so no other module needs its own idea of a separator, a
 * dot segment or an encoding.
 */

/** The request path, split for matching and for forwarding. */
export interface CanonicalPath {
  /** Percent-decoded segments, for matching. */
  decoded: string[]
  /** Segments as the client sent them, for forwarding. */
  raw: string[]
  trailingSlash: boolean
}

// A decoded segment must not smuggle a path separator, a dot segment or a control character.
const UNSAFE_SEGMENT = /[/\\\p{Cc}]/u

/**
 * Splits a request pathname into decoded segments for matching and raw
 * segments for forwarding. Repeated slashes collapse. Returns undefined when
 * the path contains a backslash, or when a segment cannot be decoded, decodes
 * to a separator or a dot segment, or contains a control character. Such a
 * request matches no route.
 */
export function canonicalPath(pathname: string): CanonicalPath | undefined {
  if (pathname.includes('\\')) return undefined
  const raw = pathname.split('/').filter((segment) => segment !== '')
  const decoded: string[] = []
  for (const segment of raw) {
    let plain: string
    try {
      plain = decodeURIComponent(segment)
    } catch {
      return undefined
    }
    if (UNSAFE_SEGMENT.test(plain) || plain === '.' || plain === '..') return undefined
    decoded.push(plain)
  }
  return { decoded, raw, trailingSlash: pathname.endsWith('/') }
}

// RFC 3986 pchar without percent-encoding. The URL parser leaves these characters as they are.
const PLAIN_SEGMENT = /^[A-Za-z0-9\-._~!$&'()*+,;=:@]+$/

/**
 * Validates a configured path: a route key path, a path origin, an origin
 * path or a storage prefix. A configured path is plain. It has no
 * percent-encoding, no backslash, no empty or dot segment, and only
 * characters that the URL parser never rewrites. The invariant: parsing a
 * plain path as a URL path returns it unchanged, so no later normalization
 * can move it. A trailing slash has no meaning.
 */
export function plainPath(path: string): { segments: string[] } | { error: string } {
  if (path.includes('\\')) return { error: 'contains a backslash' }
  if (path.includes('%')) return { error: 'is percent-encoded' }
  const trimmed = path.replace(/\/+$/, '')
  if (trimmed === '') return { segments: [] }
  if (!trimmed.startsWith('/')) return { error: 'does not start with "/"' }
  const segments = trimmed.slice(1).split('/')
  for (const segment of segments) {
    if (segment === '') return { error: 'contains an empty segment' }
    if (segment === '.' || segment === '..') return { error: 'contains a "." or ".." segment' }
    if (!PLAIN_SEGMENT.test(segment)) return { error: 'contains a character that is not allowed in a URL path' }
  }
  return { segments }
}

/** Joins plain segments back into a path. The inverse of `plainPath`. */
export const joinPath = (segments: string[]): string => `/${segments.join('/')}`

/** True when `prefix` is a leading run of `path`. */
export const isPrefix = (prefix: string[], path: string[]): boolean =>
  prefix.length <= path.length && prefix.every((segment, i) => segment === path[i])

/**
 * Canonicalizes a hostname the way a browser does: lowercase and punycode.
 * Returns undefined for anything that is not exactly one hostname: a port,
 * credentials, a path, a wildcard, whitespace or an empty string.
 */
export function parseHostname(host: string): string | undefined {
  if (host === '' || /[\s*@:/\\?#%[\]]/.test(host)) return undefined
  try {
    const url = new URL(`https://${host}/`)
    if (url.host !== url.hostname || url.pathname !== '/' || url.username !== '') return undefined
    return url.hostname
  } catch {
    return undefined
  }
}
