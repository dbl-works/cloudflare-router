import { Config, Deployment } from '../config'

export const deploymentForRequest = (request: Request, config: Config): Deployment | undefined => {
  return config.deployments.find(deployment => {
    return deployment.routes.some(route => {
      const sanitizedRoute = route.replace(/[^a-zA-Z0-9*\.\-\/]/g, '') // We only really want to allow the pattern *.example.com/*
      const regexedRoute = sanitizedRoute.replace(/\./g, '\\.').replace(/\*/g, '(.*)')
      const normalizedUrl = request.url.replace(/https?:\/\//, '')
      return normalizedUrl.match(new RegExp(`^${regexedRoute}$`))
    })
  })
}
