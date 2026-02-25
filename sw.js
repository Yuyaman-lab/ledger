const CACHE_NAME = 'ledger-v2'; // ★Bug修正: CACHE → CACHE_NAME に統一
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./sw.js"
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)) // ★修正
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    Promise.all([
      caches.keys().then(keys =>
        Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null))) // ★修正
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  if (url.origin !== location.origin) return;

  const isHTML = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
  const isCSS  = url.pathname.endsWith(".css");
  const isJS   = url.pathname.endsWith(".js");

  if (isHTML || isCSS || isJS) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy)); // ★修正
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // ★Bug修正: 末尾の閉じカッコ不足を修正
  e.respondWith(
    caches.match(req).then(res => res || fetch(req))
  );
});
