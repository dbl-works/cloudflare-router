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

test('maps js to s3 bucket root', () => {
  const { request, cache } = normalizeRequest(new Request('https://cdn.example.com/some/file.js'), TEST_ROUTES)
  expect(request.url).toEqual('https://s3.eu-central-1.amazonaws.com/cdn.example.com/some/file.js')
  expect(cache).toEqual(true)
})

test('maps SPA root path to s3 bucket index', () => {
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

test('maps SPA root to s3 bucket root without subpath', () => {
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
