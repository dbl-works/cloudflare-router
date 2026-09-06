export type BasicAuthMethod = {
  type: 'basic'
  username: string
  password: string
}

export type IPAuthMethod = {
  type: 'ip'
  allow: string[]
}

export type AuthMethods = BasicAuthMethod | IPAuthMethod

export interface Route {
  origin: string
  auth?: AuthMethods[]
  edgeCacheTtl?: number
}

export type Routes = Record<string, string | Route>

export interface Config {
  routes: Routes
  auth?: AuthMethods[]
  isS3Site?: boolean
  edgeCacheTtl?: number
}

export const DEFAULT_CONFIG: Config = {
  routes: {},
  edgeCacheTtl: 86400,
}
