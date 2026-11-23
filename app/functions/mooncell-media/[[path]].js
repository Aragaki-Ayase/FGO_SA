import { proxyRequest } from '../_proxy.js';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const subpath = url.pathname.replace(/^\/mooncell-media/, '');
  const targetUrl = `https://media.fgo.wiki${subpath}${url.search}`;
  return proxyRequest(
    context.request,
    targetUrl,
    {
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://fgo.wiki/',
    },
    'public, max-age=604800',
  );
}
