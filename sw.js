const CACHE = "slot-ledger-v20";
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
    caches.open(CACHE).then((c) => c.addAll(ASSETS))
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    Promise.all([
      caches.keys().then(keys =>
        Promise.all(keys.map(k => (k !== CACHE ? caches.delete(k) : null)))
      ),
      self.clients.claim()
    ])
  );
});

// ★重要：更新が反映されるように「CSS/JS/HTMLはネット優先」にする
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // 同一オリジンだけ扱う（GitHub Pages内）
  if (url.origin !== location.origin) return;

  const isHTML = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
  const isCSS  = url.pathname.endsWith(".css");
  const isJS   = url.pathname.endsWith(".js");

  // HTML/CSS/JS は network-first（最新版を取りに行く）
  if (isHTML || isCSS || isJS) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // その他は cache-first
  e.respondWith(
    caches.match(req).then(res => res || fetch(req