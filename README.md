# Cloudflare Router

Easily manage routing using Cloudflare Workers



## Usage

```typescript
import { startWorker } from '@dbl-works/cloudflare-router'

startWorker({
  routes: {
    'example.com': 's3://eu-central-1.assets.example.com',
  },
  edgeCacheTtl: 360 // seconds, Edge Cache TTL (Time to Live) specifies how long to cache a resource in the Cloudflare edge network
})
```



## Match rules

- Starting with `/` does a path only match
- Any other start will assume matching against `[domain][path]` as the value



## Basic Authentication

You can protect a deployment by defining basic auth in the config.

```typescript
startWorker({
  deployments: [
    {
      accountId: '12345',
      zoneId: 'abcdef',
      routes: [
        '*example.com/*',
      ],
      auth: [
        {
          type: 'basic',
          username: 'test',
          password: 'letmein',
        },
      ],
    },
  ],
  routes: {
  },
})
```
