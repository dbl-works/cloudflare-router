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
