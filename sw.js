const CACHE = "slot-ledger-v10";
const ASSETS = ["./","./index.html","./styles.css","./app.js","./manifest.webmanifest","./sw.js"];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    Promise.all([
      caches.keys().then(keys => Promise.all(keys.map(k => (k !== CACHE ? caches.delete(k) : null)))),
      self.clients.claim()
    ])
  );
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  );
});
