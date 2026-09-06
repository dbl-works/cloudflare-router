import { providerFor } from './providers'

/**
 * Turns a route origin into an absolute HTTPS base URL without a trailing slash.
 *
 *   's3://eu-central-1.bucket/app' → 'https://bucket.s3.eu-central-1.amazonaws.com/app'
 *   'https://origin.example/base/' → 'https://origin.example/base'
 *   '/new-path'                    → 'https://<request hostname>/new-path'
 *   'origin.example/base'          → 'https://origin.example/base'
 */
export function resolveOrigin(origin: string, requestUrl: URL): string {
  const provider = providerFor(origin)
  let resolved = origin
  if (provider) {
    resolved = provider.resolve(origin)
  } else if (origin.startsWith('/')) {
    resolved = `https://${requestUrl.hostname}${origin}`
  } else if (!origin.startsWith('https://')) {
    resolved = `https://${origin}`
  }
  return resolved.replace(/\/+$/, '')
}
