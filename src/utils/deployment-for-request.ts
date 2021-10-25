import { Config, Deployment } from '../config'

export const deploymentForRequest = (request: Request, config: Config): Deployment | undefined => {
  return config.deployments.find(deployment => {
    const url = new URL(request.url)
    return deployment.routes.includes(`*${url.hostname}/*`)
  })
}
