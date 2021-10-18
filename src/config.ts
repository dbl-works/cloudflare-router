interface Route {
  remote: string
  spa?: boolean
}

type RouteHandler = (request: Request) => Response

export interface Routes {
  [match: string]: string
  // [match: string]: string | Route | RouteHandler // TOOO: Add support for handlers and objects
}

export interface Config {
  deployments: Array<{
    accountId: string
    zoneId: string
    paths: string[]
  }>
  routes: Routes
}

export const DEFAULT_CONFIG: Config = {
  deployments: [],
  routes: {},
}
