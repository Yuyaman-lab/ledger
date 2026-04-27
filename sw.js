// ======================
// Service Worker - キャッシュファースト戦略
// PWA起動時に白フラッシュを防ぐため、HTML/CSSをキャッシュから即座に返す
// ======================

const CACHE_NAME = 'slot-ledger-v7';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js'
];

// インストール：コアファイルを事前キャッシュ
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

// アクティベーション：古いキャッシュを削除
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// フェッチ：キャッシュファースト → ネットワークフォールバック
// 成功したネットワーク応答でキャッシュを更新（Stale While Revalidate）
self.addEventListener('fetch', event => {
  const req = event.request;

  // GETリクエストのみキャッシュ対象
  if (req.method !== 'GET') return;

  // Google Fonts等の外部リソースはネットワークファースト
  if (!req.url.startsWith(self.location.origin)) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    );
    return;
  }

  // コアファイル：キャッシュファースト + バックグラウンド更新
  event.respondWith(
    caches.match(req).then(cached => {
      // バックグラウンドでキャッシュを更新
      const fetchPromise = fetch(req).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, clone));
        }
        return response;
      }).catch(() => cached);

      // キャッシュがあれば即座に返す（白フラッシュ防止の要）
      return cached || fetchPromise;
    })
  );
});
