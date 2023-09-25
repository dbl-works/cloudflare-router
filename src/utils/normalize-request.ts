import { Config } from '../config';

const MEDIA_FILE_EXTENSIONS = new Set('css gif ico jpg js otf jpeg png svg ttf webp woff woff2 csv json'.split(' '));

const hasMediaFileExtension = (path: string): boolean => MEDIA_FILE_EXTENSIONS.has(path.split('.').pop()?.toLowerCase() || '');


export default function normalizeRequest(request: Request, routes: Config['routes']): { request: Request, cache: boolean } {
  const url = new URL(request.url);
  const originalUrlWithoutScheme = url.hostname + url.pathname;
  const path = originalUrlWithoutScheme.replace(/^.*?\//gi, '');

  for (const [route, replacement] of Object.entries(routes)) {
    if (request.url.includes(route) && (originalUrlWithoutScheme.startsWith(route) || route.startsWith('/'))) {
      let newUrl = replacement;
      const singlePageApp = newUrl.startsWith('s3://');
  
      const isMediaFile = hasMediaFileExtension(request.url)
      if (singlePageApp) {
        newUrl = newUrl.replace(new RegExp('s3://([^.]+).([^/]+)(/?)(.*)'), 'https://s3.$1.amazonaws.com/$2$3$4')
      }

      let updatedUrl = originalUrlWithoutScheme.replace(route, newUrl)
      if (singlePageApp && !isMediaFile) {
        updatedUrl = newUrl + '/index.html'
      }
      updatedUrl += newUrl.endsWith('/') ? updatedUrl + path : ''
      if (!updatedUrl.startsWith('https://')) {
        updatedUrl = 'https://' + updatedUrl
      }

      return { request: new Request(updatedUrl), cache: true };
    }
  }

  return { request, cache: false };
}
