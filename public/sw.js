// Apna Cricket - Service Worker v3.0
// PWA with offline mode — caches teams + match list for offline viewing.
// v3.0: Bumped cache version to force-clear old JS (team generation fix)

const CACHE_NAME = 'apna-cricket-v3.0';
const DYNAMIC_CACHE = 'apna-cricket-dynamic-v3.0';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/logo.png',
  '/logo-square.png',
  '/logo-full.png',
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Some assets failed to cache:', err);
      });
    })
  );
  self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== DYNAMIC_CACHE)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  // Cache teams for offline viewing (POST message from app)
  if (event.data && event.data.type === 'CACHE_TEAMS') {
    caches.open(DYNAMIC_CACHE).then((cache) => {
      const resp = new Response(JSON.stringify(event.data.payload || []), {
        headers: { 'Content-Type': 'application/json' },
      });
      cache.put('/__offline/teams', resp);
    });
  }
  // Cache matches for offline viewing
  if (event.data && event.data.type === 'CACHE_MATCHES') {
    caches.open(DYNAMIC_CACHE).then((cache) => {
      const resp = new Response(JSON.stringify(event.data.payload || []), {
        headers: { 'Content-Type': 'application/json' },
      });
      cache.put('/__offline/matches', resp);
    });
  }
});

// Fetch event - network first, cache fallback strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Skip chrome extension requests
  if (url.protocol === 'chrome-extension:') return;

  // Skip cross-origin requests (e.g. fantasy platform APIs, images from CDNs)
  if (url.origin !== self.location.origin) return;

  // Offline team/match cache endpoints
  if (url.pathname === '/__offline/teams' || url.pathname === '/__offline/matches') {
    event.respondWith(
      caches.match(request).then((cached) => cached || new Response('[]', {
        headers: { 'Content-Type': 'application/json' },
      }))
    );
    return;
  }

  // For navigation requests (HTML pages) - network first, cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, cloned);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cached) => {
            return cached || caches.match('/');
          });
        })
    );
    return;
  }

  // Skip API calls (must always go to network)
  if (url.pathname.startsWith('/api/')) return;

  // For static assets - stale-while-revalidate
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2)$/) ||
    url.pathname.startsWith('/_next/static/')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((response) => {
          if (response.ok) {
            const cloned = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, cloned);
            });
          }
          return response;
        }).catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }

  // Default: network first
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && request.url.startsWith(self.location.origin)) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, cloned);
          });
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
