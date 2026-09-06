# Cloudflare Router

A Cloudflare Worker that maps hosts to origins, with edge caching and authentication per route. Built for single-page applications on S3, and usable as a plain HTTPS proxy.

## Install

```sh
yarn add @dbl-works/cloudflare-router
```

Upgrading from 2.x? See [the migration guide](docs/migration-guide-v2-to-v3.md).

## Usage

```typescript
import { createRouter } from '@dbl-works/cloudflare-router'

export default createRouter({
  // Defaults for every route. Each route may override them.
  edgeCacheTtl: 86400,
  auth: [{ type: 'basic', username: 'admin', password: 'letmein' }],

  routes: {
    // A string is an origin. The route takes every default.
    'www.example.com': 's3://eu-central-1.my-bucket/landingpage',

    // An object overrides defaults for one route.
    'app.example.com': { origin: 's3://eu-central-1.my-bucket/app', edgeCacheTtl: 60 },
    'public.example.com': { origin: 's3://eu-central-1.my-bucket/public', auth: [] },
    'vpn.example.com': { origin: 's3://eu-central-1.my-bucket/internal', auth: [{ type: 'ip', allow: ['192.168.1.1'] }] },
    'api.example.com': { origin: 'https://backend.example.com', edgeCacheTtl: 0, cors: true },
  },
})
```

### Route keys

| Key                 | Matches                                          |
| ------------------- | ------------------------------------------------ |
| `app.example.com`   | Every request to that host                       |
| `example.com/admin` | Requests to that host with a path under `/admin` |

Every key names a host. Matching is exact on the hostname and on path segment boundaries, so `/admin` matches `/admin/x` but not `/admin-panel`. The most specific key wins. A request that matches no key returns `404 Unknown host`.

### Origins

| Origin                         | Result                                      |
| ------------------------------ | ------------------------------------------- |
| `s3://eu-central-1.bucket/app` | The HTTPS URL of that S3 prefix             |
| `https://origin.example/base`  | That URL, as a plain proxy                  |
| `origin.example/base`          | The same, with `https://` added             |
| `/new-path`                    | The same host with a new path prefix        |

The rest of the request path is appended to the origin. The request port never reaches the origin.

### Route options

Each option resolves the same way: the route value, then the top-level value, then the default.

| Option         | Default                    | Meaning                                                                                                   |
| -------------- | -------------------------- | --------------------------------------------------------------------------------------------------------- |
| `auth`         | `[]`, public               | Rules that grant access. One matching rule is enough. `[]` on a route opts out of the top-level rules.    |
| `edgeCacheTtl` | `0`, no cache              | Seconds to cache a `2xx` response at the edge. The cache key is the URL.                                  |
| `spa`          | `true` for `s3://` origins | Serve `index.html` for every navigation. Assets keep their path and query string.                        |
| `cors`         | `true` for `s3://` origins | Let a CORS preflight through without authentication. The origin answers it.                              |

## Authentication

Two rule types exist:

```typescript
{ type: 'basic', username: 'admin', password: 'letmein' }
{ type: 'ip', allow: ['192.168.1.1', '2001:db8::1'] }   // exact addresses, no CIDR
```

- A route with a `basic` rule answers a failed request with `401` and a Basic challenge. A route with `ip` rules alone answers `403`.
- The client address comes from the `CF-Connecting-IP` header that Cloudflare sets.
- On a host where any route uses Basic auth, the router removes the `Authorization: Basic` header before it contacts the origin. On other hosts the header is forwarded, so you can proxy to an origin with its own Basic auth.
- A protected route may cache only an `s3://` origin. The cache key is the URL, so a cached response from an application origin would be served to every authorized user.
- `OPTIONS` requests are authenticated like any other request. Set `cors: true` on a protected application origin that browsers on another host call, so the preflight passes.

## Startup validation

`createRouter` validates the whole configuration and throws on the first defect. The message names the key and the fix, so run `wrangler dev` after a change. It rejects unknown keys, malformed keys and origins, invalid auth rules, and routes that would make the worker fetch itself. The rules are listed in [the spec](docs/specs/one-list-of-routes.md#startup-validation).

## Releases

- [Make sure you're logged in to npm with an account that has access to the @dbl-works scope](https://docs.npmjs.com/cli/adduser.html)
- Switch to a branch named `chore/release/X.X.X` and make sure the changelog is up to date.
- In order to cut a release invoke `yarn release`. This will bump the version, update the changelog and push a new tag to the repo. The release will be automatically published to npm.
