# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [3.0.0] - 2026-09-06
### Changed
- **BREAKING**: Removed the `deployments` configuration array. Route matching, authentication, and cache rules are now driven entirely by the `routes` object. `createRouter` will throw an error if a `deployments` key is present.
- **BREAKING**: An unknown host request (one that doesn't match any `routes` entry) now immediately returns a `404 Not Found` with the body `Unknown host`. Previously, if `deployments` was empty, the router would attempt to fetch the original URL, which could cause a worker to self-fetch infinitely.
- **BREAKING**: `OPTIONS` requests to unknown hosts now return `404 Not Found`. Previously, they bypassed the deployment matching and were passed through to the upstream origin regardless of the host.
- **BREAKING**: Only a CORS preflight skips authentication on an `OPTIONS` request. A preflight has an `Origin` header, an `Access-Control-Request-Method` header, and no body. Every other `OPTIONS` request is authenticated like a `GET`. Before, every `OPTIONS` request skipped authentication.
- **BREAKING**: A route key must name a host. A key that starts with `/` throws at startup, and the message names the fix. The hosts the worker serves are now exactly the hosts the keys name, so the self-fetch check at startup is complete.
- Auth rules can now be defined per-route or globally in `Config`.
- Route matching now parses the request URL instead of replacing substrings. A host key must equal the request hostname. A path key matches on a segment boundary. The most specific key wins: host and path, then host. Among equal keys, the longer path wins. Trailing slashes on keys and origins have no meaning. The request port never reaches the origin, and a query string never changes the asset detection.
- Request paths are canonicalized before matching. The router percent-decodes each segment and collapses repeated slashes. A segment that fails to decode, that decodes to `.`, `..`, `/`, or `\`, or that holds a control character, matches no route and returns 404. This closes a bypass where an encoded path reached a route that the raw path would have missed.
- **BREAKING**: `createRouter` validates every route at startup and throws on a malformed key, a duplicate key, a malformed origin, or a chain of routes that leads back to its start. Keys and origins must not contain a query, fragment, or credentials. In v2 these defects surfaced as a 404 or a runtime error on the first request.
- `createRouter` also rejects a `basic` rule without a username and password, an `ip` rule without an address in `allow`, an `edgeCacheTtl` that is not a whole number of seconds, and an origin with whitespace.
- The `s3://` shorthand grammar is tighter. A region holds lowercase letters, digits, and hyphens. A bucket holds one or more such labels joined by single dots. A prefix must not contain an empty, `.`, or `..` segment.
- **BREAKING**: `createRouter` throws when a route has non-empty effective `auth` and a positive `edgeCacheTtl` on an origin that is not a storage origin such as `s3://`. The edge cache key is the URL only, so a cached response would serve one user's data to every authorized user. Set `edgeCacheTtl: 0` on such a route.
- **BREAKING**: The `isS3Site` flag is replaced by `spa`, which is available per route and at the top level. `createRouter` throws when `isS3Site` is present. A route with a storage origin such as `s3://` is an SPA by default. Any other origin is a plain proxy by default. `isS3Site: false` becomes `spa: true`.
- **BREAKING**: `DEFAULT_CONFIG` is no longer exported. It advertised an `edgeCacheTtl` of 86400 that the router never applied. Without `edgeCacheTtl` the router does not cache, as in v2.
- **BREAKING**: Basic credential stripping is now per host. When any route on a host uses a `basic` rule, the router removes the `Authorization: Basic ...` header from every route on that host, including a public sibling route. Before, stripping followed the effective rules of the route alone. The Basic scheme is matched case-insensitively.
- An `ip` rule now rejects a request without a `CF-Connecting-IP` header. Before, such a request matched an `allow` entry of `0.0.0.0/0`.
- Basic auth compares credentials after Unicode normalization on both sides, so a rule stored in NFD matches a client that sends NFC.

### Added
- Added per-route `edgeCacheTtl` support, allowing you to configure different cache lifetimes for different hosts.

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
