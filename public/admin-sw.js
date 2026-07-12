// Admin Service Worker — standalone caching for /admin route
const CACHE_NAME = "apna-admin-v1.0";
const ADMIN_URLS = ["/admin", "/admin-manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ADMIN_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Network-first for admin pages, cache fallback
  if (event.request.url.includes("/admin") || event.request.url.includes("/api")) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Cache successful responses
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache
          return caches.match(event.request).then((cached) => cached || caches.match("/admin"));
        })
    );
  }
});
