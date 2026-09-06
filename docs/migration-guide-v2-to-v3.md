# Migration Guide: v2 to v3

Use this guide to update a v2 configuration for Cloudflare Router v3.

## 1. Replace `deployments` with route settings

Remove the `deployments` array. v3 stores each route and its settings in `routes`.

Move each deployment `auth` rule to the route that it protects. Use top-level `auth` when the same rule protects every route.

Before (v2):

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

After (v3):

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

If the same rule protects every route, move it to top-level `auth`. Add `auth: []` to a route that must stay public.

Remove `accountId` and `zoneId` from the router configuration. Set these values in the deployment tool that uses them.

## 2. Move per-route options

Route objects can override these top-level options:

```typescript
export default createRouter({
  edgeCacheTtl: 86400,
  spa: true,
  routes: {
    'cdn.example.com': 's3://eu-central-1.my-bucket/assets',
    'app.example.com': {
      origin: 'https://backend.example.com/app',
      edgeCacheTtl: 0,
      spa: false,
    },
  },
})
```

- `edgeCacheTtl` is the cache lifetime in seconds. The default is `0`, which disables the edge cache.
- `spa` serves `index.html` for navigations. It defaults to `true` for `s3://` origins and `false` for other origins.
- `cors` allows a valid CORS preflight to skip authentication. It defaults to `true` for `s3://` origins and `false` for other origins.

Replace `isS3Site` with `spa`. Remove `DEFAULT_CONFIG`; v3 does not export it.

Set `edgeCacheTtl: 0` on protected application routes. A protected application route cannot use a positive cache lifetime. Protected storage routes can use a positive lifetime.

## 3. Update route keys and origins

Every route key must include a host. Change a path-only key to a `host/path` key.

```typescript
// v2
{ '/old-path': 'https://backend.example.com/new-path' }

// v3
{ 'example.com/old-path': 'https://backend.example.com/new-path' }
```

Keep configured paths plain. Remove percent-encoding, backslashes, empty segments, and `.` or `..` segments from route keys, origin paths, and S3 prefixes.

Remove schemes and ports from route keys. Remove credentials from origins. Use valid AWS regions and bucket names in `s3://` origins.

## 4. Check CORS and authentication behavior

Only a valid CORS preflight on a route with `cors: true` skips authentication. Set `cors: true` when a browser calls a protected application route from another host.

```typescript
export default createRouter({
  auth: [{ type: 'basic', username: 'test', password: 'letmein' }],
  routes: {
    'api.example.com': {
      origin: 'https://backend.example.com',
      cors: true,
    },
  },
})
```

A failed request returns `401` with a Basic challenge only when the route has a Basic rule. Other authentication failures return `403`.

If any route on a host uses Basic authentication, the router removes the Basic header before every origin request on that host. This includes public sibling routes.

## 5. Fix startup validation errors

`createRouter` validates the complete configuration at startup. Run `wrangler dev` after each change and fix the reported error.

Common fixes include:

- Remove unknown keys.
- Use booleans for `spa` and `cors`.
- Use a nonnegative whole number for `edgeCacheTtl`.
- Give each Basic rule a username and password.
- Give each IP rule individual IPv4 or IPv6 addresses. CIDR ranges are not supported.
- Remove duplicate routes and route cycles.

Requests to an unknown host return `404 Not Found` with the body `Unknown host`. This also applies to `OPTIONS` requests.
