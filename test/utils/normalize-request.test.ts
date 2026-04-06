import { test, expect } from 'vitest'
import normalizeRequest from '../../src/utils/normalize-request'

const TEST_ROUTES = {
  'admin.example.com': 'https://s3.eu-central-1.amazonaws.com/assets.example.com/admin',
  'example.com/admin': 'https://s3.eu-central-1.amazonaws.com/assets.example.com/admin',
  'dashboard.example.com': 's3://eu-central-1.assets.example.com/dashboard',
  'fonts.example.com': 's3://us-east-1.fonts.example.com',
  'cdn.example.com': 's3://eu-central-1.bucket-name/public',
  '/old-path': '/new-path',
}

test('returns the original input if no matching routes', () => {
  const { request, cache } = normalizeRequest(new Request('https://example.com/'), TEST_ROUTES)
  expect(request.url).toEqual('https://example.com/')
  expect(cache).toEqual(false)
})

test('maps root js file to s3 bucket subpath', () => {
  const { request, cache } = normalizeRequest(new Request('https://admin.example.com/some/file.js'), TEST_ROUTES)
  expect(request.url).toEqual('https://s3.eu-central-1.amazonaws.com/assets.example.com/admin/some/file.js')
  expect(cache).toEqual(true)
})

test('maps root path to s3 bucket subpath', () => {
  const { request, cache } = normalizeRequest(new Request('https://admin.example.com/'), TEST_ROUTES)
  expect(request.url).toEqual('https://s3.eu-central-1.amazonaws.com/assets.example.com/admin/')
  expect(cache).toEqual(true)
})

test('maps subpath js file to s3 bucket subpath', () => {
  const { request, cache } = normalizeRequest(new Request('https://example.com/admin/some/file.js'), TEST_ROUTES)
  expect(request.url).toEqual('https://s3.eu-central-1.amazonaws.com/assets.example.com/admin/some/file.js')
  expect(cache).toEqual(true)
})

test('maps js to s3 bucket root (virtual-hosted style for dot-free bucket)', () => {
  const { request, cache } = normalizeRequest(new Request('https://cdn.example.com/some/file.js'), TEST_ROUTES)
  expect(request.url).toEqual('https://bucket-name.s3.eu-central-1.amazonaws.com/public/some/file.js')
  expect(cache).toEqual(true)
})

test('maps SPA root path to s3 bucket index (path-style for dotted bucket)', () => {
  const { request, cache } = normalizeRequest(new Request('https://dashboard.example.com/'), TEST_ROUTES)
  expect(request.url).toEqual('https://s3.eu-central-1.amazonaws.com/assets.example.com/dashboard/index.html')
  expect(cache).toEqual(true)
})

test('maps SPA sub path to s3 bucket index', () => {
  const { request, cache } = normalizeRequest(new Request('https://dashboard.example.com/users/'), TEST_ROUTES)
  expect(request.url).toEqual('https://s3.eu-central-1.amazonaws.com/assets.example.com/dashboard/index.html')
  expect(cache).toEqual(true)
})

test('maps SPA JS FILE to s3 bucket location', () => {
  const { request, cache } = normalizeRequest(new Request('https://dashboard.example.com/some/file.js'), TEST_ROUTES)
  expect(request.url).toEqual('https://s3.eu-central-1.amazonaws.com/assets.example.com/dashboard/some/file.js')
  expect(cache).toEqual(true)
})

test('maps SPA root to s3 bucket root without subpath (path-style for dotted bucket)', () => {
  const { request, cache } = normalizeRequest(new Request('https://fonts.example.com/'), TEST_ROUTES)
  expect(request.url).toEqual('https://s3.us-east-1.amazonaws.com/fonts.example.com/index.html')
  expect(cache).toEqual(true)
})

test('forwards original request when domain is not exact match', () => {
  const { request, cache } = normalizeRequest(new Request('https://api.fonts.example.com/test/'), TEST_ROUTES)
  expect(request.url).toEqual('https://api.fonts.example.com/test/')
  expect(cache).toEqual(false)
})

test('simple path replace', () => {
  const { request, cache } = normalizeRequest(new Request('https://example.com/old-path'), TEST_ROUTES)
  expect(request.url).toEqual('https://example.com/new-path')
  expect(cache).toEqual(true)
})

test('maps pdf to s3 bucket location (virtual-hosted style for dot-free bucket)', () => {
  const { request, cache } = normalizeRequest(new Request('https://cdn.example.com/some/file.pdf'), TEST_ROUTES)
  expect(request.url).toEqual('https://bucket-name.s3.eu-central-1.amazonaws.com/public/some/file.pdf')
  expect(cache).toEqual(true)
})

// --- EU Sovereign Cloud ---

test('maps to amazonaws.eu for EU Sovereign Cloud region (eusc-*)', () => {
  const routes = { 'sovereign.example.com': 's3://eusc-de-east-1.my-bucket/assets' }
  const { request, cache } = normalizeRequest(new Request('https://sovereign.example.com/file.js'), routes)
  expect(request.url).toEqual('https://my-bucket.s3.eusc-de-east-1.amazonaws.eu/assets/file.js')
  expect(cache).toEqual(true)
})

test('maps SPA to amazonaws.eu for EU Sovereign Cloud region', () => {
  const routes = { 'sovereign.example.com': 's3://eusc-de-east-1.my-app' }
  const { request, cache } = normalizeRequest(new Request('https://sovereign.example.com/dashboard'), routes)
  expect(request.url).toEqual('https://my-app.s3.eusc-de-east-1.amazonaws.eu/index.html')
  expect(cache).toEqual(true)
})

// --- Guard: bucket named "eusc-*" in standard AWS must NOT trigger .amazonaws.eu ---

test('does NOT use amazonaws.eu when bucket name starts with eusc but region is standard', () => {
  const routes = { 'edge.example.com': 's3://eu-central-1.eusc-named-bucket/public' }
  const { request, cache } = normalizeRequest(new Request('https://edge.example.com/file.js'), routes)
  expect(request.url).toEqual('https://eusc-named-bucket.s3.eu-central-1.amazonaws.com/public/file.js')
  expect(cache).toEqual(true)
})

// --- Account Regional namespace buckets ---

test('works with Account Regional namespace bucket names', () => {
  const routes = { 'app.example.com': 's3://eu-central-1.my-app-123456789012-eu-central-1-an/assets' }
  const { request, cache } = normalizeRequest(new Request('https://app.example.com/file.js'), routes)
  expect(request.url).toEqual('https://my-app-123456789012-eu-central-1-an.s3.eu-central-1.amazonaws.com/assets/file.js')
  expect(cache).toEqual(true)
})

