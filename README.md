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
  // Global cache TTL in seconds. Without it, the router does not cache.
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

The edge cache key is the URL only. `cacheEverything` makes the router ignore the origin's own cache headers. A route with non-empty effective `auth` and a positive `edgeCacheTtl` must therefore have a storage origin such as `s3://`. Otherwise `createRouter` throws, because a cached response from an application origin would serve one user's data to every authorized user. Set `edgeCacheTtl: 0` on a protected route with an application origin.

### Single-page applications

For a single-page application, the router rewrites every navigation request to `index.html`. Asset requests keep their path. A route with a storage origin such as `s3://` is an SPA by default. Any other origin is a plain proxy by default.

The `spa` flag overrides the default. It resolves like `auth` and `edgeCacheTtl`: a route value wins, then the top-level value, then the default.

```typescript
export default createRouter({
  routes: {
    // An SPA by default.
    'app.example.com': 's3://eu-central-1.my-bucket/app',

    // A plain proxy by default.
    'api.example.com': 'https://backend.example.com',

    // An SPA on a non-S3 origin.
    'legacy.example.com': { origin: 'https://blob.example/app', spa: true },

    // Plain file serving from S3, no index.html rewrite.
    'files.example.com': { origin: 's3://eu-central-1.my-bucket/files', spa: false },
  },
})
```

## Match rules

A route key has one of two forms:

| Key                  | Matches                                                  |
| -------------------- | -------------------------------------------------------- |
| `app.example.com`    | Every request to that host                               |
| `example.com/admin`  | Requests to that host with a path under `/admin`         |

Every key names a host. A key that starts with `/` throws at startup, because the router cannot pick a host for it.

The rules:

- A host part must equal the request hostname. The comparison ignores case and the port.
- A path part matches on a segment boundary. `/admin` matches `/admin` and `/admin/x`, not `/admin-panel`.
- A trailing slash on a key has no meaning. `/admin/` and `/admin` are the same key.
- The most specific key wins. A host and path key beats a host key. Among equal keys, the longer path wins.
- A request that matches no key returns `404 Unknown host`.

The router canonicalizes the request path before it matches. It splits the pathname into segments, and it percent-decodes each segment for matching. Repeated slashes collapse into one. The router forwards the segments to the origin as the client sent them.

A request matches no route when a segment fails to decode, when a segment decodes to `/`, `\`, `.`, or `..`, or when a segment contains a control character. Such a request returns `404 Unknown host`. This closes a bypass where an encoded path such as `/%61dmin/secret` missed a protected `example.com/admin` route and matched the public `example.com` route instead.

A configured key path, and a path origin such as `/new-path`, must be plain. Neither may contain an empty segment, a `.` or `..` segment, or percent-encoding. Each throws at startup.

The router builds the origin URL from the origin and the rest of the request path. On an SPA route, a navigation request resolves to `index.html`, and an asset request keeps its path and query string. The router never sends the request port to the origin.

An origin has one of four forms:

| Origin                           | Result                                                          |
| -------------------------------- | --------------------------------------------------------------- |
| `s3://eu-central-1.bucket/app`   | The HTTPS URL of that S3 prefix, with SPA `index.html` rewrites |
| `https://origin.example/base`    | That URL, as a plain proxy                                      |
| `origin.example/base`            | The same, with `https://` added                                 |
| `/new-path`                      | The same host with a new path prefix                            |

`createRouter` validates every route at startup and throws on the first defect. The message names the key and the fix. It rejects:

- An empty key, a key with a scheme, a port, a wildcard, whitespace, a query, or a fragment.
- A key that does not name a host, such as a key that starts with `/`.
- Two keys that resolve to one route, such as `example.com/admin` and `example.com/admin/`.
- An origin that is not `https://`, an `s3://` shorthand, a host, or a path.
- An origin with whitespace, credentials, a query, or a fragment.
- An `s3://` origin that does not have the form `s3://REGION.BUCKET` or `s3://REGION.BUCKET/PREFIX`. A region holds lowercase letters, digits, and hyphens. A bucket holds one or more such labels joined by single dots. A prefix must not contain an empty, `.`, or `..` segment.
- A `basic` auth rule without a non-empty username and password.
- An `ip` auth rule without at least one address in `allow`.
- An `edgeCacheTtl` that is not a whole number of seconds, 0 or more.
- A route with non-empty effective `auth` and a positive `edgeCacheTtl` on an origin that is not a storage origin. See the note on caching above.
- A chain of routes that leads back to its start, because the worker would fetch itself.

The hosts the worker serves are exactly the hosts the keys name, so this self-fetch check is complete.

## Basic Authentication & IP Restrictions

You can protect specific routes by defining basic auth or IP restrictions per route, or globally in the config.

An `ip` rule lists exact client IP addresses. CIDR ranges are not supported. The client IP comes from the `CF-Connecting-IP` header that Cloudflare sets. A request without that header never satisfies an `ip` rule.

A `basic` rule on any route of a host affects every route on that host. The router removes the `Authorization: Basic ...` header from each route before it contacts the origin, including a public sibling route. A browser re-sends Basic credentials to every path on a host, so a public sibling route would otherwise forward the edge credentials to its origin. On a host where no route uses Basic auth, the header stays, so a route can proxy to an origin with its own Basic authentication.

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
