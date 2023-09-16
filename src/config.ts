interface Route {
  remote: string
  spa?: boolean
}

type RouteHandler = (request: Request) => Response

export type BasicAuthMethod = {
  type: 'basic'
  username: string
  password: string
}

export type IPAuthMethod = {
  type: 'ip',
  allow: string[],
}

export type AuthMethods = BasicAuthMethod | IPAuthMethod

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
  edgeCacheTtl?: number
}

export const DEFAULT_CONFIG: Config = {
  deployments: [],
  routes: {},
  edgeCacheTtl: 86400
}
