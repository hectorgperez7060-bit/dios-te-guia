const CACHE = "dios-te-guia-v2";
const ESSENTIAL = ["/dios-te-guia/","/dios-te-guia/_headers","/dios-te-guia/app.js","/dios-te-guia/assets/index.css","/dios-te-guia/data/app-config.json","/dios-te-guia/data/lujan.pmtiles","/dios-te-guia/data/services.json","/dios-te-guia/icon-192.png","/dios-te-guia/icon-512.png","/dios-te-guia/logo-horizontal.png","/dios-te-guia/manifest.webmanifest","/dios-te-guia/maplibre-gl-worker.mjs","/dios-te-guia/styles.css"];
const BASE_PATH = "/dios-te-guia/";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ESSENTIAL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== location.origin) return;
  if (event.request.headers.has("range")) {
    event.respondWith(rangeResponse(event.request));
    return;
  }
  const pathname = new URL(event.request.url).pathname;
  event.respondWith(caches.match(pathname, { ignoreSearch: true, ignoreVary: true }).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(event.request, response.clone()));
    return response;
  }).catch(() => event.request.mode === "navigate" ? caches.match(BASE_PATH, { ignoreVary: true }) : Response.error())));
});

async function rangeResponse(request) {
  const cached = await caches.match(new URL(request.url).pathname, { ignoreSearch: true, ignoreVary: true });
  if (!cached) return fetch(request);
  const bytes = await cached.arrayBuffer();
  const match = /bytes=(\d+)-(\d*)/.exec(request.headers.get("range") || "");
  if (!match) return cached;
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : bytes.byteLength - 1;
  const end = Math.min(requestedEnd, bytes.byteLength - 1);
  if (start > end || start >= bytes.byteLength) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.byteLength}` } });
  }
  const chunk = bytes.slice(start, end + 1);
  return new Response(chunk, {
    status: 206,
    headers: {
      "Content-Type": cached.headers.get("Content-Type") || "application/octet-stream",
      "Accept-Ranges": "bytes",
      "Content-Range": `bytes ${start}-${end}/${bytes.byteLength}`,
      "Content-Length": String(chunk.byteLength)
    }
  });
}
