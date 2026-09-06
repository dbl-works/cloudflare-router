# Spec: one list of routes

* Status: implemented on branch `lud/cleanup-design`, updated after review
* Target version: 3.0.0
* Date: 2026-09-06

Review rounds widened the scope. The sections below describe the shipped
design. The follow-up ideas that the reviews raised but did not ship live in
`routing-hardening-backlog.md`.

## Summary

`Config` holds two lists of hosts. `routes` maps a host to an origin.
`deployments` repeats the same host as a URLPattern, and carries the
authentication rules. The router rejects any request that no deployment
pattern matches.

The two lists must agree. Nothing enforces that. A host in `routes` that no
deployment covers returns HTTP 404 at the edge.

This spec removes `deployments`. A route declares its own authentication and
its own cache lifetime. The host appears once. The inconsistent state becomes
impossible to express.

## Problem

### The gate runs before the router reads `routes`

`createRouter` compiles `deployments` once. See `src/cloudflare-router.ts`:

```typescript
const compiledDeployments = compileDeployments(config.deployments ?? [])
```

`withAuth` then gates every request. See `src/utils/with-auth.ts`:

```typescript
if (compiledDeployments.length === 0 || request.method === 'OPTIONS') {
  return callback(request)
}

const deployment = deploymentForRequest(request, compiledDeployments)
if (deployment === undefined) {
  return new Response('Unknown deployment', { status: 404 })
}
```

A correct `routes` entry cannot rescue a missing `deployments` entry.

### The failure mode

A user adds a host to serve a new site:

```typescript
routes: {
  'www.example.com': 's3://eu-central-1.my-bucket/landingpage',
}
```

The user does not add a matching entry to `deployments`. The result:

1. TypeScript reports no error. Both fields are valid on their own.
2. The unit tests of the consumer project still pass.
3. Every request to `www.example.com` returns 404 with the body
   `Unknown deployment`.
4. Every other host keeps working, so the deploy looks healthy.

The README already documents the same 404 as the symptom of a stale
`compatibility_date`. One message now has two unrelated causes.

### An empty `deployments` list has no defined behavior

`withAuth` passes every request through when `deployments` is empty. If no
`routes` entry matches, `normalizeRequest` returns the request unchanged:

```typescript
return { request, cache: false }
```

`handleRequest` then fetches the original URL. A worker bound to that host
fetches itself. The library documents no outcome for this path.

### `accountId` and `zoneId` do no work

`Deployment` requires both fields. Both appear only in `src/config.ts`. No
file under `src/` reads either one. They describe where a deploy tool must
register the worker. They are not router input.

## Goals

* Declare each host exactly once.
* Make the inconsistent configuration impossible to express.
* Give an unknown host one defined answer.
* Keep authentication scoped to a subset of hosts.
* Let a static asset host and an application host cache for different times.
* Offer one way to do each thing.

## Non-goals

* No change to the cache headers that `handleRequest` sends.
* No change to the basic auth or IP auth algorithms. The header parsing and
  the header stripping did change, see "Authentication".
* No compatibility mode for the 2.x configuration shape.
* No deploy automation. This library does not call the Cloudflare API.
* No CIDR support in IP rules.

An early draft also excluded origin resolution. Review found that
`normalizeRequest` rewrote a serialized URL with string replacement, and that
every route matching defect came from that. The shipped design parses the URL
once. See "Route matching".

## Proposed design

### Principle

Make the bad state unrepresentable. Validate only what a type cannot express.

A route is the unit of configuration. A route owns its origin, its
authentication, its cache lifetime, and its SPA behavior. No second list
exists, so no second list can disagree.

A route key and an origin are strings. A type cannot reject a key with a port
or an origin that points back at the worker. `createRouter` validates those
at startup and throws. The message names the key and the fix. The rule from
the `deployments` removal applies: a defect fails in `wrangler dev`, not on
the first production request.

### The configuration

```typescript
export type AuthMethods = BasicAuthMethod | IPAuthMethod

export interface Route {
  origin: string
  auth?: AuthMethods[]
  edgeCacheTtl?: number
  spa?: boolean
}

export type Routes = Record<string, string | Route>

export interface Config {
  routes: Routes
  auth?: AuthMethods[]
  edgeCacheTtl?: number
  spa?: boolean
}
```

A route value is a string or an object. A string is the origin, and the route
takes every default. An object overrides a default for that route.

### One resolution rule

`auth`, `edgeCacheTtl` and `spa` resolve the same way. A route that sets the
key uses its own value. Every other route uses the top-level value. Without
either, the key takes its default.

| Key            | Default                                        |
| -------------- | ---------------------------------------------- |
| `auth`         | Public                                         |
| `edgeCacheTtl` | `0`, no edge cache. This matches 2.x.          |
| `spa`          | `true` for a storage origin such as `s3://`    |

One rule covers three keys, so a reader learns it once.

### Route matching

A key has three forms: `host`, `host/path`, and `/path`. The router parses the
request URL once and compares the canonical hostname and the pathname:

* A host part must equal the hostname. Case and port do not matter.
* A path part matches on a segment boundary. `/admin` matches `/admin` and
  `/admin/x`, not `/admin-panel`.
* A trailing slash on a key or an origin has no meaning.
* The most specific key wins: host and path, then host, then path. Among
  equals, the longer path wins.

The router builds the target URL from the resolved origin and the rest of the
request path. On an SPA route a navigation resolves to `index.html`. An asset
keeps its path and query. The request port never reaches the origin.

Storage shorthands live behind a small provider interface in
`src/utils/providers/`. S3 is the only provider. A new provider is one module
and one list entry.

### Startup validation

`createRouter` compiles the routes once and rejects:

* An empty key, or a key with a scheme, port, wildcard, query, fragment, or
  whitespace.
* Two keys that resolve to one route, such as `example.com/admin` and
  `example.com/admin/`.
* An origin that is not `https://`, a storage shorthand, a host, or a path.
* An origin with credentials, a query, or a fragment.
* A storage shorthand that does not match its provider grammar.
* A chain of routes that leads back to its start, so the worker would fetch
  itself. The check knows the hosts named in the keys. A host that no key
  names counts as external.

The `isS3Site` key throws like `deployments` does. The message names `spa`.

### Authentication

```typescript
export default createRouter({
  // Protects every route below.
  auth: [{ type: 'basic', username: 'test', password: 'letmein' }],

  routes: {
    'staging.example.com': 's3://eu-central-1.my-bucket/app',

    // Opts out. An empty list means public.
    'cdn.example.com': { origin: 's3://eu-central-1.my-bucket/public', auth: [] },

    // Overrides with a different rule.
    'admin.example.com': {
      origin: 's3://eu-central-1.my-bucket/admin',
      auth: [{ type: 'ip', allow: ['192.168.1.1'] }],
    },
  },
})
```

Two concepts cover every case. A default for the worker, and an override for
one route.

The Basic scheme is matched case-insensitively, as RFC 7235 requires. When
the effective rules of a route contain a `basic` rule, the router removes the
`Authorization` header before it contacts the origin. Otherwise the header
stays, so a public or IP-only route can proxy to an origin with its own Basic
authentication. Credentials are compared after Unicode normalization on both
sides. An IP rule needs the `CF-Connecting-IP` header. Without it, the rule
never matches.

### Edge cache

A static asset host and an application host want different cache lifetimes.
Hashed assets never change, so they take a long lifetime. An entry document
changes on every deploy, so it takes a short one.

```typescript
export default createRouter({
  // Applies to every route below.
  edgeCacheTtl: 86400,

  routes: {
    // Immutable, hashed filenames. Cache for a year.
    'cdn.example.com': {
      origin: 's3://eu-central-1.my-bucket/public',
      edgeCacheTtl: 31536000,
    },

    // Rewritten to index.html on every navigation. Revalidate often.
    'app.example.com': {
      origin: 's3://eu-central-1.my-bucket/app',
      edgeCacheTtl: 60,
    },

    // Takes the top-level default.
    'www.example.com': 's3://eu-central-1.my-bucket/landingpage',
  },
})
```

A route may set `edgeCacheTtl: 0` to disable the edge cache for that host
alone. The router therefore resolves the value with `??`, not with `&&`. A
value of `0` is a deliberate choice, not an absent key.

The 2.x code reads `cache && config.edgeCacheTtl ? config.edgeCacheTtl : 0`
in `src/cloudflare-router.ts`. That expression cannot express a per-route
zero, because it treats `0` as absent.

Without any `edgeCacheTtl` the router does not cache. That is the 2.x
behavior. The 2.x `DEFAULT_CONFIG` export advertised 86400 seconds but was
never applied, so 3.0.0 removes the export. A cache that is on by default
would store a per-user response from a dynamic origin behind IP auth and
serve it to the next user.

### An unknown host returns 404

The router resolves the route first. If no `routes` entry matches, it returns
404. It never fetches the original URL.

This replaces the self-fetch described above. It also keeps the useful half of
the 2.x gate. A worker answers only for the hosts it declares.

The 404 also removes the internal `cache` flag. `normalizeRequest` returns
`cache: false` today for an unmatched request, and `createRouter` uses the flag
to force a TTL of zero. A matched route is now the only way to reach
`handleRequest`, so the flag always holds `true`.

`normalizeRequest` therefore returns the matched route instead of the flag.
The caller reads the origin and the cache lifetime from one object.

### `OPTIONS` requests

An `OPTIONS` request skips authentication, so a browser can read the CORS
headers of the origin. It still needs a matching route. An `OPTIONS` request
to an unknown host returns 404.

The 2.x behavior skips the whole gate. That is wider than the reason for it.

### `deployments` is removed

`createRouter` throws when the configuration contains a `deployments` key. The
error names the replacement. A silently ignored key would leave a consumer
believing that authentication still applies.

## API surface

A public site, before:

```typescript
createRouter({
  deployments: [
    { accountId: 'a', zoneId: 'z', routes: ['https://www.example.com/*'] },
    { accountId: 'a', zoneId: 'z', routes: ['https://cdn.example.com/*'] },
  ],
  routes: {
    'www.example.com': 's3://eu-central-1.my-bucket/landingpage',
    'cdn.example.com': 's3://eu-central-1.my-bucket/public',
  },
})
```

The same site, after:

```typescript
createRouter({
  routes: {
    'www.example.com': 's3://eu-central-1.my-bucket/landingpage',
    'cdn.example.com': 's3://eu-central-1.my-bucket/public',
  },
})
```

One protected host among public hosts, before:

```typescript
createRouter({
  deployments: [
    { accountId: 'a', zoneId: 'z', routes: ['https://www.example.com/*'] },
    {
      accountId: 'a',
      zoneId: 'z',
      routes: ['https://staging.example.com/*'],
      auth: [{ type: 'basic', username: 'test', password: 'letmein' }],
    },
  ],
  routes: {
    'www.example.com': 's3://eu-central-1.my-bucket/landingpage',
    'staging.example.com': 's3://eu-central-1.my-bucket/staging',
  },
})
```

After:

```typescript
createRouter({
  routes: {
    'www.example.com': 's3://eu-central-1.my-bucket/landingpage',
    'staging.example.com': {
      origin: 's3://eu-central-1.my-bucket/staging',
      auth: [{ type: 'basic', username: 'test', password: 'letmein' }],
    },
  },
})
```

## Accepted trade-offs

### Authentication loses URLPattern matching

A 2.x deployment protects a pattern, such as `https://*.example.com/*`. A 3.x
route protects one key.

This costs little, because `routes` never supported a wildcard host.
`normalizeRequest` compares a key with `startsWith`, so a key of `example.com`
never matches `app.example.com`. A consumer already lists every host.

A consumer that protected a whole zone now sets the top-level `auth`. A
consumer that protected some hosts of a zone now sets `auth` per route.

### The registration metadata leaves the library

`accountId` and `zoneId` are gone. A deploy tool that needs the host list
reads `Object.keys(config.routes)`. A tool that needs a zone per host holds
that map itself, next to the credentials it already holds.

### There is no compatibility flag

A flag would keep the 2.x shape alive, and with it the two lists. The point of
this release is to remove the second list.

## Semantic versioning

This is a major release. These behaviors change:

* `deployments` is removed. `createRouter` throws when it is present.
* `isS3Site` is replaced by `spa`. `createRouter` throws when it is present.
* `DEFAULT_CONFIG` is no longer exported.
* An unknown host returns 404. Before, with an empty `deployments` list, the
  router fetched the original URL.
* An `OPTIONS` request to an unknown host returns 404. Before it passed
  through.
* `createRouter` validates the routes and throws on a defect. Before, a
  defect surfaced as a silent 404 or an error on the first request.
* Route matching is exact on the hostname and on path segment boundaries.
  Before, a substring match on the serialized URL decided.

### Migration

1. Upgrade to 3.0.0.
2. Delete the `deployments` key.
3. For each deployment that defined `auth`, move that `auth` onto each route
   it covered. Change the route value from a string to an object.
4. If one rule covered every host, set the top-level `auth` instead.
5. Move `accountId` and `zoneId` to the deploy tool, or delete them.
6. Replace `isS3Site: false` with `spa: true`, or set `spa` per route.
7. Run `wrangler dev`. A leftover `deployments` or `isS3Site` key throws and
   names the fix. So does a malformed route.

## Test plan

Rewrite `test/utils/with-auth.test.ts` as `test/utils/authorize.test.ts`:

* A public route passes through.
* A route with `auth` returns 401 without credentials.
* A route with `auth` passes through with correct credentials.
* A route with `auth: []` ignores the top-level `auth`.
* A route without `auth` applies the top-level `auth`.
* A route with `auth` overrides the top-level `auth`.
* An IP rule and a basic rule on one route both grant access.
* An unknown host returns 404.
* An `OPTIONS` request to a protected route passes through.
* An `OPTIONS` request to an unknown host returns 404.

Update `test/utils/normalize-request.test.ts`:

* A string route value resolves as it does today.
* An object route value resolves its `origin` the same way.
* A path-only key still matches any host.
* A matched request returns its route.

Add cases to `test/utils/handle-request.test.ts`:

* A route without `edgeCacheTtl` uses the top-level value.
* A route with `edgeCacheTtl` overrides the top-level value.
* A route with `edgeCacheTtl: 0` disables the cache under a non-zero default.
* A config with no `edgeCacheTtl` anywhere does not cache.

Update `test/index.test.ts`:

* `createRouter` accepts a config with routes only.
* `createRouter` throws on a `deployments` key, and the message names `auth`.
* `createRouter` throws on an `isS3Site` key, and the message names `spa`.
* `createRouter` throws on each invalid key and origin form listed under
  "Startup validation", and accepts every documented form.
* `createRouter` compiles the routes once.

The shipped test files add cases for every review finding. Each asserts the
resulting URL, not only that a route matched.

Delete `test/utils/deployment-for-request.test.ts`.

## Implementation phases

1. Change the types in `src/config.ts`. Add the `Route` interface. Widen
   `Routes`. Remove `Deployment`.
2. Teach `normalizeRequest` to read an origin from a string or an object. Have
   it return the matched route in place of the `cache` flag. Update its tests.
   The gate still behaves as it does in 2.x.
3. Resolve `edgeCacheTtl` from the route with `??`, then from the config. Pass
   the result to `handleRequest`. Update its tests.
4. Replace `src/utils/with-auth.ts` with `src/utils/authorize.ts`. It resolves
   the route, returns 404 for an unknown host, and applies the auth rule.
   Delete `src/utils/deployment-for-request.ts`.
5. Throw in `createRouter` on a `deployments` key.
6. Update `index.ts`, `README.md`, and `CHANGELOG.md`. Describe the 404 cause
   that this release removes. Document the per-route cache lifetime.
7. Review round. Replace string replacement in `normalizeRequest` with URL
   parsing. Split origin resolution into `resolve-origin.ts` and a provider
   module per storage service. Add `compile-routes.ts` with key parsing,
   specificity ordering, validation, and cycle detection. Replace `isS3Site`
   with `spa`. Restore the 2.x cache default. Update the docs.

## Resolved questions

Earlier drafts proposed a validator for the two-list state, a strict mode, and
a helper that derived `deployments` from `routes`. This design drops all
three. That validator guards a state that this shape cannot reach. A strict
mode keeps two sources of truth. A helper generates a list that no longer
exists.

The shipped validator is a different thing. It checks the string grammar of
keys and origins, which no type can express. See "Startup validation".
