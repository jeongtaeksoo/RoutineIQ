/* Minimal navigation fallback service worker (production only via SWRegister). */

const CACHE = "routineiq-pwa-v1";
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
      } catch {
        // Ignore; offline fallback is best-effort.
      }
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Only handle full-page navigations; let other requests pass through.
  if (event.request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(event.request);
        } catch {
          const cache = await caches.open(CACHE);
          const cached = await cache.match(OFFLINE_URL);
          if (cached) return cached;
          return new Response("Offline", { status: 503, headers: { "content-type": "text/plain" } });
        }
      })()
    );
  }
});

