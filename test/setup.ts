/* eslint-disable */

import jestFetchMock from 'jest-fetch-mock'

jestFetchMock.enableMocks()

// Temporary mocks
global.addEventListener = ((eventName: string, listener: (event: EventListenerObject) => void) => {
  listener({
    request: new Request('https://exaple.com/'),
    respondWith: (response: Response) => {
      return response
    },
  } as any)
}) as any
global.FetchEvent = ((name: string, options: any) => {
  return {
    request: options.request,
    respondWith: (response: Response) => response,
  }
}) as any
