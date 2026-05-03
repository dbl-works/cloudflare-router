# Cloudflare Router

Easily manage routing using Cloudflare Workers with Edge caching and Authentication matching. Supported via the modern ES Modules framework for Cloudflare Workers.

## Usage

```typescript
import { createRouter } from '@dbl-works/cloudflare-router'

export default createRouter({
  routes: {
    'example.com': 's3://eu-central-1.assets.example.com',
  },
  edgeCacheTtl: 360 // seconds, Edge Cache TTL (Time to Live) specifies how long to cache a resource in the Cloudflare edge network
})
```

## Match rules

- Starting with `/` does a path only match
- Any other start will assume matching against `[domain][path]` as the value



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
