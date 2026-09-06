import { test, expect } from 'vitest'
import { s3 } from '../../../src/utils/providers/s3'

test.each([
  ['s3://eu-central-1.my-bucket/app', 'https://my-bucket.s3.eu-central-1.amazonaws.com/app'],
  ['s3://eu-central-1.my-bucket', 'https://my-bucket.s3.eu-central-1.amazonaws.com'],
  ['s3://eu-central-1.my-bucket/', 'https://my-bucket.s3.eu-central-1.amazonaws.com'],
  ['s3://eu-central-1.my-bucket/a/b/', 'https://my-bucket.s3.eu-central-1.amazonaws.com/a/b'],
  ['s3://us-east-1.assets.example.com/admin', 'https://s3.us-east-1.amazonaws.com/assets.example.com/admin'],
  ['s3://eusc-de-east-1.my-app', 'https://my-app.s3.eusc-de-east-1.amazonaws.eu'],
  ['s3://us-gov-west-1.abc', 'https://abc.s3.us-gov-west-1.amazonaws.com'],
  ['s3://ap-southeast-3.my-app-123456789012-eu-central-1-an/assets', 'https://my-app-123456789012-eu-central-1-an.s3.ap-southeast-3.amazonaws.com/assets'],
  [`s3://eu-central-1.${'a'.repeat(63)}`, `https://${'a'.repeat(63)}.s3.eu-central-1.amazonaws.com`],
])('parses %s', (origin, url) => {
  expect(s3.parse(origin)).toEqual({ url })
})

test.each([
  ['no region', 's3://bucket/app', /no region/],
  ['a region that is not AWS-shaped', 's3://bucket.name/app', /not an AWS region/],
  ['an uppercase region', 's3://EU-central-1.bucket', /not an AWS region/],
  ['a region with a leading hyphen', 's3://-1.bucket', /not an AWS region/],
  ['a 2-character bucket', 's3://eu-central-1.ab', /3 to 63/],
  ['a 64-character bucket', `s3://eu-central-1.${'a'.repeat(64)}`, /3 to 63/],
  ['an uppercase bucket', 's3://eu-central-1.MyBucket', /lowercase/],
  ['an underscore', 's3://eu-central-1.my_bucket', /lowercase letters, digits, dots and hyphens/],
  ['a leading hyphen', 's3://eu-central-1.-bucket', /starts and ends with a letter or digit/],
  ['a trailing hyphen', 's3://eu-central-1.bucket-/app', /starts and ends with a letter or digit/],
  ['a hyphen next to a dot', 's3://eu-central-1.my-.bucket', /starts and ends with a letter or digit/],
  ['adjacent dots', 's3://eu-central-1.my..bucket', /starts and ends with a letter or digit/],
  ['only dots', 's3://eu-central-1.../private', /3 to 63/],
  ['three dots', 's3://eu-central-1..../private', /starts and ends with a letter or digit/],
  ['an IP address', 's3://eu-central-1.192.168.1.1', /not an IP address/],
  ['a reserved prefix', 's3://eu-central-1.xn--bucket', /reserved prefix/],
  ['a reserved suffix', 's3://eu-central-1.bucket-s3alias', /reserved suffix/],
  ['an encoded dot segment in the prefix', 's3://eu-central-1.assets.example/%2e%2e/private', /prefix is percent-encoded/],
  ['a dot segment in the prefix', 's3://eu-central-1.bucket/../other', /prefix contains a "\." or "\.\." segment/],
  ['a backslash in the prefix', 's3://eu-central-1.bucket/foo\\bar', /prefix contains a backslash/],
  ['an empty prefix segment', 's3://eu-central-1.bucket//other', /prefix contains an empty segment/],
  ['a space in the bucket', 's3://eu-central-1.my bucket/app', /lowercase letters, digits, dots and hyphens/],
  ['a space in the prefix', 's3://eu-central-1.bucket/my app', /prefix contains a character that is not allowed/],
  ['a query in the prefix', 's3://eu-central-1.bucket/app?x=1', /prefix contains a character that is not allowed/],
])('rejects %s', (_name, origin, error) => {
  const result = s3.parse(origin)
  expect('error' in result && result.error).toMatch(error)
})
