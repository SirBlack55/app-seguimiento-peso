const CACHE_NAME = "mi-peso-cache-v3";
const APP_ROOT = new URL("./", self.location.href);
const APP_SHELL = [
  "./",
  "index.html",
  "app.js",
  "styles.css",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "icons/apple-touch-icon.png",
].map((path) => new URL(path, APP_ROOT).href);
const NETWORK_FIRST_URLS = new Set(
  ["./", "index.html", "app.js", "styles.css", "manifest.webmanifest"].map(
    (path) => new URL(path, APP_ROOT).href,
  ),
);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (request.mode === "navigate" || (isSameOrigin && NETWORK_FIRST_URLS.has(url.href))) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const networkResponse = fetch(request)
        .then((response) => {
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }

          return response;
        })
        .catch(() => cachedResponse);

      return cachedResponse || networkResponse;
    }),
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request.mode === "navigate" ? APP_ROOT.href : request, response.clone());
    }
    return response;
  } catch {
    return (
      (await caches.match(request)) ||
      (await caches.match(APP_ROOT.href)) ||
      (await caches.match(new URL("index.html", APP_ROOT).href))
    );
  }
}
