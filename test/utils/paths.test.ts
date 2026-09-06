import { test, expect } from 'vitest'
import fc from 'fast-check'
import { canonicalPath, plainPath, parseHostname, joinPath } from '../../src/utils/paths'

// --- canonicalPath: request paths ---

test.each([
  ['/', [], [], true],
  ['/admin', ['admin'], ['admin'], false],
  ['/admin/', ['admin'], ['admin'], true],
  ['//admin///users/', ['admin', 'users'], ['admin', 'users'], true],
  ['/%61dmin/file%20name.js', ['admin', 'file name.js'], ['%61dmin', 'file%20name.js'], false],
  ['/caf%C3%A9', ['café'], ['caf%C3%A9'], false],
  ['/a.b/c..d/...', ['a.b', 'c..d', '...'], ['a.b', 'c..d', '...'], false],
])('canonicalPath accepts %s', (pathname, decoded, raw, trailingSlash) => {
  expect(canonicalPath(pathname)).toEqual({ decoded, raw, trailingSlash })
})

test.each([
  ['encoded slash', '/admin%2Fsecret'],
  ['encoded slash, lowercase', '/admin%2fsecret'],
  ['encoded backslash', '/admin%5Csecret'],
  ['raw backslash', '/admin\\secret'],
  ['encoded dot segment', '/%2e%2e/x'],
  ['half-encoded dot segment', '/.%2e/x'],
  ['encoded single dot', '/%2e/x'],
  ['encoded NUL', '/a%00b'],
  ['encoded newline', '/a%0Ab'],
  ['encoded DEL', '/a%7Fb'],
  ['malformed escape', '/%zz'],
  ['truncated escape', '/%E0%A4%A'],
  ['lone percent', '/100%'],
])('canonicalPath rejects %s', (_name, pathname) => {
  expect(canonicalPath(pathname)).toBeUndefined()
})

// --- plainPath: configured paths ---

test.each([
  ['', []],
  ['/', []],
  ['/app', ['app']],
  ['/app/', ['app']],
  ['/app///', ['app']],
  ['/a/b.c/d-e_f~g', ['a', 'b.c', 'd-e_f~g']],
  ["/v1:x/@me/a(b)*c!$&'+,;=", ['v1:x', '@me', "a(b)*c!$&'+,;="]],
])('plainPath accepts %j', (path, segments) => {
  expect(plainPath(path)).toEqual({ segments })
})

const NOT_ALLOWED = 'contains a character that is not allowed in a URL path'

test.each([
  ['a backslash', '/foo\\../app', 'contains a backslash'],
  ['percent-encoding', '/%2e%2e/app', 'is percent-encoded'],
  ['an encoded space', '/my%20app', 'is percent-encoded'],
  ['a missing leading slash', 'app', 'does not start with "/"'],
  ['an empty segment', '/a//b', 'contains an empty segment'],
  ['a dot segment', '/a/./b', 'contains a "." or ".." segment'],
  ['a dot-dot segment', '/a/../b', 'contains a "." or ".." segment'],
  ['a space', '/my app', NOT_ALLOWED],
  ['a question mark', '/a?b', NOT_ALLOWED],
  ['a hash', '/a#b', NOT_ALLOWED],
  ['a non-ASCII character', '/café', NOT_ALLOWED],
  ['a control character', '/a' + String.fromCharCode(1) + 'b', NOT_ALLOWED],
  ['braces', '/{id}', NOT_ALLOWED],
])('plainPath rejects %s', (_name, path, error) => {
  expect(plainPath(path)).toEqual({ error })
})

// --- parseHostname ---

test.each([
  ['example.com', 'example.com'],
  ['Example.COM', 'example.com'],
  ['exämple.com', 'xn--exmple-cua.com'],
  ['127.0.0.1', '127.0.0.1'],
])('parseHostname canonicalizes %s', (host, canonical) => {
  expect(parseHostname(host)).toBe(canonical)
})

test.each(['', 'example.com:443', 'user@example.com', 'example.com/path', '*.example.com', 'exam ple.com', 'https:', '[::1]', 'a%62c.com', 'exa\\mple.com'])(
  'parseHostname rejects %j', (host) => {
    expect(parseHostname(host)).toBeUndefined()
  },
)

// --- Properties ---

// Pieces an attacker would combine: separators, encodings of separators and dots, controls, and plain text.
const nastyPiece = fc.constantFrom(
  '/', '//', '\\', '%2F', '%2f', '%5C', '%5c', '.', '..', '%2e', '%2E', '%2e%2e', '.%2e', '%00', '%0a', '%7f', '%', '%zz', '%C3%A9',
  'admin', 'secret', 'a', 'file.js', '%61dmin', '~', '@', ':', '?', '#', ' ', '{', 'é',
)
const nastyString = fc.array(nastyPiece, { minLength: 0, maxLength: 8 }).map((pieces) => pieces.join(''))

test('property: an accepted request path survives URL parsing unchanged, so what we forward is what we matched', () => {
  fc.assert(fc.property(nastyString, (input) => {
    // Request paths arrive from the URL parser, never raw.
    let pathname: string
    try {
      pathname = new URL(`https://h/${input}`).pathname
    } catch {
      return true
    }
    const canonical = canonicalPath(pathname)
    if (!canonical) return true
    const forwarded = new URL(`https://o${joinPath(canonical.raw)}`).pathname
    const again = canonicalPath(forwarded)
    return again !== undefined
      && again.raw.join('/') === canonical.raw.join('/')
      && again.decoded.join('/') === canonical.decoded.join('/')
      && again.decoded.every((segment) => !/[/\\\p{Cc}]/u.test(segment) && segment !== '.' && segment !== '..')
  }), { numRuns: 2000 })
})

test('property: an accepted configured path is a fixed point of URL parsing', () => {
  fc.assert(fc.property(nastyString, (input) => {
    const result = plainPath(`/${input}`)
    if ('error' in result) return true
    const path = joinPath(result.segments)
    const parsed = new URL(`https://h${path}`)
    return parsed.pathname === (result.segments.length === 0 ? '/' : path)
      && parsed.search === '' && parsed.hash === ''
      && JSON.stringify(plainPath(path)) === JSON.stringify(result)
  }), { numRuns: 2000 })
})
