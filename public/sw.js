importScripts("portal/uv.bundle.js");
importScripts("portal/uv.config.js");
importScripts("portal/uv.sw.js");

const uv = new UVServiceWorker();

async function handleRequest(t) {
  if (uv.route(t)) {
    const prefix = self.__uv$config.prefix;
    const urlStr = t.request.url;
    
    // Check if this is a proxied request for our blocked streaming domains
    const originWithPrefix = location.origin + prefix;
    if (urlStr.startsWith(originWithPrefix) || urlStr.startsWith(prefix)) {
      const idx = urlStr.indexOf(prefix) + prefix.length;
      const encoded = urlStr.substring(idx);
      try {
        const decoded = self.__uv$config.decodeUrl(encoded);
        // If it's a streaming site that throws Error 35 in Libcurl, redirect to load it natively!
        if (decoded && (decoded.includes('vidlink.pro') || decoded.includes('vidsrc'))) {
          return Response.redirect(decoded, 302);
        }
      } catch (e) {
        // Fallback to normal proxying if decoding fails
      }
    }
    
    return await uv.fetch(t);
  }
  return await fetch(t.request);
}

self.addEventListener("fetch", (t => {
  t.respondWith(handleRequest(t));
}));