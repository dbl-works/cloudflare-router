# Cloudflare Router

Easily manage routing using Cloudflare Workers



## Usage

```typescript
import { startWorker } from '@dbl-works/cloudflare-router'

startWorker({
  routes: {
    'example.com': 's3://eu-central-1.assets.example.com',
  }
})
```



## Match rules

- Starting with `/` does a path only match
- Any other start will assume matching against `[domain][path]` as the value
