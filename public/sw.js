const CACHE_NAME = "ez2savemore-shell-v1";
const APP_SHELL = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/")));
    return;
  }

  if (!["script", "style", "image", "font", "manifest"].includes(request.destination)) return;
  event.respondWith(
    caches.match(request).then(async (cached) => {
      if (cached) {
        event.waitUntil(
          fetch(request)
            .then((response) => response.ok ? caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone())) : undefined)
            .catch(() => undefined)
        );
        return cached;
      }
      const response = await fetch(request);
      if (response.ok) await caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
      return response;
    })
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const safePath = typeof payload.url === "string" && payload.url.startsWith("/") && !payload.url.startsWith("//")
    ? payload.url
    : "/?open=dashboard";
  event.waitUntil(
    self.registration.showNotification("Ez2SaveMore 財務提醒", {
      body: "你有一筆款項或到期事項需要確認，登入後查看詳情。",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: typeof payload.tag === "string" ? payload.tag.slice(0, 180) : "ez2savemore-reminder",
      renotify: true,
      data: { url: safePath }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.url || "/?open=dashboard";
  const targetUrl = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      for (const client of clients) {
        if ("navigate" in client) await client.navigate(targetUrl);
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
