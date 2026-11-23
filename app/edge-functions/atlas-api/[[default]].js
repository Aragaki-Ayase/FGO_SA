export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': '*',
      },
    });
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const url = new URL(request.url);
  const subpath = url.pathname.replace(/^\/atlas-api/, '');
  const targetUrl = `https://api.atlasacademy.io${subpath}${url.search}`;

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers: {
      'User-Agent': 'Mozilla/5.0 MooncellOfflineApp/1.0',
    },
    redirect: 'follow',
  });

  const outHeaders = new Headers();
  for (const key of ['content-type', 'content-length', 'etag', 'last-modified']) {
    const val = upstream.headers.get(key);
    if (val) outHeaders.set(key, val);
  }
  outHeaders.set('cache-control', 'public, max-age=3600');
  outHeaders.set('access-control-allow-origin', '*');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}

export default onRequest;
