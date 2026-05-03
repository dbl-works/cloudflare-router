import { Deployment } from '../config'

export interface CompiledDeployment {
  deployment: Deployment
  patterns: URLPattern[]
}

/**
 * Pre-compiles deployment route patterns into URLPattern instances.
 * Called once at router creation time to avoid per-request compilation.
 */
export const compileDeployments = (deployments: Deployment[]): CompiledDeployment[] => {
  return deployments.map(deployment => ({
    deployment,
    patterns: deployment.routes.map(route => new URLPattern(route)),
  }))
}

/**
 * Finds the deployment matching the incoming request URL.
 * Uses pre-compiled URLPattern instances for safe, fast matching.
 */
export const deploymentForRequest = (request: Request, compiledDeployments: CompiledDeployment[]): Deployment | undefined => {
  const match = compiledDeployments.find(({ patterns }) =>
    patterns.some(pattern => pattern.test(request.url))
  )
  return match?.deployment
}
