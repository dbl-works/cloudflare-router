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

export interface Deployment {
  accountId: string
  zoneId: string
  routes: string[]
  auth?: AuthMethods[]
}

export interface Config {
  deployments: Deployment[]
  routes: Routes
}

export const DEFAULT_CONFIG: Config = {
  deployments: [],
  routes: {},
}
