import { proxyRequest } from './_proxy.js';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const targetUrl = `https://fgo.wiki/api.php${url.search}`;
  return proxyRequest(
    context.request,
    targetUrl,
    {
      'User-Agent': 'MooncellOfflineApp/1.0 (cloud proxy)',
      Referer: 'https://fgo.wiki/',
    },
    'public, max-age=300',
  );
}
