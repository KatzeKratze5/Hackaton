// Змінюйте номер версії щоразу, коли оновлюєте файли
const CACHE_VERSION = "v3";
const CACHE_NAME = "pomichnyk-" + CACHE_VERSION;
const FILES = ["./", "index.html", "style.css", "app.js", "config.js", "config.json",
  "settings.html", "settings.js", "diag.html", "diag.js", "manifest.json",
  "icon.svg", "icon-180.png", "icon-192.png", "icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("pomichnyk-") && k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // config.json: спочатку мережа (щоб нові налаштування діяли без зміни версії), без мережі з кешу
  if (url.origin === location.origin && url.pathname.endsWith("/config.json")) {
    event.respondWith(
      fetch(event.request, { cache: "no-store" }).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, copy));
        }
        return res;
      }).catch(() => caches.match(event.request))
    );
    return;
  }
  // Решта: спочатку кеш, потім мережа
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
