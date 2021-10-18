# Cloudflare Router

Easily manage routing using Cloudflare Workers



## Usage

```typescript
import CloudflareRouter from '@dbl-works/cloudflare-router'

const router = new CloudflareRouter({
  routes: {
    '*.example.com/*' => 's3://assets.example.com',
  }
})
router.listen()
```



## Match rules

- Starting with `/` does a path only match
- Any other start will assume matching against `[domain][path]` as the value
