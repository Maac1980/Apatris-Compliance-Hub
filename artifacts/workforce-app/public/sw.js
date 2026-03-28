const CACHE_NAME = "apatris-workforce-v1";
const OFFLINE_URLS = [
  "/workforce/",
  "/workforce/index.html",
];

// Install: cache essential assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_URLS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first with cache fallback
self.addEventListener("fetch", (event) => {
  // Skip non-GET and API requests
  if (event.request.method !== "GET" || event.request.url.includes("/api/")) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/workforce/index.html")))
  );
});

// Push notifications
self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? { title: "Apatris", body: "New notification" };
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/workforce/icons/icon-192.png",
      badge: "/workforce/icons/badge-72.png",
      tag: data.tag || "apatris-notification",
      data: data.url ? { url: data.url } : undefined,
    })
  );
});

// Notification click
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/workforce/dashboard";
  event.waitUntil(clients.openWindow(url));
});
