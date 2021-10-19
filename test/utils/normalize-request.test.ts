import normalizeRequest from '../../src/utils/normalize-request'

const TEST_ROUTES = {
  'admin.example.com': 'https://s3.eu-central-1.amazonaws.com/assets.example.com/admin',
  'example.com/admin': 'https://s3.eu-central-1.amazonaws.com/assets.example.com/admin',
  'dashboard.example.com': 's3://eu-central-1.assets.example.com/dashboard',
  'fonts.example.com': 's3://us-east-1.fonts.example.com',
  'cdn.example.com': 'https://s3.eu-central-1.amazonaws.com/cdn.example.com',
  '/old-path': '/new-path',
}

test('returns the original input if no matching routes', () => {
  const actual = normalizeRequest(new Request('https://example.com/'), TEST_ROUTES)
  expect(actual.url).toEqual('https://example.com/')
})

test('maps root js file to s3 bucket subpath', () => {
  const actual = normalizeRequest(new Request('https://admin.example.com/some/file.js'), TEST_ROUTES)
  expect(actual.url).toEqual('https://s3.eu-central-1.amazonaws.com/assets.example.com/admin/some/file.js')
})

test('maps root path to s3 bucket subpath', () => {
  const actual = normalizeRequest(new Request('https://admin.example.com/'), TEST_ROUTES)
  expect(actual.url).toEqual('https://s3.eu-central-1.amazonaws.com/assets.example.com/admin/')
})

test('maps subpath js file to s3 bucket subpath', () => {
  const actual = normalizeRequest(new Request('https://example.com/admin/some/file.js'), TEST_ROUTES)
  expect(actual.url).toEqual('https://s3.eu-central-1.amazonaws.com/assets.example.com/admin/some/file.js')
})

test('maps js to s3 bucket root', () => {
  const actual = normalizeRequest(new Request('https://cdn.example.com/some/file.js'), TEST_ROUTES)
  expect(actual.url).toEqual('https://s3.eu-central-1.amazonaws.com/cdn.example.com/some/file.js')
})

test('maps SPA root path to s3 bucket index', () => {
  const actual = normalizeRequest(new Request('https://dashboard.example.com/'), TEST_ROUTES)
  expect(actual.url).toEqual('https://s3.eu-central-1.amazonaws.com/assets.example.com/dashboard/index.html')
})

test('maps SPA sub path to s3 bucket index', () => {
  const actual = normalizeRequest(new Request('https://dashboard.example.com/users/'), TEST_ROUTES)
  expect(actual.url).toEqual('https://s3.eu-central-1.amazonaws.com/assets.example.com/dashboard/index.html')
})

test('maps SPA JS FILE to s3 bucket location', () => {
  const actual = normalizeRequest(new Request('https://dashboard.example.com/some/file.js'), TEST_ROUTES)
  expect(actual.url).toEqual('https://s3.eu-central-1.amazonaws.com/assets.example.com/dashboard/some/file.js')
})

test('maps SPA root to s3 bucket root without subpath', () => {
  const actual = normalizeRequest(new Request('https://fonts.example.com/'), TEST_ROUTES)
  expect(actual.url).toEqual('https://s3.us-east-1.amazonaws.com/fonts.example.com/index.html')
})

test('forwards original request when domain is not exact match', () => {
  const actual = normalizeRequest(new Request('https://api.fonts.example.com/test/'), TEST_ROUTES)
  expect(actual.url).toEqual('https://api.fonts.example.com/test/')
})

test('simple path replace', () => {
  const actual = normalizeRequest(new Request('https://example.com/old-path'), TEST_ROUTES)
  expect(actual.url).toEqual('https://example.com/new-path')
})
