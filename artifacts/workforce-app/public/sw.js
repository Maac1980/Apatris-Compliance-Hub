const CACHE_NAME = "apatris-workforce-v1";

// Assets to cache on install (shell)
const SHELL_ASSETS = [
  "/workforce/",
  "/workforce/manifest.json",
];

// Install — cache the app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

// Activate — delete old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch strategy:
//   - API calls (/api/*) → network only, never cache
//   - Everything else  → network first, fall back to cache
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache API or external requests
  if (url.pathname.startsWith("/api/") || url.origin !== self.location.origin) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Network-first for all app assets
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
