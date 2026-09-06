import type { StorageProvider } from './index'
import { plainPath, joinPath } from '../paths'

// An AWS region such as eu-central-1, us-gov-west-1 or eusc-de-east-1.
const REGION = /^[a-z]{2,4}(?:-[a-z]+)+-\d+$/

/**
 * Applies the AWS general purpose bucket naming rules. Returns the reason a
 * name is invalid, or undefined.
 */
function bucketError(bucket: string): string | undefined {
  if (bucket.length < 3 || bucket.length > 63) return 'a bucket name is 3 to 63 characters long'
  if (!/^[a-z0-9.-]+$/.test(bucket)) return 'a bucket name has lowercase letters, digits, dots and hyphens only'
  if (bucket.split('.').some((label) => label === '' || label.startsWith('-') || label.endsWith('-'))) {
    return 'each dot-separated label of a bucket name starts and ends with a letter or digit'
  }
  if (/^\d+(\.\d+){3}$/.test(bucket)) return 'a bucket name is not an IP address'
  if (bucket.startsWith('xn--') || bucket.startsWith('sthree-') || bucket.startsWith('amzn-s3-demo-')) {
    return 'a bucket name does not start with a reserved prefix'
  }
  if (bucket.endsWith('-s3alias') || bucket.endsWith('--ol-s3') || bucket.endsWith('--x-s3') || bucket.endsWith('--table-s3')) {
    return 'a bucket name does not end with a reserved suffix'
  }
  return undefined
}

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
 * Parses an s3:// shorthand into an HTTPS URL.
 * Shorthand format: s3://REGION.BUCKET(/PREFIX)
 *
 * Uses virtual-hosted style for buckets without dots (recommended by AWS):
 *   s3://eu-central-1.dbl-works-assets/app → https://dbl-works-assets.s3.eu-central-1.amazonaws.com/app
 *
 * Falls back to path-style for buckets with dots (required for HTTPS wildcard cert compatibility):
 *   s3://eu-central-1.assets.dbl.works/app → https://s3.eu-central-1.amazonaws.com/assets.dbl.works/app
 */
function parse(origin: string): { url: string } | { error: string } {
  const rest = origin.slice('s3://'.length)
  const slash = rest.indexOf('/')
  const authority = slash === -1 ? rest : rest.slice(0, slash)
  const prefix = slash === -1 ? '' : rest.slice(slash)

  const dot = authority.indexOf('.')
  if (dot === -1) return { error: 'has no region. The region comes first, then a dot, then the bucket' }
  const region = authority.slice(0, dot)
  const bucket = authority.slice(dot + 1)

  if (!REGION.test(region)) return { error: `"${region}" is not an AWS region` }
  const bucketProblem = bucketError(bucket)
  if (bucketProblem) return { error: bucketProblem }
  const path = plainPath(prefix)
  if ('error' in path) return { error: `the prefix ${path.error}` }

  const domain = resolveS3Domain(region)
  const pathSuffix = path.segments.length === 0 ? '' : joinPath(path.segments)
  const url = bucket.includes('.')
    // Path-style: required when bucket name contains dots (HTTPS cert wildcard limitation)
    ? `https://s3.${region}.${domain}/${bucket}${pathSuffix}`
    // Virtual-hosted style: recommended by AWS for all new buckets
    : `https://${bucket}.s3.${region}.${domain}${pathSuffix}`
  return { url }
}

export const s3: StorageProvider = {
  scheme: 's3',
  usage: 's3://REGION.BUCKET or s3://REGION.BUCKET/PREFIX',
  parse,
}
