importScripts("portal/uv.bundle.js");
importScripts("portal/uv.config.js");
importScripts("portal/uv.sw.js");

const uv = new UVServiceWorker();

async function handleRequest(t) {
  if (uv.route(t)) {
    return await uv.fetch(t);
  }
  return await fetch(t.request);
}

self.addEventListener("fetch", (t => {
  t.respondWith(handleRequest(t));
}));