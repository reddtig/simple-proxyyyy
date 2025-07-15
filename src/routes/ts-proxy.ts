export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Construct the target backend URL by forwarding the path and query
    const targetURL = `https://server.fifthwit.net${url.pathname}${url.search}`;

    const cache = caches.default;
    const cacheKey = new Request(targetURL, request);

    // Try serving from Cloudflare edge cache
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      return new Response(cachedResponse.body, {
        status: cachedResponse.status,
        statusText: cachedResponse.statusText,
        headers: {
          ...Object.fromEntries(cachedResponse.headers),
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    // Fetch from origin backend
    const backendResponse = await fetch(targetURL, {
      method: request.method,
      headers: request.headers,
      redirect: 'follow',
      cf: {
        cacheEverything: true, // Enable caching for all responses, even non-GET
        cacheTtl: 3600,        // Cache for 1 hour at Cloudflare edge
      },
    });

    // If fetch failed, return error as-is
    if (!backendResponse.ok) {
      return backendResponse;
    }

    // Create a new response streaming from the backend
    const response = new Response(backendResponse.body, backendResponse);

    // Set CORS and cache headers
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Headers', '*');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    newHeaders.set('Cache-Control', 'public, max-age=3600');

    // Return response with new headers
    const finalResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });

    // Cache the response asynchronously (don't wait for cache put)
    event.waitUntil(cache.put(cacheKey, finalResponse.clone()));

    return finalResponse;
  }
};
