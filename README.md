# Cloudflare Router

Easily manage routing using Cloudflare Workers



## Usage

```typescript
import { startWorker } from '@dbl-works/cloudflare-router'

startWorker({
  routes: {
    '*.example.com/*' => 's3://assets.example.com',
  }
})
```

:warning: this will only match subdomains of `example.com`. If you want the root domain to be included in the rule, use `*example.com/*` instead.


## Match rules

- Starting with `/` does a path only match
- Any other start will assume matching against `[domain][path]` as the value
