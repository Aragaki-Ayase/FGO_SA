import { proxyRequest } from '../_proxy.js';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const subpath = url.pathname.replace(/^\/atlas-api/, '');
  const targetUrl = `https://api.atlasacademy.io${subpath}${url.search}`;
  return proxyRequest(
    context.request,
    targetUrl,
    {
      'User-Agent': 'Mozilla/5.0 MooncellOfflineApp/1.0',
    },
    'public, max-age=3600',
  );
}
