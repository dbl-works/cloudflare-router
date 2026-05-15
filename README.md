# Cloudflare Router

Easily manage routing using Cloudflare Workers with Edge caching and Authentication matching. Supported via the modern ES Modules framework for Cloudflare Workers.

## Setup

> [!IMPORTANT]
> **Cloudflare Workers `compatibility_date` ≥ `2025-05-01` required**
>
> Since v2.0.0, deployment route matching uses the [URLPattern](https://developer.mozilla.org/en-US/docs/Web/API/URLPattern) API. The spec-compliant `urlpattern_standard` implementation became the default on `2025-05-01`.
>
> With an older `compatibility_date`, the Workers runtime uses a **non-spec-compliant URLPattern** that silently fails to match routes, causing `"Unknown deployment"` (HTTP 404) errors.
>
> ```toml
> # wrangler.toml — ensure this is 2025-05-01 or later
> compatibility_date = "2025-05-01"
> ```

## Usage

```typescript
import { createRouter } from '@dbl-works/cloudflare-router'

export default createRouter({
  routes: {
    'example.com': 's3://eu-central-1.assets.example.com',
  },
  edgeCacheTtl: 360 // seconds, Edge Cache TTL specifies how long to cache a resource in the Cloudflare edge network
})
```

### S3 Routing (SPA)

For single-page applications hosted on S3, non-asset requests (HTML navigation) are automatically rewritten to serve `index.html`:

```typescript
export default createRouter({
  deployments: [
    {
      accountId: 'your-account-id',
      zoneId: 'your-zone-id',
      routes: ['https://app.example.com/*'],
    },
  ],
  routes: {
    'app.example.com': 's3://eu-central-1.my-bucket/app',
  },
})
```

## Match rules

- Starting with `/` does a path only match
- Any other start will assume matching against `[domain][path]` as the value

## Deployment Routes (URLPattern syntax)

Since v2.0.0, deployment `routes` use [URLPattern](https://developer.mozilla.org/en-US/docs/Web/API/URLPattern) syntax (not glob patterns):

```typescript
// v2.0.0+ (URLPattern syntax)
routes: ['https://app.example.com/*']
routes: ['https://*.example.com/*']

// v1.x (old glob syntax — no longer supported)
routes: ['*app.example.com/*']
```

## Basic Authentication & IP Restrictions

You can protect a deployment by defining basic auth or IP restrictions in the config.

```typescript
import { createRouter } from '@dbl-works/cloudflare-router'

export default createRouter({
  deployments: [
    {
      accountId: '12345',
      zoneId: 'abcdef',
      routes: [
        'https://*.example.com/*',
      ],
      auth: [
        {
          type: 'basic',
          username: 'test',
          password: 'letmein',
        },
        {
          type: 'ip',
          allow: [
            '192.168.1.1'
          ],
        }
      ],
    },
  ],
  routes: {
  },
})
```


## Releases

- [Make sure you're logged in to npm with an account that has access to the @dbl-works scope](https://docs.npmjs.com/cli/adduser.html)
- Switch to a branch named `chore/release/X.X.X` and make sure the changelog is up to date.
- In order to cut a release invoke `yarn release`. This will bump the version, update the changelog and push a new tag to the repo. The release will be automatically published to npm.
