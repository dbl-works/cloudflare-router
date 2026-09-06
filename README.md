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

### CORS preflights

A browser sends a CORS preflight without credentials. On a route with `cors: true`, a preflight skips authentication and the origin answers it. A preflight is an `OPTIONS` request with an `Origin` header, an `Access-Control-Request-Method` header, and no body. Every other `OPTIONS` request is authenticated like a `GET`.

The preflight headers are client-controlled, so a route must opt in. `cors` defaults to `true` for a storage origin such as `s3://`, because a bucket has no handler to reach. It defaults to `false` for an application origin. The flag resolves like `spa`: a route value wins, then the top-level value, then the default.

```typescript
export default createRouter({
  auth: [{ type: 'basic', username: 'admin', password: 'password123' }],
  routes: {
    // A protected API that browsers on another host call. Preflights pass, everything else needs credentials.
    'api.example.com': { origin: 'https://backend.example.com', cors: true },
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

`createRouter` validates the complete configuration at startup and throws on the first defect. The message names the key and the fix. Three rules cover every check:

1. **Every path is plain.** A key path, a path origin, an origin path and an `s3://` prefix pass through one validator. A plain path has no percent-encoding, no backslash, no empty segment, no `.` or `..` segment, and only characters that the URL parser never rewrites. Parsing a plain path as a URL returns it unchanged, so no later normalization can move it. The same canonicalizer handles request paths, where it decodes for matching and rejects what it cannot decode safely.
2. **Every value is checked at runtime.** TypeScript types do not protect a JavaScript consumer. An unknown key on the config, a route or an auth rule throws. `spa` and `cors` must be `true` or `false`. `edgeCacheTtl` must be a whole number of seconds, 0 or more. A `basic` rule needs a non-empty username and password. An `ip` rule needs at least one address, and each entry must be one IPv4 or IPv6 address. Addresses compare in canonical form, so `2001:DB8::1` equals `2001:db8:0:0:0:0:0:1`.
3. **Every storage shorthand parses as a complete value.** The `s3://` provider applies the AWS rules for a region and a bucket name: 3 to 63 characters, lowercase letters, digits, dots and hyphens, each label starting and ending with a letter or digit, no IP address form, no reserved prefix or suffix.

On top of these, `createRouter` rejects:

- A key that does not name a host, or has a scheme, a port, a wildcard, a query, or a fragment.
- Two keys that resolve to one route, such as `example.com/admin` and `example.com/admin/`.
- An origin that is not `https://`, an `s3://` shorthand, a host, or a path. An origin with credentials, a query, or a fragment.
- A route with non-empty effective `auth` and a positive `edgeCacheTtl` on an origin that is not a storage origin. See the note on caching above.
- A chain of routes that leads back to its start, because the worker would fetch itself. Every key names a host, so the hosts the worker serves are exactly the key hosts and this check is complete.

The test suite checks the first rule as a property over generated inputs, not only as examples.

## Basic Authentication & IP Restrictions

You can protect specific routes by defining basic auth or IP restrictions per route, or globally in the config.

An `ip` rule lists exact client IP addresses, IPv4 or IPv6. CIDR ranges are not supported, and a range in `allow` throws at startup. The client IP comes from the `CF-Connecting-IP` header that Cloudflare sets. A request without that header never satisfies an `ip` rule.

A failed request gets a `401` with a Basic challenge only when the route has a `basic` rule. A route with IP rules alone answers `403` without a challenge, so a browser never collects credentials that no rule can use.

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
