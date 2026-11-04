const CACHE = "dios-te-guia-v4";
const ESSENTIAL = ["/dios-te-guia/","/dios-te-guia/_headers","/dios-te-guia/app.js","/dios-te-guia/assets/index.css","/dios-te-guia/data/app-config.json","/dios-te-guia/data/lujan.pmtiles","/dios-te-guia/data/services.json","/dios-te-guia/fonts/Noto Sans Regular/0-255.pbf","/dios-te-guia/icon-192.png","/dios-te-guia/icon-512.png","/dios-te-guia/logo-horizontal.png","/dios-te-guia/manifest.webmanifest","/dios-te-guia/maplibre-gl-worker.mjs","/dios-te-guia/styles.css"];
const VERIFIED = {"/dios-te-guia/data/lujan.pmtiles":3103562};
const BASE_PATH = "/dios-te-guia/";

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== location.origin) return;
  if (event.request.headers.has("range")) {
    event.respondWith(rangeResponse(event.request));
    return;
  }
  const pathname = new URL(event.request.url).pathname;
  event.respondWith(cacheLookup(pathname).then((cached) => cached || fetch(event.request).then((response) => {
    if (response.ok && response.status === 200) {
      caches.open(CACHE).then((cache) => cache.put(pathname, response.clone()));
    }
    return response;
  }).catch(() => event.request.mode === "navigate" ? cacheLookup(BASE_PATH) : Response.error())));
});

self.addEventListener("message", (event) => {
  if (event.data === "verify-offline") {
    event.waitUntil(verifyAll().then((report) => event.source?.postMessage({ type: "offline-report", report })));
  }
});

async function precache() {
  const cache = await caches.open(CACHE);
  const plain = ESSENTIAL.filter((url) => !(url in VERIFIED));
  await cache.addAll(plain);
  await Promise.all(Object.keys(VERIFIED).map((url) => storeVerified(cache, url)));
}

// Los archivos grandes se piden por fragmentos. Si la caché HTTP del navegador
// devuelve un fragmento como si fuera el archivo completo, el mapa queda
// inservible sin señal. Por eso se descarga sin usar esa caché y se comprueba
// el tamaño real antes de guardarlo.
async function storeVerified(cache, url) {
  const expected = VERIFIED[url];
  for (const attempt of [url, `${url}?full=${expected}`]) {
    try {
      const response = await fetch(attempt, { cache: "reload" });
      if (!response.ok || response.status !== 200) continue;
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength !== expected) continue;
      await cache.put(url, new Response(buffer, {
        status: 200,
        headers: {
          "Content-Type": response.headers.get("Content-Type") || "application/octet-stream",
          "Content-Length": String(expected),
          "Accept-Ranges": "bytes"
        }
      }));
      return true;
    } catch {
      // Se intenta con la siguiente variante.
    }
  }
  return false;
}

async function cacheLookup(pathname) {
  const cached = await caches.match(pathname, { ignoreSearch: true, ignoreVary: true });
  if (!cached) return null;
  if (!(pathname in VERIFIED)) return cached;
  const declared = Number(cached.headers.get("Content-Length"));
  return declared === VERIFIED[pathname] ? cached : null;
}

async function rangeResponse(request) {
  const pathname = new URL(request.url).pathname;
  let cached = await cacheLookup(pathname);
  if (!cached && pathname in VERIFIED) {
    const cache = await caches.open(CACHE);
    if (await storeVerified(cache, pathname)) cached = await cacheLookup(pathname);
  }
  if (!cached) return fetch(request);

  const bytes = await cached.arrayBuffer();
  const match = /bytes=(\d+)-(\d*)/.exec(request.headers.get("range") || "");
  if (!match) return new Response(bytes, { status: 200, headers: cached.headers });

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

async function verifyAll() {
  const cache = await caches.open(CACHE);
  const missing = [];
  for (const url of ESSENTIAL) {
    const entry = await cacheLookup(url);
    if (!entry) missing.push(url);
  }
  return { ready: missing.length === 0, missing, total: ESSENTIAL.length };
}
