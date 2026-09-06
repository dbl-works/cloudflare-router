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
  /** Serve index.html for navigations. Defaults to true for storage origins such as s3://. */
  spa?: boolean
  /** Forward CORS preflights without authentication. Defaults to true for storage origins such as s3://. */
  cors?: boolean
}

export type Routes = Record<string, string | Route>

export interface Config {
  routes: Routes
  auth?: AuthMethods[]
  edgeCacheTtl?: number
  spa?: boolean
  cors?: boolean
}
