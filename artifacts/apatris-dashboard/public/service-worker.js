// Apatris Portal — Service Worker v4
// Strategy:
//   API calls         → Network-only (never cache)
//   Static assets     → Stale-While-Revalidate (serve from cache instantly,
//                        fetch update in background for next visit)
//   App shell (HTML)  → Network-first with cache fallback (always try fresh HTML,
//                        fall back to cached shell when offline)

const CACHE_VERSION = "apatris-v4";
const STATIC_EXTS = [".js", ".css", ".woff", ".woff2", ".ttf", ".png", ".jpg", ".jpeg", ".svg", ".ico", ".webp"];

// Assets to pre-cache immediately on install
const PRECACHE_URLS = [
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

// ── Install: pre-cache shell assets ──────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: delete stale caches ────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_VERSION)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch: route-based caching strategies ────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Skip non-GET and cross-origin (fonts.googleapis.com etc are fine to
  //    pass through; only same-origin assets need caching for offline support)
  if (request.method !== "GET") return;

  // 2. API calls → always network, never cache
  if (url.pathname.includes("/api/")) {
    event.respondWith(fetch(request));
    return;
  }

  // 3. Static assets (JS bundles, CSS, images, fonts)
  //    → Stale-While-Revalidate
  const isStatic = STATIC_EXTS.some((ext) => url.pathname.endsWith(ext));
  if (isStatic) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // 4. App shell HTML (navigation requests)
  //    → Network-first with cache fallback
  if (request.mode === "navigate") {
    event.respondWith(networkFirstWithFallback(request));
    return;
  }

  // 5. Everything else → Stale-While-Revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// ── Strategy implementations ──────────────────────────────────────────────────

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);

  // Kick off network fetch in the background to update cache
  const networkFetch = fetch(request)
    .then((response) => {
      if (response && response.status === 200 && response.type !== "opaque") {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  // Return cached immediately if available; otherwise wait for network
  return cached || (await networkFetch) || new Response("Offline", { status: 503 });
}

async function networkFirstWithFallback(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request) || await cache.match("./");
    if (cached) return cached;
    return new Response(
      `<!DOCTYPE html><html><body style="background:#0f172a;color:#fff;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
        <div style="text-align:center"><h2 style="color:#C41E18">APATRIS</h2><p>You're offline. Open the app when connected to load data.</p></div>
      </body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
}
