// https://github.com/cloudflare/workers-types/issues/8
export interface Caches {
  default: {
    put(request: Request | string, response: Response): Promise<undefined>
    match(request: Request | string): Promise<Response | undefined>
  }
}
