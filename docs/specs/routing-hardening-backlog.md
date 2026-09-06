# Spec: routing hardening backlog

* Status: backlog, not scheduled
* Date: 2026-09-06

## Summary

The review rounds of `one-list-of-routes.md` raised ideas that did not ship in
3.0.0. Each one is small on its own but has edge cases. This file keeps them
in one place so a later release can pick them up with the reasoning intact.

A second security review moved five of the original items into 3.0.0:

* The `OPTIONS` authentication gap.
* The percent-encoded path bypass.
* The authentication-and-cache interaction.
* The unnamed-host gap in the self-fetch check.
* The shared `WWW-Authenticate` realm.

Those items no longer appear below. See `one-list-of-routes.md` for the
shipped design.

Each remaining item states the problem, the proposed change, and the open
questions.

## 1. The media allowlist decides what is an asset

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

## 2. `handleRequest` follows origin redirects

### Problem

`fetch` follows a 3xx from the origin by default. An S3 redirect to a bucket
URL is followed, and the client may see the origin hostname in a `Location`
header or in the final response.

### Proposal

Pass `redirect: 'manual'` and return the origin's redirect response as is, or
rewrite its `Location` back onto the route host.

### Open questions

* A rewrite needs the inverse of origin resolution, which does not exist yet.

## 3. The `edge-cache-ttl` response header exposes configuration

### Problem

`handleRequest` sets `edge-cache-ttl` on every response. It tells a client
how long the edge caches a resource. No consumer is known to read it.

### Proposal

Remove the header, or send it only when a debug flag is set.

## 4. Authentication rules are OR-only

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
