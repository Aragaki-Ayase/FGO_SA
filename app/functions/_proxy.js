/**
 * Shared proxy helper for Cloudflare Pages Functions.
 */
export async function proxyRequest(
  request,
  targetUrl,
  extraHeaders = {},
  cacheControl = 'public, max-age=3600',
) {
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

  const headers = new Headers(extraHeaders);
  const range = request.headers.get('range');
  if (range) {
    headers.set('range', range);
  }

  const upstream = await fetch(targetUrl, {
    method: request.method,
    headers,
    redirect: 'follow',
  });

  const outHeaders = new Headers();
  for (const key of [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'etag',
    'last-modified',
  ]) {
    const val = upstream.headers.get(key);
    if (val) {
      outHeaders.set(key, val);
    }
  }
  outHeaders.set('cache-control', cacheControl);
  outHeaders.set('access-control-allow-origin', '*');

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}
