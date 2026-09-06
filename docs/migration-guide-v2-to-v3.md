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
