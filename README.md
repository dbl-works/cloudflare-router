# Cloudflare Router

Easily manage routing using Cloudflare Workers with Edge caching and Authentication matching. Supported via the modern ES Modules framework for Cloudflare Workers.

## Setup

No special setup is required for v3.0.0. Install the package via npm or yarn.

> [!NOTE]
> In v2.x, failing to specify an adequate `compatibility_date` caused the URLPattern engine to fail and return an `Unknown deployment` 404 error. URLPattern has been removed in v3.0.0 along with `deployments`, so this is no longer an issue.
>
> If you see an `Unknown host` 404 error in v3.0.0, it means the request did not match any entry in your `routes` configuration.

## Usage

```typescript
import { createRouter } from '@dbl-works/cloudflare-router'

export default createRouter({
  // Global cache TTL
  edgeCacheTtl: 86400,

  routes: {
    // Basic route mapping
    'www.example.com': 's3://eu-central-1.my-bucket/landingpage',

    // Per-route configuration
    'app.example.com': {
      origin: 's3://eu-central-1.my-bucket/app',
      edgeCacheTtl: 60, // Overrides the global cache TTL
    },
  },
})
```

### S3 Routing (SPA)

For single-page applications hosted on S3, non-asset requests (HTML navigation) are automatically rewritten to serve `index.html`:

```typescript
export default createRouter({
  routes: {
    'app.example.com': 's3://eu-central-1.my-bucket/app',
  },
})
```

## Match rules

- Starting with `/` does a path only match
- Any other start will assume matching against `[domain][path]` as the value

## Basic Authentication & IP Restrictions

You can protect specific routes by defining basic auth or IP restrictions per route, or globally in the config.

```typescript
import { createRouter } from '@dbl-works/cloudflare-router'

export default createRouter({
  // Global auth rules applying to all routes (unless overridden)
  auth: [{ type: 'basic', username: 'admin', password: 'password123' }],

  routes: {
    // This route uses the global basic auth rule
    'admin.example.com': 's3://eu-central-1.my-bucket/admin',
    
    // This route opts out of auth entirely
    'public.example.com': {
      origin: 's3://eu-central-1.my-bucket/public',
      auth: [],
    },

    // This route overrides global auth with its own IP restriction
    'internal.example.com': {
      origin: 's3://eu-central-1.my-bucket/internal',
      auth: [
        {
          type: 'ip',
          allow: ['192.168.1.1'],
        }
      ],
    }
  },
})
```


## Releases

- [Make sure you're logged in to npm with an account that has access to the @dbl-works scope](https://docs.npmjs.com/cli/adduser.html)
- Switch to a branch named `chore/release/X.X.X` and make sure the changelog is up to date.
- In order to cut a release invoke `yarn release`. This will bump the version, update the changelog and push a new tag to the repo. The release will be automatically published to npm.
