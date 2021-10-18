import normalizeRequest from '../../src/utils/normalize-request'

const TEST_ROUTES = {
  'admin.example.com': 'https://s3.eu-central-1.amazonaws.com/assets.example.com/admin',
  'example.com/admin': 'https://s3.eu-central-1.amazonaws.com/assets.example.com/admin',
  'cdn.example.com': 'https://s3.eu-central-1.amazonaws.com/cdn.example.com',
  '/old-path': '/new-path',
}

test('returns the original input if no matching routes', () => {
  const actual = normalizeRequest(new Request('http://example.com/'), TEST_ROUTES)
  expect(actual.url).toEqual('http://example.com/')
})

test('maps root js file to s3 bucket subpath', () => {
  const actual = normalizeRequest(new Request('https://admin.example.com/some/file.js'), TEST_ROUTES)
  expect(actual.url).toEqual('https://s3.eu-central-1.amazonaws.com/assets.example.com/admin/some/file.js')
})

test('maps subpath js file to s3 bucket subpath', () => {
  const actual = normalizeRequest(new Request('https://example.com/admin/some/file.js'), TEST_ROUTES)
  expect(actual.url).toEqual('https://s3.eu-central-1.amazonaws.com/assets.example.com/admin/some/file.js')
})

test('maps js to s3 bucket root', () => {
  const actual = normalizeRequest(new Request('https://cdn.example.com/some/file.js'), TEST_ROUTES)
  expect(actual.url).toEqual('https://s3.eu-central-1.amazonaws.com/cdn.example.com/some/file.js')
})

test('simple path replace', () => {
  const actual = normalizeRequest(new Request('https://example.com/old-path'), TEST_ROUTES)
  expect(actual.url).toEqual('https://example.com/new-path')
})
