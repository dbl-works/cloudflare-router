# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [3.0.0] - 2026-09-06

One list of routes. Each route owns its origin, its auth, its cache lifetime and its SPA behavior. See `docs/migration-guide-v2-to-v3.md`.

### Removed
- **BREAKING**: `deployments`, `accountId` and `zoneId`. Put `auth` on a route or at the top level.
- **BREAKING**: `isS3Site`. Use `spa` per route or at the top level.
- **BREAKING**: `DEFAULT_CONFIG`. It advertised a cache TTL that was never applied.
- **BREAKING**: Path-only route keys such as `'/old-path'`. Every key names a host: `'example.com/old-path'`.

### Changed
- **BREAKING**: A request to a host that no route names returns `404 Unknown host`, for every method.
- **BREAKING**: `createRouter` validates the whole configuration at startup and throws with a message that names the key and the fix. Unknown keys, malformed keys or origins, invalid auth rules, CIDR ranges in `ip` rules, and routes that would make the worker fetch itself all throw.
- **BREAKING**: `OPTIONS` requests are authenticated like any other request. Only a CORS preflight on a route with `cors: true` passes without credentials. `cors` defaults to `true` for `s3://` origins.
- **BREAKING**: A protected route with a positive `edgeCacheTtl` must have an `s3://` origin.
- **BREAKING**: A failed request on a route without a `basic` rule returns `403` instead of a `401` Basic challenge.
- A route value may be a string or an object. `auth`, `edgeCacheTtl`, `spa` and `cors` resolve the same way: route value, then top-level value, then default.
- Route matching is exact on the hostname and on path segment boundaries. The most specific key wins. Encoded paths are matched after decoding, so an encoded path cannot reach a different route than its plain form.
- Basic credentials are removed before the origin fetch on every route of a host that uses Basic auth. On other hosts the `Authorization` header is forwarded.

### Added
- Per-route `edgeCacheTtl`, `auth`, `spa` and `cors`.

## [2.0.0] - 2026-05-03
### Changed
- **BREAKING**: Deployment route patterns now use [URLPattern](https://developer.mozilla.org/en-US/docs/Web/API/URLPattern) syntax instead of glob-style patterns. Before: `*example.com/*`, After: `https://*.example.com/*`. URLPattern instances are pre-compiled at router creation time for better performance and ReDoS mitigation.
- `deployments` is now optional in `Config` — users who only need routing no longer need to specify `deployments: []`.
- Removed unused `config` parameter from internal `withAuth` function signature.

### Fixed
- `normalizeRequest` now preserves HTTP method, headers, and request body when rewriting URLs (previously created a bare `new Request(url)` losing all properties).
- Route matching loop now uses `continue` instead of `break` on partial substring mismatches, allowing later routes to match correctly.
- Basic Auth password parsing now supports colons in passwords per RFC 7617 (uses `indexOf(':')` + `slice()` instead of `split(':')`).

### Added
- Comprehensive test coverage for IP-based auth, mixed auth (IP + Basic), and edge cases (missing headers, colons in passwords).
- ESLint with `typescript-eslint` flat config.
- `.nvmrc` pinning Node 22.
- Updated `wrangler.toml` compatibility_date to `2026-04-01`.

## [1.1.0] - 2026-04-26
### Added
- Add webmanifest, map and xml as media formats

## [1.0.0] - 2026-04-06
### Changed
- **BREAKING**: Migrated to ES Module Worker syntax instead of legacy Service Worker (`addEventListener('fetch')`). Replaced `startWorker` with `createRouter` returning standard fetch handler `{ fetch() }`.
- Upgraded tests to use Vitest (`@cloudflare/vitest-pool-workers`) alongside Node 22 requirements.
- Configured proper Typescript definition emission (`index.d.ts`).
- Switched to using `crypto.subtle.digest` for timing-safe Basic Auth credentials comparison.
- Fixed IP authentication loop fallthrough bug which incorrectly permitted unauthorized traffic if a specific IP didn't match.

## [0.4.1] - 2024-03-24
### Added
- Add pdf as media format

## [0.4.0] - 2023-11-01
### Added
- Adapt to Azure

## [0.3.0] - 2022-09-01
### Added
- Add IP based auth to allow vpn/test tool access

## [0.2.0] - 2021-10-31
### Added
- Allow endpoints to be protected with basic auth [#4](https://github.com/dbl-works/cloudflare-router/pull/4)


## [0.1.0] - 2021-10-25
### Added
- Initial boilerplate, adds capability to route endpoints to S3 buckets
