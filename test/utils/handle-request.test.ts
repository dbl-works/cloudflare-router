import { test, expect, vi } from 'vitest'
import handleRequest from '../../src/utils/handle-request'

test('applies cache when ttl > 0', async () => {
  const mockFetch = vi.fn().mockResolvedValue(new Response('ok'))
  vi.stubGlobal('fetch', mockFetch)

  const request = new Request('https://example.com')
  const response = await handleRequest(request, 360)

  expect(mockFetch).toHaveBeenCalled()
  const callArgs = mockFetch.mock.calls[0]
  expect(callArgs[0]).toBe(request)
  expect(callArgs[1].cf.cacheTtlByStatus['200-299']).toBe(360)
  expect(callArgs[1].cf.cacheEverything).toBe(true)
  expect(response.headers.get('edge-cache-ttl')).toBe('360')
})

test('does not apply cache when ttl is 0', async () => {
  const mockFetch = vi.fn().mockResolvedValue(new Response('ok'))
  vi.stubGlobal('fetch', mockFetch)

  const request = new Request('https://example.com')
  const response = await handleRequest(request, 0)

  expect(mockFetch).toHaveBeenCalled()
  const callArgs = mockFetch.mock.calls[0]
  expect(callArgs[1]).toEqual({})
  expect(response.headers.get('edge-cache-ttl')).toBe('0')
})
