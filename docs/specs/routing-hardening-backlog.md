# Spec: routing hardening backlog

* Status: backlog, not scheduled
* Date: 2026-09-06

## Summary

The review rounds of `one-list-of-routes.md` raised ideas that did not ship in
3.0.0. Each one is small on its own but has edge cases. This file keeps them
in one place so a later release can pick them up with the reasoning intact.

Each item states the problem, the proposed change, and the open questions.

## 1. `OPTIONS` requests skip authentication on every route

### Problem

`authorize` forwards every `OPTIONS` request without an auth check. The
stated reason is the CORS preflight, which browsers send without credentials.
The rule is wider than the reason. A `curl -X OPTIONS` with a body reaches a
protected origin unauthenticated. Rails `match ... via: :all`, Express
`app.all`, and most API gateways run a handler for it.

### Proposal

Skip authentication only for a real preflight: an `OPTIONS` request with an
`Access-Control-Request-Method` header. Every other `OPTIONS` request goes
through the same gate as a `GET`.

### Open questions

* A preflight never carries a body. Should the router drop the body of a
  forwarded preflight, or reject a preflight with a body?
* Should an S3 route answer the preflight at the edge instead of forwarding
  it? S3 CORS configuration is a common source of confusion.

## 2. Percent-encoded paths bypass path-scoped authentication

### Problem

Route matching compares the raw `URL.pathname`. A protected
`example.com/admin` next to a public `example.com` lets `/%61dmin/secret`
match the public route. The origin then decodes the path and may serve the
admin resource under the public prefix. Repeated slashes, `//admin`, have the
same effect.

### Proposal

Two options. Pick one.

* Canonicalize the pathname before matching: decode percent-encoding once,
  collapse repeated slashes, and return 404 when decoding fails. Forward the
  canonical path, re-encoded per segment.
* State that authentication is per host. Reject a configuration where two
  routes on one host resolve to different effective auth rules.

### Open questions

* Re-encoding changes the forwarded URL for every request with unusual
  characters. S3 decodes keys, so `%3A` and `:` are one key. Other origins
  may differ.
* An encoded slash, `%2F`, is a literal character in an S3 key. Decoding it
  changes the key. The canonical path must keep `%2F` encoded.

## 3. Authentication and cache are independent

### Problem

`edgeCacheTtl` and `auth` resolve independently. A dynamic origin behind an
IP rule with a positive TTL caches one user's response under a URL-only cache
key and serves it to the next authorized user. `cacheEverything: true`
overrides an origin `Cache-Control: private, no-store`.

The 3.0.0 default of no cache makes this opt-in. It is still one line away.

### Proposal

Options, from smallest to largest:

* Document the interaction next to `edgeCacheTtl` in the README.
* Respect an origin `Cache-Control: private` or `no-store` even when a TTL is
  set.
* Reject a positive `edgeCacheTtl` on a route with non-empty effective auth
  and a non-storage origin.

### Open questions

* A staging SPA on S3 behind Basic auth wants its assets cached. The rule
  must not break that case.

## 4. The media allowlist decides what is an asset

### Problem

`MEDIA_FILE_EXTENSIONS` lists 19 extensions. A request for `/robots.txt`,
`/about.html`, `/report.txt`, or `/video.mp4` on an SPA route resolves to
`index.html`. The list is a hidden configuration surface with no override.

### Proposal

Treat any last path segment with an extension as an asset. Keep a short deny
list only if a real SPA route needs a dotted segment.

### Open questions

* Some SPAs use dots in route segments, such as `/users/john.doe`. The
  allowlist protects those by accident.
* A per-route `assets` pattern would be one more key. The DSL prefers one
  rule.

## 5. `handleRequest` follows origin redirects

### Problem

`fetch` follows a 3xx from the origin by default. An S3 redirect to a bucket
URL is followed, and the client may see the origin hostname in a `Location`
header or in the final response.

### Proposal

Pass `redirect: 'manual'` and return the origin's redirect response as is, or
rewrite its `Location` back onto the route host.

### Open questions

* A rewrite needs the inverse of origin resolution, which does not exist yet.

## 6. The `edge-cache-ttl` response header exposes configuration

### Problem

`handleRequest` sets `edge-cache-ttl` on every response. It tells a client
how long the edge caches a resource. No consumer is known to read it.

### Proposal

Remove the header, or send it only when a debug flag is set.

## 7. Authentication rules are OR-only

### Problem

A route with `[basic, ip]` grants access when either rule matches. A staging
host in an audited environment often wants both: the request must come from
the VPN and carry credentials.

### Proposal

Add an `all` wrapper, or make the top-level and route rules compose with AND
instead of override. The second option changes the resolution rule, which the
DSL keeps uniform on purpose.

### Open questions

* Which shape stays readable? `auth: [{ type: 'all', rules: [...] }]` nests.
  `requireAll: true` on the route is one more key.

## 8. The self-fetch check does not know unnamed hosts

### Problem

The cycle check in `compile-routes.ts` treats the hosts named in the keys as
the hosts the worker serves. A path-only key that sends requests to a host
the worker also serves, but that no key names, is not detected:
`{ '/app': 'https://app.example.com/app' }`.

### Proposal

Let the configuration name the served hosts, or read them from the
`wrangler.toml` routes at build time. Both add a second list of hosts, which
`one-list-of-routes.md` removed on purpose.

### Open questions

* Is a path-only key worth keeping at all? Every known consumer lists its
  hosts. Without path-only keys, the served hosts are exactly the key hosts,
  and the check becomes complete.

## 9. One `WWW-Authenticate` realm for every route

### Problem

Every 401 carries `Basic realm="Cloudflare Router"`. A client that
authenticated at `/admin` re-sends the credentials to every path on that host
and realm. On a public sibling route the router keeps the header, so the edge
credentials reach that origin.

### Proposal

Derive the realm from the route key, or strip Basic credentials on every
route of a host when any route on that host uses Basic auth.
