import type { StorageProvider } from './index'

// REGION.BUCKET, then an optional prefix. Regions and buckets are lowercase letters, digits and hyphens;
// a bucket may also contain dots.
const SHORTHAND = /^s3:\/\/([a-z0-9-]+)\.([a-z0-9.-]+)(\/[^?#\s]*)?$/

/**
 * Resolves the AWS domain suffix based on the S3 region.
 * EU Sovereign Cloud regions (eusc-*) use amazonaws.eu.
 */
function resolveS3Domain(region: string): string {
  if (region.startsWith('eusc-')) {
    return 'amazonaws.eu'
  }
  return 'amazonaws.com'
}

/**
 * Converts an s3:// shorthand to an HTTPS URL.
 * Shorthand format: s3://REGION.BUCKET(/PREFIX)
 *
 * Uses virtual-hosted style for buckets without dots (recommended by AWS):
 *   s3://eu-central-1.dbl-works-assets/app → https://dbl-works-assets.s3.eu-central-1.amazonaws.com/app
 *
 * Falls back to path-style for buckets with dots (required for HTTPS wildcard cert compatibility):
 *   s3://eu-central-1.assets.dbl.works/app → https://s3.eu-central-1.amazonaws.com/assets.dbl.works/app
 */
function resolveS3Url(shorthand: string): string {
  const match = shorthand.match(SHORTHAND)
  if (!match) return shorthand

  const [, region, bucket, pathSuffix = ''] = match
  const domain = resolveS3Domain(region)

  if (bucket.includes('.')) {
    // Path-style: required when bucket name contains dots (HTTPS cert wildcard limitation)
    return `https://s3.${region}.${domain}/${bucket}${pathSuffix}`
  }

  // Virtual-hosted style: recommended by AWS for all new buckets
  return `https://${bucket}.s3.${region}.${domain}${pathSuffix}`
}

export const s3: StorageProvider = {
  scheme: 's3',
  shorthand: SHORTHAND,
  usage: 's3://REGION.BUCKET or s3://REGION.BUCKET/PREFIX',
  resolve: resolveS3Url,
}
