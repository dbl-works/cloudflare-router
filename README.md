# Cloudflare Router

Easily manage routing using Cloudflare Workers

## Usage

```toml
# wrangler.toml
name = "my-worker"
routes = [
  {
    pattern = "*example.com/*",
    zone_id = "5d7a8c0f96213b4e1a57b0c2f9478ec3"
  },
]
```

```typescript
startWorker({
  deployments: [
    {
      routes: [
        '*example.com/*',
      ],
      auth: [ // optional
        {
          type: 'basic',
          username: 'test',
          password: 'lemmein',
        },
        {

        }
      ],
    },
  ],
  routes: { // define proxy routes
    'production-example.com': 's3://eu-central-1.assets.example.com',
  },
  edgeCacheTtl: 360 // optional: Edge Cache TTL (Time to Live) specifies how long (in secs) to cache a resource in the Cloudflare edge network
})
```

## Match rules

- Starting with `/` does a path only match
- Any other start will assume matching against `[domain][path]` as the value

## Releases

- [Make sure you're logged in to npm.](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry#authenticating-with-a-personal-access-token)
- Switch to a branch named `chore/release/X.X.X` and make sure the changelog is up to date.
- In order to cut a release invoke `yarn release`. This will bump the version, update the changelog and push a new tag to the repo. The release will be automatically published to npm.
