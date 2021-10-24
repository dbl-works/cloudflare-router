interface Route {
  remote: string
  spa?: boolean
}

type RouteHandler = (request: Request) => Response

type BasicAuthMethod = {
  type: 'basic'
  username: string
  password: string
}

type AuthMethods = BasicAuthMethod

export interface Routes {
  [match: string]: string
  // [match: string]: string | Route | RouteHandler // TOOO: Add support for handlers and objects
}

export interface Config {
  deployments: Array<{
    accountId: string
    zoneId: string
    paths: string[]
    auth?: AuthMethods[]
  }>
  routes: Routes
}

export const DEFAULT_CONFIG: Config = {
  deployments: [],
  routes: {},
}
