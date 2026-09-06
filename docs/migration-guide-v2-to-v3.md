# Migration Guide: v2 to v3

Cloudflare Router v3.0.0 simplifies configuration by removing the `deployments` array. Route matching, authentication, and cache rules are now driven entirely by the `routes` object.

This guide outlines the steps to upgrade your configuration from v2.x to v3.x.

## 1. Delete the `deployments` key

The `deployments` key is completely removed in v3.0.0. If you try to run `createRouter` with a `deployments` key, it will throw an error.

**Before (v2.x)**:
```typescript
import { createRouter } from '@dbl-works/cloudflare-router'

export default createRouter({
  deployments: [
    { accountId: 'a', zoneId: 'z', routes: ['https://www.example.com/*'] },
    { accountId: 'a', zoneId: 'z', routes: ['https://cdn.example.com/*'] },
  ],
  routes: {
    'www.example.com': 's3://eu-central-1.my-bucket/landingpage',
    'cdn.example.com': 's3://eu-central-1.my-bucket/public',
  },
})
```

**After (v3.0.0)**:
```typescript
import { createRouter } from '@dbl-works/cloudflare-router'

export default createRouter({
  routes: {
    'www.example.com': 's3://eu-central-1.my-bucket/landingpage',
    'cdn.example.com': 's3://eu-central-1.my-bucket/public',
  },
})
```

## 2. Move Auth rules to `routes` or global Config

If you used `auth` inside `deployments` to protect specific routes, move those auth rules onto the routes they protect.

**Before (v2.x)**:
```typescript
export default createRouter({
  deployments: [
    {
      accountId: 'a',
      zoneId: 'z',
      routes: ['https://staging.example.com/*'],
      auth: [{ type: 'basic', username: 'test', password: 'letmein' }],
    },
  ],
  routes: {
    'www.example.com': 's3://eu-central-1.my-bucket/landingpage',
    'staging.example.com': 's3://eu-central-1.my-bucket/staging',
  },
})
```

**After (v3.0.0)**:
To apply auth to a specific route, change the route's value from a string to an object and include the `auth` array.

```typescript
export default createRouter({
  routes: {
    'www.example.com': 's3://eu-central-1.my-bucket/landingpage',
    'staging.example.com': {
      origin: 's3://eu-central-1.my-bucket/staging',
      auth: [{ type: 'basic', username: 'test', password: 'letmein' }],
    },
  },
})
```

If one rule covers every host, you can set the top-level `auth` instead:

```typescript
export default createRouter({
  auth: [{ type: 'basic', username: 'test', password: 'letmein' }],
  routes: {
    'staging1.example.com': 's3://eu-central-1.my-bucket/staging1',
    'staging2.example.com': 's3://eu-central-1.my-bucket/staging2',
  },
})
```

## 3. Handle `accountId` and `zoneId` manually

The `accountId` and `zoneId` registration metadata has been removed from the library configuration. The library no longer requires them. 

If your deployment tools (e.g. CI/CD scripts) depended on this data inside your router configuration, you should move this data directly to the deployment tools instead, as they are no longer router inputs.

## 4. 404 Behavior Changes

In v2.x, if `deployments` was empty, the router would attempt to fetch the original URL, which could lead to infinitely self-fetching workers. Also, `OPTIONS` requests were passed through to the original URL regardless of the host.

In v3.0.0, if a request is made to an unknown host (one that does not match any entry in `routes`), the router will safely and immediately return a `404 Not Found` response with the body `Unknown host`. This applies to all HTTP methods, including `OPTIONS`.

## 5. Per-route `edgeCacheTtl`

A route can set its own `edgeCacheTtl`. A route without one uses the top-level value. Without any value, the router does not cache, as in v2. The `DEFAULT_CONFIG` export is gone. It advertised a default of 86400 seconds that the router never applied.

```typescript
export default createRouter({
  edgeCacheTtl: 86400,
  routes: {
    'cdn.example.com': 's3://eu-central-1.my-bucket/assets',
    'app.example.com': { origin: 's3://eu-central-1.my-bucket/app', edgeCacheTtl: 60 },
  },
})
```

## 6. Startup validation

`createRouter` now validates every route and throws on the first defect. The error names the key and the fix. Run `wrangler dev` after the upgrade. A key with a scheme or port, two keys that differ only by a trailing slash, an `s3://` origin without a region, or an origin that points at the route host all throw. In v2 these defects produced a silent 404 or an error on the first request.

`createRouter` also throws on a `basic` rule without a username and password. It throws on an `ip` rule without an address in `allow`. It throws on an `edgeCacheTtl` that is not a whole number of seconds. It throws on a key or an origin with whitespace, a query, or a fragment.

The `s3://` shorthand grammar is tighter. A region holds lowercase letters, digits, and hyphens. A bucket holds one or more such labels joined by single dots. A prefix must not contain an empty, `.`, or `..` segment. An uppercase region, a bucket of only dots, or `/../` in the prefix now throws.

## 7. Replace `isS3Site` with `spa`

The `isS3Site` flag is gone. `createRouter` throws when it is present. In v2, `isS3Site: false` disabled `s3://` shorthands and served `index.html` on every route. In v3, `s3://` shorthands always resolve, and the `spa` flag controls the `index.html` rewrite. A route with an `s3://` origin is an SPA by default. Any other origin is a plain proxy by default.

**Before (v2.x)**:
```typescript
export default createRouter({
  isS3Site: false,
  routes: {
    'app.example.com': 'https://blob.example/app',
  },
})
```

**After (v3.0.0)**:
```typescript
export default createRouter({
  spa: true,
  routes: {
    'app.example.com': 'https://blob.example/app',
  },
})
```

Set `spa` on one route instead when only some routes are single-page applications.

## 8. Name a host in every route key

A path-only key, such as `/old-path`, is removed in v3.0.0. Every key must name a host. `createRouter` throws on a key that starts with `/`.

Change a path-only key to a `host/path` key.

**Before (v2.x)**:
```typescript
export default createRouter({
  routes: {
    '/old-path': 'https://backend.example.com/new-path',
  },
})
```

**After (v3.0.0)**:
```typescript
export default createRouter({
  routes: {
    'example.com/old-path': 'https://backend.example.com/new-path',
  },
})
```

Because the worker now serves exactly the hosts the keys name, the startup check for a self-fetching chain of routes is complete.

## 9. Configured paths must be plain

A key path and a path origin, such as `/new-path`, must not contain an empty segment, a `.` or `..` segment, or percent-encoding. Each throws at startup.

## 10. Request paths are canonicalized before matching

The router splits the request pathname into segments, percent-decodes each segment for matching, and forwards the segments as the client sent them. Repeated slashes collapse.

A request now matches no route, and returns 404, when a segment fails to decode, decodes to `/`, `\`, `.`, or `..`, or holds a control character. This closes a bypass where an encoded path reached a route that the raw path would have missed.

## 11. Only a CORS preflight skips authentication on `OPTIONS`

In v2.x, every `OPTIONS` request skipped authentication.

In v3.0.0, only a CORS preflight skips authentication: an `OPTIONS` request with an `Origin` header, an `Access-Control-Request-Method` header, and no body. Every other `OPTIONS` request is authenticated like a `GET`. An `OPTIONS` request to an unknown host still returns 404.

## 12. Basic credential stripping is per host

In v2.x, the router removed the `Authorization` header only from a route whose own effective rules held a `basic` rule.

In v3.0.0, stripping applies per host. When any route on a host uses a `basic` rule, that rule applies to every route on the host. The router removes the `Authorization: Basic ...` header from each route before it contacts the origin, including a public sibling route. A browser re-sends Basic credentials to every path on a host, so a public sibling route would otherwise forward the edge credentials to its origin. On a host where no route uses Basic auth, the header stays.

## 13. A protected route cannot cache an application origin

A route with non-empty effective `auth` and a positive `edgeCacheTtl` must have a storage origin such as `s3://`. Otherwise `createRouter` throws.

The edge cache key is the URL only, and `cacheEverything` overrides the origin's own cache headers. A cached response from an application origin would therefore serve one user's data to every authorized user.

Set `edgeCacheTtl: 0` on a protected route that has an application origin.
